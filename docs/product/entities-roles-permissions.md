# ViksitPDS — Entities, Roles, Permissions & Operations Reference

> A product-level reference for the actors in the system, what each one does, which operations each can perform, and what the acronyms mean.
> Source of truth in code:
> - Stakeholder types: `packages/shared-types/src/index.ts` (`StakeholderType`)
> - Chaincode operations: `blockchain/chaincode/pds-chaincode/src/operations.ts` (`CHAINCODE_OPERATIONS`)
> - MSP / operation allowlist: `blockchain/chaincode/pds-chaincode/src/authorization.ts` (`OPERATION_MSP_ALLOWLIST`)
> - API-layer roles: `apps/api/src/modules/auth/identity-provider.ts` (`PdsRole`)
> - Auth guard: `apps/api/src/modules/auth/auth.guard.ts`

---

## 1. Acronyms & Expansions

### Domain / Scheme acronyms

| Acronym | Expansion | Meaning |
|---|---|---|
| PDS | Public Distribution System | The national food-subsidy distribution system. |
| AePDS | Aadhaar-enabled Public Distribution System | PDS with Aadhaar-based beneficiary authentication at the FPS. |
| IAeSCM | Integrated Aadhaar-enabled Supply Chain Management | The SCM module of AePDS tracking grain movement from procurement to retail. |
| NFSA | National Food Security Act, 2013 | The law defining the food-security entitlements framework. |
| PMGKAY | Pradhan Mantri Garib Kalyan Anna Yojana | A central free-food-grain scheme layered on top of NFSA. |
| AAY | Antyodaya Anna Yojana | A category for the poorest of the poor under NFSA. |
| PHH | Priority Household | A beneficiary category under NFSA. |
| NPH | Non-Priority Household | A beneficiary category under NFSA (replaces the older APL term). |
| APL | Above Poverty Line | Pre-NFSA category; now aliased to NPH in this codebase. |
| BPL | Below Poverty Line | Pre-NFSA category; now aliased to PHH in this codebase. |
| ONORC | One Nation One Ration Card | Portability scheme letting a beneficiary lift rations from any FPS in India. |
| RO | Release Order | The authorization document that releases stock from a depot/godown for movement. |
| DO | Delivery Order | A document authorizing delivery (related to RO; sometimes used interchangeably). |
| GRN | Goods Receipt Note | Document recording receipt of goods at a node. |
| SCM | Supply Chain Management | The discipline/module covering commodity movement. |
| MSP (domain) | Minimum Support Price | The price at which FCI/procurement centres buy from farmers. (Not to be confused with Fabric MSP below.) |
| SLA | Service-Level Agreement | Used here for grievance resolution deadlines. |
| RTI | Right to Information | Citizen-information transparency framework. |

### Entities / Bodies

| Acronym | Expansion | Role in the chain |
|---|---|---|
| DFPD | Department of Food and Public Distribution (Govt. of India) | Central policy body overseeing NFSA and FCI. |
| FCI | Food Corporation of India | Central procurement, storage, and bulk-transport arm. |
| FPS | Fair Price Shop | Retail outlet (Marathi: *Raastabhav Dukane*) distributing subsidized grain. |
| DSO | District Supply Officer | District-level supply authority. |
| FDO | Food / Divisional Office (Divisional Food Office) | Division-level supply authority (above DSO). |
| TSO | Taluka Supply Officer | Taluka/block-level supply authority. |
| WI | Welfare Institute | Hostels, ashram schools, welfare homes receiving grain at BPL rates. |
| SBE | Shiv Bhojan Eatery | State-subsidized cooked-meal outlet. |
| UIDAI | Unique Identification Authority of India | Issues Aadhaar and provides authentication services. |
| NIC | National Informatics Centre | Technical host of AePDS / IAeSCM / NFSA portals. |
| ABA | Aadhaar Bridge Authentication | UIDAI's authentication bridge used by service providers. |
| CIDR | Central Identities Data Repository | UIDAI's central Aadhaar database queried during auth. |

### Technical / Blockchain acronyms

| Acronym | Expansion | Meaning |
|---|---|---|
| MSP (Fabric) | Membership Service Provider | Fabric identity provider; maps X.509 certs to an org. (Distinct from Minimum Support Price.) |
| Fabric | Hyperledger Fabric | The permissioned blockchain runtime used in `fabric` ledger mode. |
| IdP | Identity Provider | The service that verifies tokens at the API layer. |
| JWT | JSON Web Token | Token format a real IdP would issue (stub today). |
| RBAC | Role-Based Access Control | The access-control model used at the API layer. |
| PoS / ePOS | (Electronic) Point of Sale | The device at the FPS used for auth + sales. |
| OTP | One-Time Password | Used in mock Aadhaar authentication. |
| e-KYC | Electronic Know Your Customer | Aadhaar-based identity verification flow. |
| NRPC / NRFM | UIDAI error codes | Authentication failure cause codes (not yet modeled). |
| HSM | Hardware Security Module | For production key custody (deployment concern). |
| DR | Disaster Recovery | Deployment concern. |
| PII | Personally Identifiable Information | Prohibited on-ledger (Aadhaar, mobile, OTP, raw ration-card number). |

