# ViksitPDS - Entities, Roles, Permissions & Operations Reference

This is the current POC/MVP scope. The app models the PDS commodity chain from FCI through FPS distribution to beneficiaries:

```text
FCI -> State Godown -> Block Godown -> FPS -> Beneficiary
```

The current app deliberately excludes rice-specific milling, FCI buffer-godown splits, additional intermediate warehouse hops beyond state and block godowns, welfare institutions, and government canteens. Those can remain policy/reference context, but they are not current stakeholder types, roles, seed entities, route nodes, or demo workflow steps.

## Acronyms

| Acronym | Expansion | Current app meaning |
|---|---|---|
| PDS | Public Distribution System | Food-subsidy supply and retail distribution workflow. |
| FCI | Food Corporation of India | Central origin and custody node for demo lots. |
| FPS | Fair Price Shop | Last stock-holding node before beneficiary distribution. |
| DSO | District Supply Office / Officer | District control office for RO-lite Stage-II approval. |
| BSO | Block Supply Office / Officer | Block office for FPS allotment and monitoring. |
| RO | Release Order | Approval reference for Stage-II movement. |
| MSP (Fabric) | Membership Service Provider | Fabric identity grouping for chaincode authorization. |

## Stakeholder Types

`StakeholderType` currently has 8 values:

| StakeholderType | Holds stock? | Current role |
|---|---:|---|
| `FCI` | Yes | Originates commodity lots and dispatches Stage-I stock to the state godown. |
| `STATE_GODOWN` | Yes | Receives Stage-I stock and dispatches Stage-II stock to the block godown. |
| `BLOCK_GODOWN` | Yes | Final upstream custody node; source godown for FPS allocation. |
| `FAIR_PRICE_SHOP` | Yes | Receives FPS allocation and distributes to beneficiaries. |
| `DISTRICT_SUPPLY_OFFICE` | No | Approves RO-lite Stage-II movement (office-only). |
| `BLOCK_SUPPLY_OFFICE` | No | Approves allotments and monitors block stock (office-only). |
| `TRANSPORTER` | No | Required transport evidence on godown dispatches and FPS doorstep allotments (`transporterId` + snapshotted `transporterName`). |
| `AUDITOR` | No | Reviews trace, alerts, and ledger evidence. |

Beneficiaries are not stakeholders. They are represented through ration-card hashes, entitlement records, authentication transactions, and distribution receipts.

## API Roles

The demo UI groups current stakeholders into these operational roles:

| UI label | API / Keycloak role | Current scope |
|---|---|---|
| FCI Depot Officer | `fci` | `FCI` lot creation and Stage-I dispatch. |
| Godown Operator | `godown` | `STATE_GODOWN` and `BLOCK_GODOWN` receipt and dispatch. |
| District Supply Officer (DSO) | `department` | Stage-II Release Order authorization. |
| Block Supply Officer (BSO) | `block-office` | FPS allotment and block monitoring. |
| FPS Dealer | `fps` | Shop receipt and simulated AePDS/ePoS distribution. |
| Management | `management` | Read-only operational overview. |
| Auditor | `auditor` | Trace, alert, and proof review. |
| Platform administrator | `platform-admin` | Administration and proof-pipeline views; no operational workflow authority. |
| Integration Service | `integration-service` | Server-to-server source-event ingestion and reconciliation. |

Compatibility note: the OIDC `procurement` role may still appear in tokens; the web demo maps it to FCI Depot. Lot create and dispatch no longer authorize `procurement`.

An FPS role alone is insufficient. The API requires an active
`FAIR_PRICE_SHOP` assignment. In the controlled PoC, `demo-fps` is assigned to
`FPS-101`; `FPS-202` exists to prove isolation. The server derives the effective
shop and opaque operator reference from the authenticated subject's active
durable database scope. An optional token scope claim is accepted only when it
matches that durable assignment.

## Current Operations

The named chaincode business functions below remain compatibility functions.
The maintained API accepts business commands in PostgreSQL and submits
`RecordLedgerProof` asynchronously; it does not re-execute those commands on
Fabric.

| Operation | Purpose |
|---|---|
| `RegisterStakeholder` | Register one of the current stakeholder types. |
| `CreateCommodityLot` | Create a commodity lot at the FCI Central Depot origin. |
| `DispatchLot` | Move stock between FCI, state godown, and block godown. |
| `ReceiveLot` | Confirm receipt; raises shortage alerts when applicable. |
| `AllocateToFPS` | Reserve block-godown stock for an FPS (BSO allotment). |
| `RecordFPSReceipt` | Confirm FPS receipt of an allocation. |
| `RegisterBeneficiaryHash` | Register hashed beneficiary identity reference. |
| `CreateMonthlyEntitlement` | Create or refresh entitlement balance. |
| `RecordDistribution` | Record FPS distribution to a beneficiary. |
| `RaiseAuditFlag` / `ResolveAuditFlag` | Audit exception lifecycle. |
| `RecordLedgerProof` | Auditor/control evidence projection. |
| Canonical source-event ingestion | Normalize privacy-approved SMART-PDS/RCMS, state-SCM, and AePDS/ePoS fixture events. |
| Integration reconciliation | Compare allocation/movement and FPS stock equations without changing quantity through alerts. |

## Authorization Boundaries

- Department, management, and auditor reads may span shops as allowed by their
  role; FPS reads are identity-filtered.
- Cross-shop individual FPS resources return `404` to avoid disclosure.
- Compatibility `fpsId` and `dealerId` mutation fields are accepted only when
  they match the server-derived identity; browser requests omit both.
- Token claims identify the subject and requested roles. In database
  authorization mode, active role, shop/scope, source-contract, and credential
  assignments in PostgreSQL are authoritative.
- `platform-admin` does not imply FCI, godown, block-office, department, FPS, or
  integration-service authority.

## Demo Workflow

| # | Actor | Action |
|---|---|---|
| 1 | FCI | Create/own commodity lot at FCI Central Depot. |
| 2 | FCI | Dispatch Stage-I stock to State Godown with transporter ID/name and vehicle. |
| 3 | State Godown | Receive stock (received qty + receive time; shortage if less than shipped). |
| 4 | District Supply Office | Approve Stage-II movement to Block Godown. |
| 5 | State Godown | Dispatch stock to Block Godown with transporter ID/name and vehicle. |
| 6 | Block Godown | Receive stock (received qty + receive time). |
| 7 | Block Supply Office | Allot stock to FPS with doorstep transporter ID/name and vehicle. |
| 8 | FPS | Confirm FPS receipt (received qty + receive time). |
| 9 | FPS | Simulate authentication and distribution as AePDS/ePoS-originated events. |
| 10 | Auditor / Management | Inspect trace, alerts, and stock evidence. |

## Out Of Current Scope

Broader PDS ecosystems can include central policy bodies, commodity-specific milling/processing actors, extra warehouse tiers beyond state and block godowns, welfare institutions, and cooked-meal canteens. They should be treated as future modules or reference context, not as current app stakeholders or workflow nodes.
