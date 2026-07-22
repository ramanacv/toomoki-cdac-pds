# GPT-5.6 Quick Architecture Analysis

This review covers the current working tree on `feature/fabric-hardening`, with particular focus on the workflow engine, quantity calculations across lot movements, and the Hyperledger Fabric design and deployment model.

## Findings

### 1. Critical: Chaincode execution is nondeterministic

The shared ledger engine generates `randomUUID()` values and wall-clock timestamps while executing chaincode for event IDs and audit alerts. Different endorsing peers can therefore produce different read/write sets and reject the transaction. The current `OR` endorsement policy often masks this by requiring only one peer.

Chaincode must derive IDs and timestamps from `ctx.stub.getTxID()` and the Fabric transaction timestamp.

Relevant code:

- `blockchain/chaincode/pds-chaincode/src/index.ts:1382`
- `blockchain/chaincode/pds-chaincode/src/index.ts:1403`

### 2. Critical: Lot quantities are not conserved at lot level

Dispatch validates pooled stakeholder/commodity stock, not the selected lot's remaining quantity. If an owner has multiple rice lots, a transfer can dispatch more than the chosen lot contains. A partial dispatch also marks the entire lot `DISPATCHED`, and receipt transfers ownership of the entire lot even when only part moved.

The model needs either immutable child lots for splits or explicit per-lot balances and movement lines. The existing `stock_positions.lot_id` is currently unused by snapshot persistence.

Relevant code:

- `blockchain/chaincode/pds-chaincode/src/index.ts:515`
- `blockchain/chaincode/pds-chaincode/src/index.ts:566`
- `blockchain/chaincode/pds-chaincode/src/index.ts:635`

### 3. High: Postgres state and Fabric submission are not atomic

Each command rewrites the complete Postgres snapshot, commits it, and only afterward appends events and outbox rows. A failure between those operations leaves committed business state with no Fabric outbox record.

The snapshot itself uses full-table `TRUNCATE` and rebuild, making multiple API replicas unsafe: a stale replica can overwrite newer state.

Business updates, domain events, and outbox insertion should occur in one database transaction using incremental row updates and optimistic locking.

Relevant code:

- `apps/api/src/modules/core/pds-runtime.ts:288`
- `apps/api/src/modules/fabric/fabric-gateway.ledger-port.ts:42`
- `apps/api/src/infrastructure/postgres-snapshot.ts:150`

### 4. High: Fabric mode acknowledges business success before Fabric validation

The API applies a command locally and returns after Postgres persistence. Fabric re-executes the named command asynchronously later. Fabric can reject it because of endorsement, MSP authorization, ordering, or divergent state, while the caller has already received success.

Failed events stop after five retries, and there is no compensation or workflow state such as `LEDGER_PENDING` or `LEDGER_REJECTED`.

The returned `ledgerTxId` is also an application UUID, while the gateway creates another synthetic envelope ID and ignores the actual Fabric transaction ID returned by chaincode. Traceability therefore cannot reliably correlate API, outbox, and Fabric transactions.

Relevant code:

- `apps/api/src/modules/fabric/fabric-client.ts:62`
- `apps/api/src/modules/fabric/fabric-gateway.client.ts:46`

### 5. High: Role enforcement is largely nominal

`BusinessAuthGuard` supports role restrictions, but `optionsFor()` always returns an empty configuration, so every authenticated role can call every business endpoint.

The gateway then submits all transactions using one configured Fabric identity, normally `FoodAndCivilSuppliesMSP`. Consequently, the procurement, FPS, godown, department, or auditor identity of the API caller is not represented on-chain, and chaincode MSP checks do not prove who initiated the request.

Relevant code:

- `apps/api/src/modules/auth/auth.guard.ts:69`

### 6. High: The workflow engine is currently a domain state machine, not an extensible engine

Transitions are embedded across imperative methods, controllers, authorization checks, and event replay. There is no common transition definition, command idempotency key, workflow version, actor binding, reservation model, or durable pending-step state.

For example, movement authorization can be recorded before a transfer exists and is later discovered by scanning prior events.

The current approach is adequate for a demo, but adding approval tiers, rejection and rework, timeout escalation, partial movement, or integration retries will make behavior increasingly difficult to reason about.

Relevant code:

- `blockchain/chaincode/pds-chaincode/src/index.ts:519`

### 7. Medium: Shortage handling does not preserve physical accountability

Dispatch removes the full quantity, while receipt adds only the received quantity. The shortage disappears from tracked stock and is represented only by an alert.

For audit-grade mass balance, shortages should move into an explicit loss, damage, or investigation account so the conservation equation remains:

```text
opening + receipts - dispatches - distributions - declared losses = closing
```

### 8. Medium: The deployed Fabric topology does not match the intended governance model

The documented model has five organizations, but deployment provides only the Food Department and Godown organizations. Procurement, FPS, and Audit MSPs exist only in manifests and authorization tables, so they cannot independently endorse or submit transactions.

The stack also has one orderer and one peer per deployed organization, making every node a single point of failure. This is acceptable as a local demonstration but should be described as a trust simulation rather than the target consortium deployment.

Relevant code:

- `blockchain/fabric-network/docker-compose.fabric.yml:8`

## Recommended Direction

Prioritize the work in this order:

1. Make all chaincode execution deterministic.
2. Introduce per-lot balances and child-lot splitting with conservation tests.
3. Replace snapshot truncation with transactional command handlers and an atomic outbox.
4. Define an explicit workflow transition model with idempotency and actor context.
5. Decide whether Fabric is authoritative command execution or an asynchronous audit ledger; the current design combines both.
6. Bind authenticated application identities to organization-specific Fabric gateway identities.
7. Expand the topology only after the two-organization model passes deterministic multi-endorser testing.

## Verification State

The review was performed against the current `feature/fabric-hardening` working tree, which contains substantial uncommitted work. It therefore does not describe only the previously pulled `main` branch.

The test suite was red during review:

- Seven chaincode contract tests failed because the test Fabric stub lacked `getStateByPartialCompositeKey`.
- API HTTP tests could not acquire a listening port in the sandbox.
- The remaining API, web, fixture, shared-type, and chaincode engine tests passed.

No architecture or production code was changed as part of the review.