---

## 2. Entities (Stakeholder Types)

The `StakeholderType` enum models every actor that can hold stock, authorize movement, or receive distribution. 17 types in total.

### 2.1 Central tier

| StakeholderType | Code label | Jurisdiction | Holds stock? | Role in chain |
|---|---|---|---|---|
| `DFPD` | Department of Food and Public Distribution | CENTRAL | No | National policy + NFSA oversight; allocation origin. |
| `FCI` | Food Corporation of India | CENTRAL | Yes (procurement) | Central procurement, bulk storage, transport to states. |
| `FCI_BUFFER_GODOWN` | FCI Buffer Godown | CENTRAL | Yes | National food-security reserve storage. |

### 2.2 State administration

| StakeholderType | Code label | Jurisdiction | Holds stock? | Role in chain |
|---|---|---|---|---|
| `DEPARTMENT` | State Food, Civil Supplies & Consumer Protection Dept | STATE | No | State-level allocation authority, stakeholder registration, entitlement rules. |
| `DIVISIONAL_OFFICE` | Divisional Food Office (FDO) | STATE | No | Division-level quota allocation & monitoring (above DSO). |
| `DISTRICT_SUPPLY_OFFICE` | District Supply Office (DSO) | STATE | No | District-level quota allocation; authorizes Stage-II ROs. |
| `TALUKA_SUPPLY_OFFICE` | Taluka Supply Office (TSO) | STATE | No | Taluka/block-level allocation; authorizes last-mile ROs. |

### 2.3 Procurement, milling & logistics

| StakeholderType | Code label | Jurisdiction | Holds stock? | Role in chain |
|---|---|---|---|---|
| `PROCUREMENT_CENTER` | Procurement Centre | STATE | Yes | Buys grain from farmers at MSP; creates the commodity lot. |
| `MILLER` | Miller | STATE | Yes | Transforms paddy → rice; parent lot → child lot. |
| `TRANSPORTER` | Transport Contractor | STATE | No (in-transit custody) | Moves grain between nodes; recorded on the dispatch leg. |
| `STATE_GODOWN` | State Government Depot | STATE | Yes | Stage-II depot; receives from FCI / miller; dispatches to issue points. |
| `BLOCK_GODOWN` | Block Godown | STATE | Yes | Block-level buffer below the state depot. |
| `ISSUE_POINT` | Issue Point | STATE | Yes | Final dispatch node to retail endpoints / welfare agencies. |

### 2.4 Retail & frontline endpoints

| StakeholderType | Code label | Jurisdiction | Holds stock? | Role in chain |
|---|---|---|---|---|
| `FAIR_PRICE_SHOP` | Fair Price Shop (FPS) | STATE | Yes | Retail distribution to beneficiaries (AAY/PHH/NPH). |
| `WELFARE_INSTITUTE` | Welfare Institute / Hostel | STATE | Yes | Bulk grain receipt for inmates at BPL rates. |
| `SHIV_BHOJAN_EATERY` | Shiv Bhojan Eatery | STATE | Yes | Cooked-meal outlet; receives grain as input. |

### 2.5 Oversight

| StakeholderType | Code label | Jurisdiction | Holds stock? | Role in chain |
|---|---|---|---|---|
| `AUDITOR` | Auditor / Audit Authority | STATE | No | Trace inspection, alert review/resolution, ledger-proof verification. |

> Also defined in the type system but not in `StakeholderType`:
> - **Beneficiary / Ration Card Holder** — modeled via `RationCard` + `MonthlyEntitlement` (AAY / PHH / NPH), not as a stakeholder.
> - **ePOS Device** — not yet modeled as an entity (MVP gap).
> - **Vigilance Committee / Legal Metrology Officer / Consumer Protection Council** — oversight bodies not yet modeled (Later scope).

---

## 3. Roles (Authentication Principals)

There are **two parallel role models**. The data model has 17 stakeholder types, but the enforcement model is coarser. This is a known gap (see `docs/implementation/maha-PDS-gaps-implementation-plan.md`).

### 3.1 API-layer roles (`PdsRole`)

Defined in `apps/api/src/modules/auth/identity-provider.ts`. Used by `BusinessAuthGuard` in `fabric` ledger mode. **Currently only 5 coarse roles:**

