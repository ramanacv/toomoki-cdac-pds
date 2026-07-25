# ViksitPDS POC/MVP: Architectural and Functional Review

> Historical review snapshot. Use the maintained product requirements,
> architecture, and hardening trackers for current behavior.

This document compares an earlier **ViksitPDS** proof-of-concept against the
[CDAC Problem Statement](../requirements/cdac-problem-statement.md).

---

## 1. PDS Entities & Roles Comparison

The ViksitPDS MVP models the supply chain actors as `Stakeholder` types. The table below compares the app's stakeholders and representations with their real-world counterparts in the Indian PDS ecosystem.

### Entity Mapping Table

| App Stakeholder / Entity | Holds Stock? | Role in ViksitPDS App | Counterpart in Typical Indian PDS | Real-World Differences / Simplifications |
| :--- | :---: | :--- | :--- | :--- |
| **`PROCUREMENT_CENTER`** | Yes | Originates commodity lots (e.g., Rice) and dispatches to FCI. | PACS (Primary Agricultural Credit Societies), State agencies, or local grain mandis. | Paddy milling is omitted. In India, procured paddy is sent to private millers for milling before being deposited in FCI depots as rice. |
| **`FCI`** | Yes | Receives from procurement yards, stores, and dispatches to state godowns (Stage-I). | Food Corporation of India (Central Depot). | FCI handles central buffer stocks, open market sales, and interstate movement, which are simplified to linear dispatches. |
| **`STATE_GODOWN`** | Yes | Receives bulk stock, dispatches to Issue Points (Stage-II movement). | State Civil Supplies Corporation / SWC / CWC warehouses. | Typical systems involve multiple hierarchy tiers (divisional, district, taluka warehouses) that are flattened here. |
| **`ISSUE_POINT`** | Yes | Final upstream custody node; allocates stock to FPS. | Block-level sub-depots / Base depots. | State godowns and block depots are often the same storage infrastructure under different management. |
| **`FAIR_PRICE_SHOP`** | Yes | Receives allocated stock and distributes to beneficiaries. | FPS / Ration Shop (Kotedar/Dealer). | Operates using electronic Point of Sale (ePoS) devices with biometric scanners and receipt printers. |
| **`DISTRICT_SUPPLY_OFFICE`**| No | Approves "RO-lite" movement orders from godowns. | DSO (District Supply Officer) / FSO (Food Security Officer). | Handles ration card approvals, dealer licensing, and physical inspections. |
| **`TRANSPORTER`** | No | Used as transport evidence on dispatches. | Contracted transport agents (doorstep delivery). | Tracks GPS location, vehicle telemetry, route optimization (mostly out-of-scope for MVP). |
| **`AUDITOR`** | No | Views trace history, alerts, and transaction verification. | Vigilance Committees, Social Audit teams, state auditors. | Reviews physical stock registers, citizen complaints, and reconciliation reports. |
| **`BENEFICIARY`** (Not a Stakeholder) | No | Represented as hashes (`beneficiary-hash`, `ration-card-hash`) + monthly entitlements. | Citizens / Households holding AAY (Antyodaya Anna Yojana), PHH, APL, or BPL cards. | Simplified to a single mock card category. Real-world systems manage detailed family compositions, category-specific pricing, and variable monthly entitlements. |

---

## 2. Workflow & Flow Comparison

The ViksitPDS POC models a sequential commodity lifecycle. The diagram below illustrates how the MVP's flow matches or deviates from a real-world Indian PDS flow.

```mermaid
sequenceDiagram
    autonumber
    actor Farmer
    participant PC as Procurement Center
    participant FCI as FCI Depot
    participant SG as State Godown
    participant DSO as District Supply Office
    participant IP as Issue Point / Depot
    participant FPS as Fair Price Shop (ePoS)
    participant B as Beneficiary (Aadhaar / Card)

    Note over Farmer, PC: Procurement & Milling Phase (India has Paddy Milling; MVP has direct Rice Lot)
    Farmer->>PC: Deliver grain (MSP payment via PFMS)
    PC->>FCI: Stage-I Dispatch (Lot creation and transit)
    FCI-->>PC: Confirm receipt (Discrepancy audit)
    
    Note over FCI, SG: Allocation & Stage-II Transit
    FCI->>SG: Bulk dispatch to State Storage
    SG-->>FCI: Confirm receipt
    DSO->>SG: Issue Release Order (RO) Approval
    SG->>IP: Dispatch under RO
    IP-->>SG: Confirm receipt

    Note over IP, B: Last-Mile Allocation & Citizen Distribution
    IP->>FPS: Allocate monthly quota & dispatch
    FPS-->>IP: ePoS Receipt confirmation
    B->>FPS: Request ration (Biometric/OTP auth via AePDS)
    FPS->>B: Weigh and distribute commodities
```

### Key Differences in Flows

1. **Milling Intermediary:**
   In India, paddy is procured, sent to registered millers (Customed Milled Rice - CMR), and then rice is stored at FCI. ViksitPDS simplifies this by having the `PROCUREMENT_CENTER` create the `Rice` lot directly.
2. **Payment Integration (PFMS):**
   Indian procurement involves direct MSP payment transfers to farmers via the Public Financial Management System (PFMS). The MVP does not handle payment or financial rails.
3. **Authentication Boundary (AePDS):**
   Real distribution is routed through AePDS (Aadhaar enabled Public Distribution System) using UIDAI servers for biometric (Fingerprint/Iris) or OTP authentication. The MVP simulates this with local mock endpoints.
