# PDS-Chain — Entities, Roles, Permissions & Operations Reference

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

## 6. Known Gaps (vs. the entity model)

1. **`PdsRole` (5) and Fabric MSPs (5) don't cover the new stakeholder types.** DFPD, FCI, Transporter, Miller, Welfare Institute, Shiv Bhojan Eatery, DSO/FDO/TSO have no dedicated principal — they're forced into one of the 5 coarse MSPs today.
2. **No per-endpoint RBAC at the API layer.** `BusinessAuthGuard.optionsFor()` returns `{}` by default and no controller overrides it; the `roles` hook is unused.
3. **No API controllers for ration-card / grievance / entitlement-rule / quota-rollover operations.** They're implemented in the chaincode engine and MSP-gated, but not exposed via REST.
4. **`FileGrievance` is ungated by design** — any authenticated MSP can file. This is intentional (citizen-facing), but worth noting.
5. **Demo mode is open by design** — auth is skipped entirely; the 17 stakeholder types are data labels only, not enforceable principals, until `fabric` mode + an extended role/MSP map is in place.

See `docs/implementation/maha-PDS-gaps-implementation-plan.md` for the staged plan to close these.
