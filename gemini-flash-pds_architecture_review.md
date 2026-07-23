# Deep-Dive Code & Architectural Review: ViksitPDS across Mock & Fabric Modes

This review deconstructs the architectural behavior, security, and scalability of the **ViksitPDS** codebase in both its mock/demo and live/fabric environments.

---

## 1. Trace of Execution Paths: Mock vs. Live/Fabric Mode

To evaluate scalability, we must trace how a mutating transaction (e.g., dispatching a lot) flows through the system in different configurations.

```mermaid
graph TD
    subgraph REST API (NestJS Process)
        A[POST /transfers] --> B[PdsLedgerFacade / PdsRuntime]
        B --> C[PdsLedgerEngine - In Memory Map Mutation]
        C --> D[persist]
    end

    subgraph Postgres Persistence (Both Modes)
        D -->|port.saveState| E[PostgresPdsLedgerPort]
        E -->|TRUNCATE & Bulk Insert| F[(PostgreSQL Tables)]
    end

    subgraph Outbox Queue (Live/Fabric Mode Only)
        D -->|port.appendEvents| G[Insert into ledger_outbox]
        G -->|status = PENDING| H[(PostgreSQL outbox)]
        I[Outbox Poller Worker] -->|FOR UPDATE SKIP LOCKED| H
        I -->|submitLedgerEventAsync| J[Fabric Gateway Client]
    end

    subgraph Blockchain Peers (Fabric Network)
        J -->|RecordLedgerProof| K[Chaincode on Peer Node]
        K -->|O1 putState| L[(Fabric Ledger - CouchDB)]
    end
```

---

## 2. API Process Memory Footprint (Both Modes)

> [!IMPORTANT]
> **The NestJS API process retains the in-memory engine and snapshot-persistence limitation in BOTH mock and live/fabric modes.**