| `PdsRole` | Maps to stakeholder types |
|---|---|
| `procurement` | `PROCUREMENT_CENTER`, `MILLER` (shared MSP) |
| `godown` | `STATE_GODOWN`, `BLOCK_GODOWN`, `ISSUE_POINT`, `FCI_BUFFER_GODOWN` (shared MSP) |
| `fps` | `FAIR_PRICE_SHOP` |
| `department` | `DEPARTMENT`, `DFPD`, `DSO`, `FDO`, `TSO` (shared MSP) |
| `auditor` | `AUDITOR` |

> Proposed extension (not yet implemented): split into per-stakeholder principals (`dfpd`, `fci`, `transporter`, `miller`, `welfare`, `shivbhojan`, `dso`, `fdo`, `tso`) so authorization matches the entity model.

### 3.2 Fabric MSPs (chaincode-layer principals)

Defined in `blockchain/chaincode/pds-chaincode/src/authorization.ts`. Enforced by `assertAuthorized` on every write operation in `contract.ts`. **Currently 5 MSPs:**

| Fabric MSP | Represents |
|---|---|
| `ProcurementMillerMSP` | Procurement centres and millers. |
| `GodownWarehouseMSP` | State/block godowns, issue points, FCI buffer. |
| `FairPriceShopMSP` | Fair price shops. |
| `FoodAndCivilSuppliesMSP` | Department, DFPD, DSO/FDO/TSO (entitlement authority). |
| `AuditAuthorityMSP` | Auditors. |

### 3.3 Auth behavior by ledger mode

| Mode | Auth at API layer | Auth at chaincode layer |
|---|---|---|
| `demo` | **Open** — guard logs a warning and lets all requests through. | N/A — demo invoker bypasses MSP checks. |
| `fabric` | Bearer token verified by `IdentityProvider` (stub today; swap for JWT/Keycloak). | Real — `ctx.clientIdentity` MSP checked against per-op allowlist. |

> Note: even in `fabric` mode, no controller currently passes a `roles` set to `BusinessAuthGuard`, so per-endpoint RBAC at the API layer is not enforced today. The chaincode MSP check is the real enforcement seam.

---

## 4. Operations Catalog

All chaincode operations from `blockchain/chaincode/pds-chaincode/src/operations.ts`. Write ops are MSP-gated (§5); query ops are open to any authenticated MSP.

### 4.1 Supply chain

| Operation | Kind | Description |
|---|---|---|
| `RegisterStakeholder` | write | Register a new stakeholder (dept/auditor only). |
| `CreateCommodityLot` | write | Create a new commodity lot at a procurement centre; opens initial stock. |
| `TransformLot` | write | Miller transformation: consume parent lot stock, create child lot (paddy → rice). |
| `DispatchLot` | write | Dispatch stock from one node to another; records transporter, RO-lite, stage. |
| `ReceiveLot` | write | Confirm receipt; updates receiver stock; raises `SHORT_RECEIPT` alert on shortage. |
| `AllocateToFPS` | write | Reserve stock from a godown to an FPS (pre-receipt). |
| `RecordFPSReceipt` | write | Confirm FPS receipt of an allocation. |

### 4.2 Beneficiary authentication & distribution

| Operation | Kind | Description |
|---|---|---|
| `RegisterBeneficiaryHash` | write | Register a hashed beneficiary reference (no PII). |
| `CreateMonthlyEntitlement` | write | Create/refresh a monthly entitlement for a ration-card hash. |
| `RecordDistribution` | write | Record a FPS distribution; validates entitlement + stock; blocks duplicate claims. |

### 4.3 Audit

| Operation | Kind | Description |
|---|---|---|
| `CheckDuplicateClaim` | query | Pre-check whether a ration-card hash can lift a quantity this month. |
| `RaiseAuditFlag` | write | Raise an audit alert (rule engine or auditor). |
| `ResolveAuditFlag` | write | Resolve an existing audit alert. |
| `RecordLedgerProof` | write | Auditor-only: replay/project a ledger event with validation. |

### 4.4 Ration card lifecycle

| Operation | Kind | Description |
|---|---|---|
| `IssueRationCard` | write | Issue a new ration card (status `ISSUED`). |
| `ActivateRationCard` | write | Move a card from `ISSUED` → `ACTIVE`. |
| `SuspendRationCard` | write | Suspend a card with a reason; raises an audit alert. |
| `TransferRationCard` | write | Reassign a card to a different FPS; appends to `transferHistory`. |

### 4.5 Grievance management

| Operation | Kind | Description |
|---|---|---|
| `FileGrievance` | write | File a citizen grievance; sets a 7-day SLA. **Ungated** — any authenticated MSP. |
| `AcknowledgeGrievance` | write | FPS acknowledges an OPEN grievance. |
| `ResolveGrievance` | write | FPS or department resolves a grievance with a note. |
| `EscalateOverdueGrievances` | write | Auditor-only batch op: escalate grievances past SLA and raise `GRIEVANCE_SLA_BREACH` alerts. |

