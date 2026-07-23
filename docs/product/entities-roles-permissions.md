# ViksitPDS - Entities, Roles, Permissions & Operations Reference

This is the current POC/MVP scope. The app models the PDS commodity chain from procurement through FPS distribution to beneficiaries:

```text
Procurement Centre -> FCI -> State Godown -> Issue Point -> FPS -> Beneficiary
```

The current app deliberately excludes rice-specific milling, FCI buffer-godown splits, block-godown hops, divisional/taluka office tiers, welfare institutions, and government canteens. Those can remain policy/reference context, but they are not current stakeholder types, roles, seed entities, route nodes, or demo workflow steps.

## Acronyms

| Acronym | Expansion | Current app meaning |
|---|---|---|
| PDS | Public Distribution System | Food-subsidy supply and retail distribution workflow. |
| FCI | Food Corporation of India | Central custody node after procurement. |
| FPS | Fair Price Shop | Last stock-holding node before beneficiary distribution. |
| DSO | District Supply Office / Officer | District control office for RO-lite approval. |
| RO | Release Order | Approval reference for Stage-II movement. |
| MSP (Fabric) | Membership Service Provider | Fabric identity grouping for chaincode authorization. |

## Stakeholder Types

`StakeholderType` currently has 8 values:

| StakeholderType | Holds stock? | Current role |
|---|---:|---|
| `PROCUREMENT_CENTER` | Yes | Creates or originates commodity lots. |
| `FCI` | Yes | Receives procurement stock and dispatches onward to the state godown. |
| `STATE_GODOWN` | Yes | Receives Stage-I stock and dispatches Stage-II stock to the issue point. |
| `ISSUE_POINT` | Yes | Final upstream custody node; allocates stock to FPS. |
| `FAIR_PRICE_SHOP` | Yes | Receives FPS allocation and distributes to beneficiaries. |
| `DISTRICT_SUPPLY_OFFICE` | No | Approves RO-lite Stage-II movement. |
| `TRANSPORTER` | No | Recorded as movement evidence on dispatches. |
| `AUDITOR` | No | Reviews trace, alerts, and ledger evidence. |

Beneficiaries are not stakeholders. They are represented through ration-card hashes, entitlement records, authentication transactions, and distribution receipts.

## API Roles

The demo UI groups current stakeholders into these operational roles:

| UI/API role | Current scope |
|---|---|
| Procurement | `PROCUREMENT_CENTER` dispatch actions. |
| FCI Depot | `FCI` receipt and dispatch actions. |
| Depot / Issue Point | `STATE_GODOWN` and `ISSUE_POINT` receipt, dispatch, and FPS allocation actions. |
| Control Office | `DISTRICT_SUPPLY_OFFICE` RO-lite approval. |
| FPS | FPS receipt, authentication, and beneficiary distribution. |
| Management | Read-only operational overview. |
| Auditor | Trace, alert, and proof review. |
| Platform Administration | IAM-independent administration and proof-pipeline views; no operational workflow authority. |
| Integration Service | Server-to-server source-event ingestion, health, reconciliation, and trace, restricted by durable source-contract assignments. |

An FPS role alone is insufficient. The API requires an active
`FAIR_PRICE_SHOP` assignment. In the controlled PoC, `demo-fps` is assigned to
`FPS-101`; `FPS-202` exists to prove isolation. The server derives the effective
shop and opaque operator reference from the authenticated subject.

## Current Operations

The named chaincode business functions below remain compatibility functions.
The maintained API accepts business commands in PostgreSQL and submits
`RecordLedgerProof` asynchronously; it does not re-execute those commands on
Fabric.

| Operation | Purpose |
|---|---|
| `RegisterStakeholder` | Register one of the current stakeholder types. |
| `CreateCommodityLot` | Create a commodity lot at the procurement origin. |
| `DispatchLot` | Move stock between procurement, FCI, state godown, and issue point. |
| `ReceiveLot` | Confirm receipt; raises shortage alerts when applicable. |
| `AllocateToFPS` | Reserve issue-point stock for an FPS. |
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
- `platform-admin` does not imply procurement, godown, department, FPS, or
  integration-service authority.

## Demo Workflow

| # | Actor | Action |
|---|---|---|
| 1 | Procurement Centre | Dispatch commodity lot to FCI. |
| 2 | FCI | Receive procurement stock. |
| 3 | FCI | Dispatch stock to State Godown. |
| 4 | State Godown | Receive stock. |
| 5 | District Supply Office | Approve Stage-II movement to Issue Point. |
| 6 | State Godown | Dispatch stock to Issue Point. |
| 7 | Issue Point | Receive stock. |
| 8 | Issue Point | Allocate stock to FPS. |
| 9 | FPS | Confirm FPS receipt. |
| 10 | FPS | Simulate authentication and distribution as AePDS/ePoS-originated events. |
| 11 | Auditor / Management | Inspect trace, alerts, and stock evidence. |

## Out Of Current Scope

Broader PDS ecosystems can include central policy bodies, divisional/taluka offices, processing actors for commodity-specific workflows, sub-district buffers, welfare institutions, and cooked-meal canteens. They should be treated as future modules or reference context, not as current app stakeholders or workflow nodes.