4. **RO (Release Order) Generation:**
   In state systems, the DSO issues an explicit Release Order specifying the quantity a dealer is allowed to lift based on allocation and payment. The MVP uses a simplified "RO-lite" dispatch approval workflow.

---

## 3. Conception & Design vs. Requirements (CDAC)

### CDAC Goal Alignment

The [CDAC Problem Statement](../requirements/cdac-problem-statement.md) demands:
> *"Blockchain enabled PDS to enhance the transparency, accountability and efficiency of food grain/ commodity distribution... immutable, transparent, shared record of all transactions from procurement to delivery... combat issues related to misuse and leakage."*

The POC is **very well-conceived** in terms of target objectives:
* **Accountability at Custody Transfers:** Every dispatch and receipt is dual-confirmed. If a state godown confirms receiving less than FCI dispatched, the discrepancy is immediately flagged as a `SHORT_RECEIPT` alert. This prevents in-transit diversion.
* **Privacy-by-Design:** The system respects privacy guidelines. Personal Identifiable Information (PII) like raw Aadhaar numbers, biometric templates, and phone numbers are kept off-chain. Only hashes (`beneficiary-hash`, `ration-card-hash`) are stored on the ledger, satisfying security and privacy regulations.
* **Preventing Duplicate Claims:** The ledger tracks entitlements and lifted quantities. If a beneficiary tries to lift grain twice in the same month (e.g., from two different shops), the chaincode checks their entitlement balance and blocks the transaction, generating a `DUPLICATE_CLAIM` alert.

---

## 4. Critical Technical & Design Gaps in the POC/MVP

While functionally aligned, the current technical implementation contains several architectural risks and gaps that must be addressed before moving from a POC to a production pilot:

### 1. Fabric State Serialization Bottleneck (MVCC Conflicts)
> [!CRITICAL]
> **This is the most severe scalability issue in the chaincode.**
* **The Gap:** The chaincode (under `contract-base.ts`) saves entire collections (like all lots, all transfers, all allocations) under single global keys (e.g., `pds.lots`, `pds.transfers`) as serialized JSON arrays. 
* **The Risk:** Hyperledger Fabric uses Multi-Version Concurrency Control (MVCC). If two concurrent transactions read and write to the same key within a block (for example, two different FPS dealers in a district recording distributions at the same time), the second transaction will fail with an MVCC collision. This restricts write throughput to **one transaction per block per collection**, which would freeze a real-world network.
* **Remediation:** Refactor state storage to use individual keys with composite identifiers:
  ```typescript
  const key = ctx.stub.createCompositeKey('distribution', [distributionId]);
  await ctx.stub.putState(key, Buffer.from(JSON.stringify(distribution)));
  ```

### 2. In-Memory Query Filtering
* **The Gap:** Rich query and history retrieval operations load the entire global array of events into peer memory and filter them in TypeScript.
* **The Risk:** Once the ledger accumulates thousands of transactions, running a query will cause peer containers to run out of memory (OOM) or timeout, crashing the network node.
* **Remediation:** Use Fabric's native history tracking (`ctx.stub.getHistoryForKey(key)`) and leverage CouchDB rich query selectors (`ctx.stub.getQueryResult(selector)`).

### 3. Dual-Write Transaction Boundaries (Split-Brain Risk)
* **The Gap:** The business API writes transaction data to PostgreSQL first, then makes an asynchronous call to submit the event to Hyperledger Fabric.
* **The Risk:** If the PostgreSQL write succeeds, but the Fabric transaction aborts (due to network timeout, endorsement policy failure, or consensus lag), the database will diverge from the blockchain ledger. This creates an unverified database entry with no matching ledger proof, violating the system's core integrity promise.
* **Remediation:** Implement the **Transactional Outbox Pattern**. Write the blockchain payload to an `outbox` database table within the same PostgreSQL transaction. A background worker should poll this table, submit events to Fabric, and mark them as processed once confirmed.

### 4. Static Route Mapping
* **The Gap:** Physical supply chain routes are hardcoded in the typescript library definitions.
* **The Risk:** If a state changes its warehouse mapping (e.g., adding an intermediary block godown or changing transit hubs), it requires editing code, rebuilding docker containers, and upgrading chaincode.
* **Remediation:** Move the routes on-chain as a governance asset (`RouteTemplate`) that authorized Department Admins can update via administrative transactions.

### 5. Lack of Security Guards and On-Chain Auth
* **The Gap:** Mutation endpoints (dispatch, receive, distribute) on the business API lack strict authentication guards. On-chain, the smart contract does not perform client identity (MSP ID) checks.
* **The Risk:** Any participant on the Fabric network can bypass role restrictions and invoke writes. 
* **Remediation:** Restrict REST API endpoints using JWT authentication, and enforce MSP checks in chaincode (e.g., asserting that only a `DepotOfficeMSP` can approve dispatches and only an `FpsDealerMSP` can record distributions).

---

## 5. Summary Evaluation

* **Concept Conception (Rating: 9/10):** Extremely well-conceived. The decision to audit last-mile deliveries, track custody transfers, capture weight discrepancies, and audit exception logs perfectly addresses the major leaks in India's PDS.
* **Functional Architecture (Rating: 8/10):** The dual-confirmation workflow, validation logic, and off-chain/on-chain privacy balance are robustly designed for a pilot framework.
* **Technical Implementation (Rating: 5/10):** High risks exist around Fabric world-state serialization (global JSON arrays), in-memory filtering, and dual-write inconsistencies. These are standard in 2-week MVPs but must be refactored before deployment in staging or production.