### 4.6 Entitlement rules engine

| Operation | Kind | Description |
|---|---|---|
| `ProposeEntitlementRule` | write | Department proposes a category × commodity monthly-kg rule (status `PENDING_APPROVAL`). |
| `ApproveEntitlementRule` | write | Auditor approves; supersedes any prior active rule for the same category × commodity. |

### 4.7 Quota rollover

| Operation | Kind | Description |
|---|---|---|
| `RolloverUnclaimedQuota` | write | Department rolls over a percentage of unclaimed entitlement from one month to the next. |

### 4.8 Queries

| Operation | Kind | Description |
|---|---|---|
| `GetLotHistory` | query | Lot provenance — walks parent/child lot lineage and matching events. |
| `GetDistributionHistory` | query | Distribution event history. |
| `GetCurrentStock` | query | Current stock positions. |
| `VerifyDatabaseHash` | query | Compare an external DB digest against the ledger digest. |
| `GetRationCardHistory` | query | Ration-card lifecycle events. |
| `GetActiveEntitlementRules` | query | List active entitlement rules. |
| `GetEntityHistory` | query | Generic entity history by id. |
| `GetDistributionsByFPS` | query | Distributions for a given FPS. |
| `GetStakeholdersByType` | query | Stakeholders filtered by type. |

---

## 5. Permissions Matrix (Operation → allowed principal)

### 5.1 Supply chain operations

| Operation | Allowed Fabric MSP | Intended API role | Notes |
|---|---|---|---|
| `RegisterStakeholder` | `FoodAndCivilSuppliesMSP`, `AuditAuthorityMSP` | `department`, `auditor` | |
| `CreateCommodityLot` | `ProcurementMillerMSP` | `procurement` | At procurement centre. |
| `TransformLot` | `ProcurementMillerMSP` | `procurement` (miller) | Miller MSP not separated from procurement today. |
| `DispatchLot` | `ProcurementMillerMSP`, `GodownWarehouseMSP` | `procurement`, `godown` | Sender must own the lot. Stage-II requires RO-lite. |
| `ReceiveLot` | `GodownWarehouseMSP`, `ProcurementMillerMSP` | `godown`, `procurement` | Receiver confirms. Shortage → `SHORT_RECEIPT` alert. |
| `AllocateToFPS` | `GodownWarehouseMSP` | `godown` | Godown → FPS reservation. |
| `RecordFPSReceipt` | `FairPriceShopMSP` | `fps` | FPS confirms allocation receipt. |

### 5.2 Beneficiary auth & distribution

| Operation | Allowed Fabric MSP | Intended API role | Notes |
|---|---|---|---|
| `RegisterBeneficiaryHash` | `FairPriceShopMSP` | `fps` | |
| `CreateMonthlyEntitlement` | `FoodAndCivilSuppliesMSP` | `department` | Validated against active entitlement rules. |
| `RecordDistribution` | `FairPriceShopMSP` | `fps` | Blocks on auth failure / inactive card / insufficient balance / duplicate claim. |

### 5.3 Audit operations

| Operation | Allowed Fabric MSP | Intended API role | Notes |
|---|---|---|---|
| `RaiseAuditFlag` | `AuditAuthorityMSP`, `FoodAndCivilSuppliesMSP` | `auditor`, `department` | |
| `ResolveAuditFlag` | `AuditAuthorityMSP`, `FoodAndCivilSuppliesMSP` | `auditor`, `department` | |
| `RecordLedgerProof` | `AuditAuthorityMSP` | `auditor` | Event type + PII allowlist validated. |

### 5.4 Ration card lifecycle

| Operation | Allowed Fabric MSP | Intended API role | Notes |
|---|---|---|---|
| `IssueRationCard` | `FoodAndCivilSuppliesMSP` | `department` | |
| `ActivateRationCard` | `FoodAndCivilSuppliesMSP` | `department` | |
| `SuspendRationCard` | `FoodAndCivilSuppliesMSP`, `AuditAuthorityMSP` | `department`, `auditor` | Raises `UNAUTHORIZED_TRANSACTION` alert. |
| `TransferRationCard` | `FoodAndCivilSuppliesMSP` | `department` | Appends to `transferHistory`. |

### 5.5 Grievance operations

| Operation | Allowed Fabric MSP | Intended API role | Notes |
|---|---|---|---|
| `FileGrievance` | **any authenticated MSP** | any | Intentionally ungated. |
| `AcknowledgeGrievance` | `FairPriceShopMSP` | `fps` | |
| `ResolveGrievance` | `FairPriceShopMSP`, `FoodAndCivilSuppliesMSP` | `fps`, `department` | |
| `EscalateOverdueGrievances` | `AuditAuthorityMSP` | `auditor` | Batch op; raises `GRIEVANCE_SLA_BREACH`. |