* **The Code Path:** When running in `ledgerMode: 'fabric'`, the API initializes via [ledger-port-factory.ts](file:///home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/ledger/ledger-port-factory.ts#L22):
  ```typescript
  return new FabricGatewayLedgerPort(config, adapter);
  ```
  `FabricGatewayLedgerPort` wraps `PostgresPdsLedgerPort`.
* **State Loading:** On startup, the NestJS API calls `bootstrapFromPersistenceAsync()` which invokes `loadState()`. This queries every table in PostgreSQL (`SELECT *`) to load all stakeholders, lots, allocations, events, entitlements, and stock positions, hydrating them into Javascript `Map` objects in the API process's RAM ([postgres-adapter.ts](file:///home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/infrastructure/postgres-adapter.ts#L56)).
* **State Mutating:** Every REST request executes the business logic on the in-memory maps and calls `persist()`. This executes `buildSnapshotWritePlan()` which runs a `TRUNCATE` and inserts every single record back into PostgreSQL ([postgres-snapshot.ts](file:///home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/infrastructure/postgres-snapshot.ts#L150)).
* **Impact at Scale:**
  * **Memory Exhaustion (OOM):** For a government-scale deployment with millions of historical records, the NestJS API process will crash due to Node.js heap limit exhaustion.
  * **Zero Concurrency:** Multiple API replicas cannot run in parallel because concurrent snapshot transactions will fail or truncate each other's inserts.
  * **Remediation:** As noted in the [mvp-hardening-plan.md](file:///home/ramana/work/sources/cc/toomoki-cdac-pds/docs/implementation/mvp-hardening-plan.md#L13), Phase 2 (replacing full-state snapshot persistence with row-scoped repositories and command handlers) remains a critical deferred task.

---

## 3. Fabric Peer Chaincode Container Memory Footprint

The scalability and memory footprint of the Hyperledger Fabric peers differ significantly depending on the execution path.

### Path A: Normal Production Operations (Outbox Proofs)
* **The Code Path:** In live mode, the outbox worker ONLY submits proofs using the `RecordLedgerProof` transaction ([fabric-gateway.client.ts](file:///home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/fabric/fabric-gateway.client.ts#L98)).
* **Peer State Access:**
  ```typescript
  // contract.ts
  const proofKey = ctx.stub.createCompositeKey('proof', [proof.eventId]);
  const existing = await ctx.stub.getState(proofKey);
  ...
  await ctx.stub.putState(proofKey, Buffer.from(JSON.stringify({ docType: 'proof', proof, fabricTxId: txId })));
  ```
* **Performance Characteristics:**
  * **O(1) Execution:** It accesses and writes *only* the specific `proof` composite key.
  * **No Collection Loading:** It bypasses `loadCollection()` entirely.
  * **Scaling Capability:** During normal production run, the Fabric chaincode runs with optimal memory efficiency and high throughput. It does not suffer from OOM or MVCC write collisions on-chain.

### Path B: Compatibility Operations (Direct Smart Contract Invocation)
* **The Code Path:** If external clients or integration scripts invoke named business transactions (like `RegisterStakeholder`, `IssueRationCard`, `ActivateRationCard`, `CreateMonthlyEntitlement`) directly on-chain.
* **Peer State Access:**
  ```typescript
  // contract.ts
  const [rationCards, events] = await Promise.all([
    loadCollection<RationCard>(ctx, 'rationCards'),
    loadCollection<LedgerEvent>(ctx, 'events')
  ]);
  ```
* **Performance Characteristics:**
  * **O(N) Scans:** `loadCollection` executes a CouchDB prefix scan (`getStateByPartialCompositeKey`), loading the entire array of entities into the Node.js smart contract container memory ([contract-base.ts](file:///home/ramana/work/sources/cc/toomoki-cdac-pds/blockchain/chaincode/pds-chaincode/src/contract-base.ts#L80)).
  * **MVCC Collisions:** `saveCollection` rewrites every item back to the ledger. Concurrent calls will clash on key ranges, resulting in rejected blocks.
  * **Memory Exhaustion:** Under real transaction volume, the peer's chaincode Docker containers will run out of memory or timeout during CouchDB scans.

---

## 4. Operational Boundaries & Split-Brain Risks

### Transaction Drift
In [pds-runtime.ts](file:///home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/core/pds-runtime.ts#L294), the API persists the PostgreSQL snapshot (`this.port.saveState(state)`) and appends events to the outbox (`this.port.appendEvents(newEvents)`) as sequential async operations. Because they are not bound to the same PostgreSQL transaction:
* If the NestJS API process crashes or loses database connection immediately after `saveState` commits but before `appendEvents` completes, PostgreSQL operational data is successfully modified, but the outbox entry is lost.
* This leads to permanent **split-brain** state: the operational DB has processed the movement, but no ledger proof is ever submitted to Fabric.

---

## 5. Security Architecture: Missing REST Guards

Although the smart contract enforces on-chain MSP checks ([authorization.ts](file:///home/ramana/work/sources/cc/toomoki-cdac-pds/blockchain/chaincode/pds-chaincode/src/authorization.ts#L62)) for direct Fabric invokers:
* The NestJS controllers (e.g., [transfers.controller.ts](file:///home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/transfers/transfers.controller.ts#L26)) have no authentication guards.
* Anyone can make HTTP POST requests to the API to dispatch/receive lots or authorize movements, mutating the operational PostgreSQL database.

---

## Summary of Architectural Evaluation

| Component | Execution Mode | Bottleneck Status | Scalability / OOM Impact |
| :--- | :--- | :--- | :--- |
| **NestJS API Operational DB** | **Mock & Live/Fabric** | **TRUNCATE & full snapshot load** | **High OOM Risk:** Linear performance decay; OOM crashes on large histories. |
| **Fabric Peers (Production Path)** | **Live/Fabric (Outbox)** | **O(1) `RecordLedgerProof`** | **Safe:** Extremely lightweight; no collection scanning. |
| **Fabric Peers (Compatibility Path)** | **Direct CLI/SDK Calls** | **O(N) `loadCollection` scans** | **High OOM Risk:** CouchDB prefix scans will OOM/timeout. |
| **Transaction Boundary** | **Live/Fabric** | **Unbound sequential async calls** | **Drift Risk:** Process crashes cause database vs. ledger mismatch. |
| **REST API Security** | **Mock & Live/Fabric** | **Public endpoints** | **Security Vulnerability:** Bypasses operational authorization. |