### 5.6 Entitlement rules & quota rollover

| Operation | Allowed Fabric MSP | Intended API role | Notes |
|---|---|---|---|
| `ProposeEntitlementRule` | `FoodAndCivilSuppliesMSP` | `department` | Status `PENDING_APPROVAL`. |
| `ApproveEntitlementRule` | `AuditAuthorityMSP` | `auditor` | Supersedes prior active rule. |
| `RolloverUnclaimedQuota` | `FoodAndCivilSuppliesMSP` | `department` | Carries unclaimed balance to next month. |

### 5.7 Queries (read-only)

All `Get*` operations and `CheckDuplicateClaim` are open to any authenticated MSP / role. No write side-effects.

---

## 6. Demo Script — Per-Role Workflow Sequence

A narrator-ready walkthrough. Each role has its own numbered script in the order the actor acts in the chain. Section 6.18 stitches them into a single end-to-end run. Section 6.19 covers exception paths.

Conventions:
- **REST** = callable today via the API (`apps/api/src/modules/*`).
- **chaincode-only** = implemented in `PdsLedgerEngine` and MSP-gated, but not yet exposed as a REST endpoint (see §7 gap 3). Until controllers are added, run these via the demo invoker / Fabric gateway directly.
- Seed IDs come from `mock/entities/stakeholders.json` and `mock/entities/transfers.json`.

### 6.1 DFPD — Department of Food & Public Distribution (central policy)

The chain originator. Authorises the central release of grain to FCI.

1. **(Setup)** Confirm `DFPD-001` is registered with `jurisdiction: CENTRAL`.
2. **Authorise central movement** — `POST /transfers/TR-SEED-DFPD-FCI/authorize` with `authorizedBy: DFPD-001`, `roRef: RO-CENTRAL-2026-06`. (REST)
3. **(Observer)** Watch the FCI procurement + buffer-storage legs (§6.2, §6.3) execute against that RO.

### 6.2 FCI — Food Corporation of India (procurement + bulk transport)

1. **Create the commodity lot** — `POST /lots` with `lotId: LOT-RICE-2026-001`, `currentOwner: FCI-001`, `source: FCI procurement`, `quantityKg: 10000`. Opens 10,000 kg stock at FCI. (REST)
2. **Dispatch to FCI buffer godown** — `POST /transfers` with `fromOrg: FCI-001`, `toOrg: FCI-BUF-001`, `stage: I`, `transporterId: TRANS-001`, `dispatchedQtyKg: 10000`. (REST)
3. **(Passive)** Transporter `TRANS-001` is recorded on the dispatch leg (in-transit custody; no separate action).

### 6.3 FCI Buffer Godown (central reserve storage)

1. **Receive from FCI** — `POST /transfers/TR-SEED-FCI-BUF/receive` with `receivedQtyKg: 10000`. Stock lands at `FCI-BUF-001`. (REST)
2. **Dispatch to state depot** — `POST /transfers` with `fromOrg: FCI-BUF-001`, `toOrg: GODOWN-S-001`, `stage: I`, `transporterId: TRANS-001`, `dispatchedQtyKg: 8000`. (REST)

### 6.4 State Food Department (entitlement + stakeholder authority)

Heavy setup role — runs once per demo.

1. **Register stakeholders** — `POST /stakeholders` for each of the 17 actors (or rely on seed). (REST)
2. **Propose an entitlement rule** — chaincode-only: `ProposeEntitlementRule` with `category: PHH`, `commodity: Rice`, `monthlyKg: 35`, `proposedBy: FOOD-001`. Status → `PENDING_APPROVAL`.
3. **(Hand-off)** Auditor approves (§6.16 step 1).
4. **Create monthly entitlement** — chaincode-only: `CreateMonthlyEntitlement` for `demo-ration-card-hash`, validated against the now-active rule.
5. **Issue ration card** — chaincode-only: `IssueRationCard` for `demo-ration-card-hash`, `cardType: PHH`, `assignedFpsId: FPS-101`.
6. **Activate ration card** — chaincode-only: `ActivateRationCard` → status `ACTIVE`.
7. **(End-of-month)** `RolloverUnclaimedQuota` to carry unclaimed balance into the next month. chaincode-only.

### 6.5 DSO / FDO / TSO (district / divisional / taluka supply officers)

Stage-II movement authorisers. They do **not** hold stock; they issue ROs.

1. **DSO authorises depot → miller hop** — `POST /transfers/TR-SEED-SG-MLL/authorize` with `authorizedBy: DSO-001`, `roRef: RO-DSO-2026-06-001`. (REST)
2. **DSO authorises issue-point → FPS hop** — `POST /transfers/TR-SEED-ISSUE-FPS/authorize` with `authorizedBy: DSO-001`, `roRef: RO-DSO-2026-06-FPS`. (REST)
3. **TSO authorises block-godown → issue-point hop** — `POST /transfers/TR-SEED-BG-ISSUE/authorize` with `authorizedBy: TSO-001`, `roRef: RO-TSO-2026-06-001`. (REST)
4. **(Observer)** Stage-II dispatches without an RO + authoriser are rejected by the engine and raise `UNAUTHORIZED_TRANSACTION`.

### 6.6 Procurement Centre (state-side procurement alternative)

Used when grain is procured at state MSP (not via FCI).

1. **Create the lot** — `POST /lots` with `currentOwner: PROC-001`, `source: Procurement Centre 01`. (REST)
2. **Dispatch to state depot or miller** — `POST /transfers` with `fromOrg: PROC-001`. (REST)

### 6.7 Miller (paddy → rice transformation)

1. **Receive paddy from state depot** — `POST /transfers/TR-SEED-SG-MLL/receive` with `receivedQtyKg: 3000`. Stock lands at `MLL-001` for commodity `Rice` (parent). (REST)
2. **Transform the lot** — `POST /lots/transform` with `parentLotId: LOT-RICE-2026-001`, `childLotId: LOT-RICE-2026-002`, `transformedBy: MLL-001`, `quantityKg: 2500`, `commodity: Rice`. Consumes 2,500 kg parent stock; opens 2,500 kg child stock; sets `transformedFromLotId`. (REST)
3. **Dispatch rice to block godown** — `POST /transfers` with `fromOrg: MLL-001`, `toOrg: GODOWN-B-001`, `lotId: LOT-RICE-2026-002`, `stage: II`, `transformedFromLotId: LOT-RICE-2026-001`, `authorizedBy: DSO-001`, `roRef: RO-DSO-2026-06-001`. (REST)

### 6.8 State Government Depot (STATE_GODOWN, Stage-II node)

1. **Receive from FCI buffer** — `POST /transfers/TR-SEED-BUF-SG/receive` with `receivedQtyKg: 8000`. (REST)
2. **Dispatch to miller** — `POST /transfers` with `fromOrg: GODOWN-S-001`, `toOrg: MLL-001`, `stage: I`, `transporterId: TRANS-001`. (REST)
3. **(Optional) Allocate to FPS** — `POST /fps-allocations` with `sourceGodownId: GODOWN-S-001`, `fpsId: FPS-101`. (REST) — alternative path to the issue-point flow.
4. **(Optional) Record FPS receipt** — `POST /fps-allocations/{id}/receipt`. (REST)

### 6.9 Block Godown (sub-district buffer)

1. **Receive rice from miller** — `POST /transfers/TR-SEED-MLL-BG/receive` with `receivedQtyKg: 2500`. (REST)
2. **Dispatch to issue point** — `POST /transfers` with `fromOrg: GODOWN-B-001`, `toOrg: ISSUE-001`, `stage: II`, `authorizedBy: TSO-001`, `roRef: RO-TSO-2026-06-001`, `transporterId: TRANS-001`. (REST)

### 6.10 Issue Point (final dispatch node to retail)

1. **Receive from block godown** — `POST /transfers/TR-SEED-BG-ISSUE/receive` with `receivedQtyKg: 1800`. (REST)
2. **Dispatch to FPS** — `POST /transfers` with `fromOrg: ISSUE-001`, `toOrg: FPS-101`, `stage: II`, `authorizedBy: DSO-001`, `roRef: RO-DSO-2026-06-FPS`, `dispatchedQtyKg: 600`, `transporterId: TRANS-001`. (REST)
3. **Dispatch to Welfare Institute** — `POST /transfers` with `toOrg: WI-101`, `dispatchedQtyKg: 300`, `roRef: RO-DSO-2026-06-WI`. (REST)
4. **Dispatch to Shiv Bhojan Eatery** — `POST /transfers` with `toOrg: SBE-101`, `dispatchedQtyKg: 300`, `roRef: RO-DSO-2026-06-SBE`. (REST)

### 6.11 Transporter (in-transit custody)

Passive role — no standalone steps. Recorded via `transporterId` on every `DispatchLot`. To demo transporter evidence, open `GET /transfers/{id}` and show the `transporterId`, `vehicleNo`, and dispatch/receive timestamps.

### 6.12 Fair Price Shop (retail distribution + beneficiary auth)

The citizen-facing endpoint. Most user-visible demo action.

1. **Receive allocation from issue point** — `POST /transfers/TR-SEED-ISSUE-FPS/receive` with `receivedQtyKg: 600`. Stock lands at `FPS-101`. (REST)
2. **Register beneficiary hash** — chaincode-only: `RegisterBeneficiaryHash` for `beneficiary-hash` (no PII).
3. **Authenticate beneficiary** — `POST /auth/mock-otp` (or `/auth/simulated-biometric`) with `rationCardHash: demo-ration-card-hash`, `beneficiaryRefHash: beneficiary-hash`. Returns `authTxnRefHash`. (REST)
4. **(Supervisor-exception path)** `POST /auth/supervisor-exception` with `approvedBy` + reason → `authResult: EXCEPTION_APPROVED`. Engine raises `UNAUTHORIZED_TRANSACTION` for auditor review. (REST)
5. **Validate entitlement** — `POST /entitlements/validate` with the ration-card hash, commodity, month. (REST)
6. **Record distribution** — `POST /distributions` with `fpsId: FPS-101`, `dealerId`, `authTxnRefHash`, `deliveredKg: 25`. Engine checks active card, entitlement balance, stock; writes `RecordDistribution`. (REST)
7. **(Duplicate-claim guard)** A second `POST /distributions` for the same card/month beyond balance raises `DUPLICATE_CLAIM` and is rejected.
8. **Issue masked receipt** — `GET /distributions/{id}/receipt`. (REST)

### 6.13 Welfare Institute (bulk beneficiary receipt)

1. **Receive from issue point** — `POST /transfers/TR-SEED-ISSUE-WI/receive`. In the seed, `receivedQtyKg: 280` against `dispatchedQtyKg: 300` → status `RECEIVED_WITH_SHORTAGE` and a `SHORT_RECEIPT` audit alert. (REST)
2. **(Observer)** Auditor picks up the shortage alert (§6.16 step 4).

### 6.14 Shiv Bhojan Eatery (cooked-meal input)

1. **Receive from issue point** — `POST /transfers/TR-SEED-ISSUE-SBE/receive` with `receivedQtyKg: 300`. (REST)

### 6.15 Beneficiary / Citizen (ration-card holder, not a stakeholder)

1. **(Lift ration)** Authenticated at FPS (§6.12 step 3-6).
2. **File a grievance** — chaincode-only: `FileGrievance` with `grievanceType: QUANTITY_SHORT`, `fpsId: FPS-101`, `rationCardHash`. 7-day SLA starts.
3. **(Portability - MVP)** `TransferRationCard` to a different FPS for ONORC lifts (chaincode-only today).

### 6.16 Auditor (oversight + approval authority)

1. **Approve the entitlement rule** — chaincode-only: `ApproveEntitlementRule` for the rule proposed in §6.4 step 2. Supersedes any prior active rule; status → `ACTIVE`.
2. **Inspect lot trace** — `GET /trace/lots/LOT-RICE-2026-002`. Returns the parent→child lineage spanning FCI → buffer → depot → miller → block godown → issue point → retail. (REST)
3. **Inspect distribution trace** — `GET /trace/distributions/{id}`. (REST)
4. **Review alerts** — `GET /audit-alerts`. Shortage at WI, supervisor exceptions, duplicate claims all visible. (REST)
5. **Resolve an alert** — `POST /audit-alerts/{alertId}/resolve` with `resolvedBy: AUD-001`, `resolutionNote`. (REST)
6. **Escalate overdue grievances** — chaincode-only: `EscalateOverdueGrievances` with the current timestamp. Grievances past SLA → `ESCALATED` + `GRIEVANCE_SLA_BREACH` alerts.
7. **Verify DB ↔ ledger integrity** — `GET /trace/verify` (or `VerifyDatabaseHash`) comparing the operational DB digest with the ledger digest. (REST)
8. **(Replay)** `RecordLedgerProof` to project a validated event (auditor-only; event-type allowlist + PII denylist enforced). chaincode-only.

### 6.17 End-to-end combined demo script (happy path)

A single narrator run, in chain order. Read down the column.

| # | Actor | Action | Call |
|---|---|---|---|
| 1 | DFPD | Authorise central release | `POST /transfers/TR-SEED-DFPD-FCI/authorize` |
| 2 | FCI | Create lot `LOT-RICE-2026-001` (10,000 kg) | `POST /lots` |
| 3 | FCI | Dispatch to FCI buffer (Stage-I, transporter) | `POST /transfers` |
| 4 | FCI Buffer | Receive 10,000 kg | `POST /transfers/{id}/receive` |
| 5 | FCI Buffer | Dispatch to State Depot (Stage-I) | `POST /transfers` |
| 6 | State Depot | Receive 8,000 kg | `POST /transfers/{id}/receive` |
| 7 | State Dept | Propose entitlement rule (PHH / Rice / 35 kg) | chaincode: `ProposeEntitlementRule` |
| 8 | Auditor | Approve the rule | chaincode: `ApproveEntitlementRule` |
| 9 | State Dept | Create monthly entitlement | chaincode: `CreateMonthlyEntitlement` |
| 10 | State Dept | Issue + activate ration card | chaincode: `IssueRationCard` / `ActivateRationCard` |
| 11 | DSO | Authorise depot → miller RO | `POST /transfers/{id}/authorize` |
| 12 | State Depot | Dispatch 3,000 kg to Miller | `POST /transfers` |
| 13 | Miller | Receive paddy | `POST /transfers/{id}/receive` |
| 14 | Miller | Transform → child lot `LOT-RICE-2026-002` (2,500 kg) | `POST /lots/transform` |
| 15 | DSO | Authorise miller → block-godown RO | `POST /transfers/{id}/authorize` |
| 16 | Miller | Dispatch rice to Block Godown (Stage-II) | `POST /transfers` |
| 17 | Block Godown | Receive 2,500 kg | `POST /transfers/{id}/receive` |
| 18 | TSO | Authorise block-godown → issue-point RO | `POST /transfers/{id}/authorize` |
| 19 | Block Godown | Dispatch 1,800 kg to Issue Point | `POST /transfers` |
| 20 | Issue Point | Receive 1,800 kg | `POST /transfers/{id}/receive` |
| 21 | DSO | Authorise issue-point → FPS RO | `POST /transfers/{id}/authorize` |
| 22 | Issue Point | Dispatch 600 kg to FPS | `POST /transfers` |
| 23 | Issue Point | Dispatch 300 kg to Welfare Institute | `POST /transfers` |
| 24 | Issue Point | Dispatch 300 kg to Shiv Bhojan Eatery | `POST /transfers` |
| 25 | FPS | Receive 600 kg | `POST /transfers/{id}/receive` |
| 26 | FPS | Authenticate beneficiary (mock OTP) | `POST /auth/mock-otp` |
| 27 | FPS | Validate entitlement | `POST /entitlements/validate` |
| 28 | FPS | Record distribution (25 kg) | `POST /distributions` |
| 29 | Auditor | Inspect lot trace (FCI → FPS) | `GET /trace/lots/LOT-RICE-2026-002` |
| 30 | Auditor | Verify DB ↔ ledger digest | `GET /trace/verify` |

### 6.18 Exception-path scripts

**A. Short receipt at Welfare Institute** (already in seed)
- Issue Point dispatches 300 kg to WI-101 (step 23 above).
- WI receives 280 kg → `POST /transfers/TR-SEED-ISSUE-WI/receive` returns `RECEIVED_WITH_SHORTAGE`, `shortageQtyKg: 20`.
- Engine raises `SHORT_RECEIPT` alert automatically.
- Auditor resolves via `POST /audit-alerts/{alertId}/resolve`.

**B. Duplicate claim at FPS**
- FPS records a distribution for `demo-ration-card-hash` (step 28).
- A second `POST /distributions` for the same card/month beyond balance → engine raises `DUPLICATE_CLAIM` and rejects the call.
- Auditor reviews via `GET /audit-alerts`.

**C. Supervisor-exception distribution**
- FPS calls `POST /auth/supervisor-exception` with `approvedBy` + reason instead of mock OTP.
- Distribution proceeds with `authResult: EXCEPTION_APPROVED`.
- Engine raises `UNAUTHORIZED_TRANSACTION` for auditor review.

**D. Grievance SLA breach**
- Beneficiary files a grievance (chaincode: `FileGrievance`); 7-day SLA starts.
- Auditor runs `EscalateOverdueGrievances` with a timestamp past `slaDeadlineAt`.
- Grievance → `ESCALATED`; `GRIEVANCE_SLA_BREACH` alert raised; FPS/Dept resolve via `ResolveGrievance`.

**E. Stage-II dispatch without RO**
- Any `POST /transfers` with `stage: II` but no `roRef` + `authorizedBy` → engine raises `UNAUTHORIZED_TRANSACTION` and rejects.

---

## 7. Known Gaps (vs. the entity model)

1. **`PdsRole` (5) and Fabric MSPs (5) don't cover the new stakeholder types.** DFPD, FCI, Transporter, Miller, Welfare Institute, Shiv Bhojan Eatery, DSO/FDO/TSO have no dedicated principal — they're forced into one of the 5 coarse MSPs today.
2. **No per-endpoint RBAC at the API layer.** `BusinessAuthGuard.optionsFor()` returns `{}` by default and no controller overrides it; the `roles` hook is unused.
3. **No API controllers for ration-card / grievance / entitlement-rule / quota-rollover operations.** They're implemented in the chaincode engine and MSP-gated, but not exposed via REST.
4. **`FileGrievance` is ungated by design** — any authenticated MSP can file. This is intentional (citizen-facing), but worth noting.
5. **Demo mode is open by design** — auth is skipped entirely; the 17 stakeholder types are data labels only, not enforceable principals, until `fabric` mode + an extended role/MSP map is in place.

See `docs/implementation/maha-PDS-gaps-implementation-plan.md` for the staged plan to close these.
