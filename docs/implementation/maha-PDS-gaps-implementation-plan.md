# Maharashtra AePDS / IAeSCM — Gap Analysis & Staged Implementation Plan

> Generated: 2026-06-30
> Sources:
> - `docs/reference/NotebookLM Mind Map-new.png` — AePDS-Maharashtra mind map (7 branches)
> - `docs/reference/PDS-entities.md` — entity inventory and SCM milestones
> - Codebase review: `packages/shared-types`, `apps/api/src/modules/*`, `apps/web/src/demo-model.ts`, `mock/entities/*`, `docs/technical/design.md`
> Companion: [docs/implementation/glm-analysis-impl.md](./glm-analysis-impl.md) — pre-existing hygiene/security/correctness plan.

## 1. Context

The current codebase models a **single-district, single-commodity (Rice), happy-path SCM** with five operational roles (`DEPARTMENT`, `PROCUREMENT`, `GODOWN`, `FPS`, `AUDITOR`) and a custody chain of:

```
Procurement Centre → Miller (narrated only) → State Godown → Block Godown → FPS → Beneficiary
```

The Maharashtra AePDS / IAeSCM reference (mind map + entity doc) describes a **multi-scheme, multi-channel, citizen-facing system** with a longer chain that begins at the central tier (DFPD / FCI) and ends at three retail endpoint types (FPS, Welfare Institutions, Shiv Bhojan Eateries) serving beneficiaries categorized as AAY / PHH / NPH.

This document (a) records the gaps and (b) stages the work so that the **POC is entity-complete** — no supply-chain actor or node is missing — while every real *feature* is pushed to MVP or Later.

## 2. Gap summary (by mind-map branch)

### 2.1 Management & MIS
- `modules/dashboard` has only `summary`, `fps-risk`, `pending-receipts`. No MIS report builder, no scheme/district/trend reports.
- No FPS active/inactive status roll-up.
- No software-version/build metadata.
- Login access: `modules/admin` + `StubIdentityProvider` (stub; real IAM already flagged in `glm-analysis.md` §3).

### 2.2 Fair Price Shops (FPS)
- `FAIR_PRICE_SHOP` stakeholder + `FPSAllocation` exist.
- **Missing:** Non-drawal cards tracking (data exists in `monthly_entitlements.alreadyLiftedKg`, no view).
- **Missing:** ePOS device entity, registration, heartbeat, offline-online sync.
- **Missing:** % distribution status (allocation vs distribution).

### 2.3 Supply Chain Management (IAeSCM) — weakest coverage
- Generic `STATE_GODOWN` / `BLOCK_GODOWN`; no "Depot" concept, no central-vs-state jurisdiction split, no `capacityKg`.
- **No Release Order (RO)** entity, lifecycle, or key register — the core IAeSCM control instrument.
- No Stage-I vs Stage-II movement distinction.
- No dispatch abstract, no depot stock/capacity reporting.
- No Welfare Institute channel.
- `TRANSPORTER` in enum but not seeded; `vehicleNo` is free-text, no transport contract/challan/GRN.
- `MILLER` seeded but no role, no milling contract, no out-turn ratio.

### 2.4 Sales & Distribution
- `DistributionTransaction` carries `commodity` + `deliveredKg` only — no scheme, no category, no festival-kit flag.
- `RationCardType` uses pre-NFSA `APL/BPL`; should be NFSA-aligned `AAY/PHH/NPH`.
- `EntitlementRule` fully typed (with `PENDING_APPROVAL/ACTIVE/SUPERSEDED`, `proposedBy/approvedBy`) but **no API module, DTO, or UI**.
- **Missing:** NFSA/PMGKAY scheme master, Annavitran abstract, Anandacha Shidha festival kits, scheme-wise sales.

### 2.5 Aadhaar & Authentication
- `AuthMode` covers `MOCK_OTP / SIMULATED_BIOMETRIC / SUPERVISOR_EXCEPTION`; stops there.
- **Missing:** UIDAI/ABA Yes/No + e-KYC, Aadhaar-seeding status, auth failure abstract, error-code catalog.

### 2.6 Ration Card & Citizen Services
- `RationCard`, `Grievance`, `GrievanceType/Status` defined in `shared-types` but **no `ration-cards` or `grievances` API module** (only a `pds_grievances_total` Prometheus counter).
- **Missing:** new application, modification, duplicate, ONORC/portability, grievance redressal.
- Citizen-services reference confirms the ration-card module decomposes into: `New Ration Card`, `Duplicate Copy`, `Name Correction`, `Add Name`, `Remove Name`, and `Change Address`.
- Add a `HouseholdMember` subresource only if member-level lifecycle/audit is required; otherwise keep the MVP surface on the existing ration-card record plus member-list fields.

### 2.7 Licensing and consumer regulation
- FPS registration and license renewal are citizen-facing lifecycle services, not just admin registration operations.
- Kerosene dealer registration and renewal add a second commodity/commodity-channel branch to the scheme master, but do not change the grain custody chain.
- Legal Metrology remains outside core PDS SCM; only a lightweight FPS scale-verification / stamping field is worth considering as an operational integrity hook.

### 2.8 Social Welfare & Consumer Protection — almost entirely absent
- **Missing:** Shiv Bhojan (as an eatery *entity*, not just a scheme), Welfare Institutes & Hostels, Consumer Protection Councils, Legal Metrology (weights/measures).

### 2.9 Central tier (from `PDS-entities.md`)
- **Missing entirely:** DFPD, FCI, FCI Buffer Godowns. The project chain starts at a state Procurement Centre; the real chain begins at FCI procurement/buffer.
- **Missing:** Divisional Offices (FDO) above DSO/TSO.
- **Missing:** Issue Points as a labeled dispatch node.
- **Missing:** NIC as technical host (infra/docs).

## 3. Staging principle

- **POC** — *Entity-complete custody chain plus 2-3 thin workflows.* Every actor/node in the FCI → beneficiary chain exists as a typed, seeded stakeholder, connected by minimal dispatch/receive events so the ledger trace spans the whole chain. Add only enough workflow to demonstrate how management controls leakage: RO-lite authorization, retail receipt, and beneficiary issue with simulated auth/exception.
- **MVP** — *Operational features on the complete skeleton.* Full RO lifecycle, schemes, UIDAI seam, ration-card/grievance modules, ePOS, MIS dashboards, portability.
- **Later** — *Oversight, scale, full integration.* Social-welfare ops, legal metrology, vigilance, real UIDAI/FCI integration, multi-district scale.

Guiding rule: **no supply-chain actor or node is absent in POC**; custody nodes pass stock, while control actors authorize or verify a step without becoming stock owners.

## 4. Entity coverage matrix

| Entity | POC | MVP | Later | Notes |
|---|---|---|---|---|
| DFPD (central policy) | add type + seed | allocation origin | — | Holds no stock; allocation originator |
| FCI (procurement/bulk transport) | add type + seed | — | real FCI integration | Chain entry point |
| FCI Buffer Godown (central reserve) | add type + seed + jurisdiction | capacity tracking | buffer-stock logic | Distinct from state godowns |
| State Government Godown / Depot | already `STATE_GODOWN` | depot ops, dispatch abstract | 492-depot scale | Add `jurisdiction` + `capacityKg` in POC |
| Block Godown | already `BLOCK_GODOWN` | — | — | |
| Issue Point | add type (or depot attribute) | issue-point workflow | — | Labeled dispatch node |
| Transporter | in enum → **seed + transfer evidence** | e-challan/GRN, GPS | transit insurance | POC: attached to dispatch; not stock owner |
| Miller | seeded → **add role + milling leg** | out-turn ratio, grading | tolling contracts | POC: paddy→rice transformation hop |
| Procurement Centre | exists | MSP/farmer registration | farmer portal | |
| FPS | exists | ePOS, sales register, % dist | — | |
| Welfare Institute | **add type + seed** | WI allocation + receipt channel | — | Third retail channel |
| Shiv Bhojan Eatery | **add type + seed** | meal-scheme ops | — | Third retail channel (cooked meals) |
| Beneficiary categories AAY/PHH/NPH | **fix `RationCardType`** | scheme binding | — | Replace APL/BPL with NPH |
| DSO / FDO / TSO (admin tiers) | add types + seed + RO-lite approval | full allocation workflow | multi-division scale | Entity present in POC; full workflow in MVP |
| Auditor | exists | — | — | |
| UIDAI | stub (existing) | UIDAI Yes/No + e-KYC seam | real integration | |
| ePOS Device | — | add entity | offline-sync | |
| Legal Metrology | — | — | verification workflow | Oversight → Later |
| Vigilance Committee | — | — | social-audit module | Oversight → Later |
| NIC | — | — | hosting/deploy docs | Infra → Later |

## 5. POC scope — "no SCM entity missing"

**Goal:** a single end-to-end demo where stock is traceable from FCI procurement to beneficiary issue, passing through **every** custody node, with each hop emitting a ledger event. It should also show three management-relevant workflows in thin form: authorization before dispatch, receipt/reconciliation at the endpoint, and beneficiary issue with exception/audit.

### POC-A: Enum + type changes (`packages/shared-types/src/index.ts`)
- Extend `StakeholderType` with: `DFPD`, `FCI`, `FCI_BUFFER_GODOWN`, `ISSUE_POINT`, `WELFARE_INSTITUTE`, `SHIV_BHOJAN_EATERY`, `DIVISIONAL_OFFICE`, `DISTRICT_SUPPLY_OFFICE`, `TALUKA_SUPPLY_OFFICE`. (`TRANSPORTER`, `MILLER`, `STATE_GODOWN`, `BLOCK_GODOWN`, `PROCUREMENT_CENTER`, `FAIR_PRICE_SHOP`, `DEPARTMENT`, `AUDITOR` already exist.)
- Fix `RationCardType`: `AAY`, `PHH`, `NPH` (drop `APL`/`BPL` or alias `APL→NPH` for back-compat).
- Add `jurisdiction: 'CENTRAL' | 'STATE'` and `capacityKg?: number` to `Stakeholder`.
- Add `stage: 'I' | 'II'`, `authorizedBy?`, and `roRef?` to `TransferOrder`.
- Add `transporterId?` and `transformedFromLotId?` to `TransferOrder` (miller leg).
- Add a lightweight `WorkflowStatus`/`approvalStatus` only if needed by DTOs; avoid building a full workflow engine in POC.

### POC-B: Seed the full chain (`mock/entities/stakeholders.json`, `mock/seed/backend.json`)
One end-to-end path, every node present:

```
DFPD (allocate) → FCI (procure) → FCI Buffer Godown (store)
  → State Govt Depot [Stage-I] (receive from FCI)
  → Miller (paddy→rice transform hop)
  → Issue Point / Block Godown [Stage-II, RO-ref] (receive)
  → Transporter (in-transit evidence on dispatch)
  → FPS  AND  Welfare Institute  AND  Shiv Bhojan Eatery (three retail endpoints)
  → Beneficiary (AAY / PHH / NPH) issue
```

DSO/FDO/TSO seeded as allocation/control authorities. In POC they approve one RO-lite movement; full allocation workflow remains MVP.

### POC-C: Minimal custody events through every hop
- Reuse existing `DispatchLot` / `ReceiveLot` chaincode functions for each leg.
- Add one new chaincode op: `TransformLot` (miller paddy→rice, creates child lot referencing parent) — so the miller node is a real transformation, not a pass-through.
- Transport evidence = `DispatchLot` with `transporterId` set; ownership remains with sender until receipt, matching the current in-transit model.
- Three retail endpoints each get a receipt event (FPS already has `RecordFPSReceipt`; add analogous receipt for WI and Shiv Bhojan, or generalize to `ReceiveAtRetail`).
- Beneficiary issue uses existing `RecordDistribution`.

### POC-D: Three thin workflows management can evaluate

These are deliberately narrow workflows, not full MVP modules.

#### Workflow 1 — RO-lite dispatch authorization
- DFPD/state office creates a seeded `roRef` for one lot movement.
- DSO/FDO/TSO approves the movement by stamping `authorizedBy` on the `TransferOrder`.
- `DispatchLot` rejects Stage-II movement if `roRef`/`authorizedBy` is missing.
- Trace view shows: "Authorized by DSO/FDO/TSO → dispatched → received".

This demonstrates managerial control over movement without implementing full RO generation, key register, allocation balancing, cancellation, amendment, or monthly quota workflows.

#### Workflow 2 — Multi-endpoint receipt and shortage reconciliation
- Depot/Issue Point dispatches stock to three endpoint types: FPS, Welfare Institute, Shiv Bhojan Eatery.
- Each endpoint records receipt through a generalized `ReceiveAtRetail` or equivalent receipt call.
- A deliberate short receipt scenario raises the existing `SHORT_RECEIPT` audit alert.
- Dashboard/trace shows endpoint receipt status and shortage evidence.

This directly addresses the "last mile black hole" and in-transit diversion gap while avoiding full dispatch abstracts, GPS, GRN, and stock-aging logic.

#### Workflow 3 — Beneficiary issue with simulated auth and exception audit
- FPS issues ration to an AAY/PHH/NPH beneficiary using existing `RecordDistribution`.
- Normal path uses `MOCK_OTP` or `SIMULATED_BIOMETRIC`.
- Exception path uses `SUPERVISOR_EXCEPTION` and records `approvedBy`.
- Duplicate/over-entitlement attempt remains blocked by entitlement balance.

This demonstrates exclusion-error handling and leakage prevention without real UIDAI/e-KYC, ePOS device sync, ONORC, or grievance workflows.

### POC-E: Trace explorer shows full-chain provenance
- `GET /trace/lots/{lotId}` already exists; extend `GetLotHistory` to walk the parent→child lot chain so the trace renders FCI → … → beneficiary in one view.
- Web `TraceExplorer` renders every node in the path with its role label and the workflow status for authorization, receipt, shortage, and distribution.

### POC-F: Role-based UI/UX workflow workbenches

The current web app has a role-aware shell and a thin "run next step" panel, but most screens are still view-only entity panels. For the POC, the UI must become workflow-oriented in both live API mode and mock mode. Mock mode should support local state mutations so management can click through the POC without requiring Fabric/PostgreSQL to be running.

#### Cross-cutting UX requirements
- Keep login lightweight, but make the selected role materially change the visible work queue, allowed actions, and dashboard cards.
- Replace the single linear "Run next step" panel with role-specific action panels and forms.
- Every workflow action must show before/after state: pending, approved, dispatched, received, shortage, distributed, blocked, or exception-approved.
- Every submitted action must show the ledger evidence it produced: event type, entity id, and ledger tx/proof id when available.
- In mock mode, actions mutate local React state and append mock ledger evidence; in live mode, the same forms call the API.
- Views must distinguish custody actors from control/audit actors. Control actors authorize or review; they do not hold stock.

#### POC UI stage 1 — Role login and work queue
- Add/extend roles for: Management, DSO/FDO/TSO, FCI/Depot/Issue Point, FPS, Welfare Institute, Shiv Bhojan Operator, Auditor.
- Login opens the default workbench for the chosen role, not a generic dashboard first.
- Each role sees a compact work queue:
  - pending approvals,
  - pending dispatches,
  - pending receipts,
  - pending beneficiary issue,
  - exceptions/audit alerts.
- Management view shows aggregate workflow status, not editable operational forms.

#### POC UI stage 2 — RO-lite authorization workbench
- DSO/FDO/TSO sees a pending Stage-II movement card with `roRef`, lot, source, destination, commodity, quantity, and transporter.
- Form controls: approve, reject/block, remarks.
- Approval stamps `authorizedBy` and `authorizedAt`, then unlocks dispatch for Depot/Issue Point.
- Unauthorized dispatch attempt should be visibly blocked and linked to the missing approval.

#### POC UI stage 3 — Depot/Issue Point dispatch workbench
- Depot/Issue Point sees approved movements ready for dispatch.
- Form controls: select lot, destination endpoint, quantity, vehicle number, transporter, dispatch timestamp.
- Stage-I and Stage-II movements are visually labeled.
- Dispatch result creates ledger evidence and moves the task into pending receipt for the endpoint role.

#### POC UI stage 4 — Retail endpoint receipt workbench
- FPS, Welfare Institute, and Shiv Bhojan Operator each get a receipt screen filtered to their endpoint.
- Form controls: received quantity, receipt timestamp, remarks.
- If received quantity is less than dispatched quantity, show shortage amount and create/display a `SHORT_RECEIPT` alert.
- Receipt updates endpoint stock and the trace path.

#### POC UI stage 5 — FPS beneficiary issue workbench
- FPS sees available stock, beneficiary category (AAY/PHH/NPH), monthly entitlement, lifted quantity, and available balance.
- Form controls: auth mode, delivered quantity, supervisor approver/reason for exception path.
- Normal issue records distribution after simulated auth.
- Supervisor exception requires approver/reason and appears in the auditor queue.
- Duplicate/over-entitlement attempt is blocked with visible reason and audit evidence.

#### POC UI stage 6 — Auditor and trace review
- Auditor sees shortage alerts, blocked duplicate attempts, and supervisor exceptions.
- Auditor can inspect evidence but does not need full resolve/escalate workflow in POC.
- Trace view renders the full provenance timeline: authorization → dispatch → transport evidence → receipt → shortage/exception alert → distribution.
- Timeline entries should deep-link to the related entity record where practical.

### POC out of scope (explicitly)
Full Release Order lifecycle, scheme master, real UIDAI, ePOS, ration-card applications, grievances, ONORC, MIS reports, depot capacity *alerts*, dispatch abstracts, GPS/challan/GRN, stock aging, production IAM/RBAC, and full audit resolution workflow. These are MVP.

### POC acceptance criteria
A single demo lot can be traced from FCI procurement to beneficiary issue, hitting every custody node in the matrix above, with a ledger event at each hop. The demo must also show:
- one RO-lite authorized Stage-II dispatch,
- receipt at FPS, Welfare Institute, and Shiv Bhojan endpoints,
- one short-receipt audit alert,
- one successful beneficiary distribution,
- one blocked duplicate/over-entitlement attempt,
- one supervisor-exception distribution path.

The UI must also let management run or inspect these stages through role-specific workbenches in mock mode and live API mode. No node is a dead end, and no POC workflow requires real external integration.

## 6. MVP scope — operational features on the skeleton

| MVP feature | Builds on POC entity | Notes |
|---|---|---|
| **Full Release Order lifecycle** (RO generation → amendment/cancel → dispatch → receipt → key register) | DFPD/DSO + Depot + Issue Point | Biggest MVP item; re-base `FPSAllocation` on a real RO; POC has only RO-lite |
| **Scheme master** (NFSA / PMGKAY / Anandacha Shidha) + bind `EntitlementRule` | AAY/PHH/NPH + entitlements | `EntitlementRule` type already exists; add module + DTO; extend if kerosene is formally in scope |
| **Depot operations** (capacity tracking, dispatch abstract, Stage-I/II reports, stock aging) | Depot + `stage` tag + `capacityKg` | |
| **Transporter ops** (e-challan / GRN, GPS, in-transit loss reconciliation) | Transporter | POC only records `transporterId` |
| **Miller ops** (out-turn ratio, grading, reject) | Miller + `TransformLot` | |
| **UIDAI seam** (Yes/No auth + e-KYC + Aadhaar-seeding status + auth failure abstract + error-code catalog) | UIDAI stub → real `IdentityProvider` | POC only uses simulated auth/exception |
| **ePOS device entity** + daily sales closure / closing-stock reconciliation | FPS | `FPS_CLOSING_STOCK_MISMATCH` alert rule already documented |
| **Ration card module** (application, modification, duplicate, suspend/cancel, transfer history) | `RationCard` type already exists | Add API + DTO + UI |
| **Ration card citizen services** (new card, duplicate copy, name correction, add/remove name, address change) | `RationCard` plus household fields | Split the module into explicit service flows rather than a single generic modification flow |
| **Stakeholder licensing lifecycle** (apply → approve → renew → amend → suspend) | `Stakeholder` + `licenseNo` | Add citizenship-facing lifecycle for FPS and kerosene dealers |
| **Grievance module** (file, acknowledge, escalate, resolve, SLA) | `Grievance` type + `GRIEVANCE_SLA_BREACH` alert already exist | Add API + UI |
| **ONORC portability** (inter-district/inter-state lift, migrant beneficiary) | Ration card + FPS | National portability |
| **MIS dashboards** (scheme-wise, district-wise, % distribution, non-drawal cards, active/inactive FPS, auth failure abstract) | All entities | Replaces today's single summary card |
| **DSO/FDO/TSO allocation workflow** | Admin tiers seeded in POC | Allocation approval flow |

## 7. Later scope — oversight, scale, integration

- Shiv Bhojan full meal-scheme operations (entity present in POC; ops here).
- Welfare Institute full channel operations (allocations, reconciliations).
- Legal Metrology verification workflow (scale calibration/stamping tied to distributions); keep the full licensing stack here, not in MVP.
- Optional FPS scale-verification/stamping attribute if the product needs a low-cost integrity hook.
- Vigilance Committee / social-audit module.
- Consumer Protection Council integration.
- Real UIDAI/ABA production integration (MVP ships the seam; cert + production here).
- NIC-aligned hosting/deployment (HSM, DR, scale).
- Multi-division / multi-district scale (492 depots), stock aging/FIFO at scale.
- Inter-state ONORC settlement.
- Analytics/BI layer.

## 8. Recommended POC execution order

1. **Shared-types + seed** (POC-A, POC-B) — one PR, unblocks everything.
2. **RO-lite fields + authorization guard** (POC-D workflow 1) — makes the POC workflow-oriented without full RO complexity.
3. **`TransformLot` chaincode op + generalized retail receipt** (POC-C, POC-D workflow 2) — completes the custody event set.
4. **Distribution exception path + blocked duplicate demo** (POC-D workflow 3) — proves leakage/exclusion handling.
5. **Role workbenches + interactive mock mode** (POC-F) — makes the POC demonstrable as workflows, not read-only entity views.
6. **Trace walker + provenance UI** (POC-E, POC-F stage 6) — proves entity and workflow completeness visually.
7. Freeze POC, then open MVP with **full RO lifecycle** as the first MVP epic (load-bearing for everything downstream).

## 9. Architectural notes

- The seams are mostly already present: `StakeholderType` is an extensible enum; `LedgerEvent.entityType` already lists `'rationcard' | 'grievance' | 'entitlementrule'` (`packages/shared-types/src/index.ts`); the chaincode rule engine already documents `GRIEVANCE_SLA_BREACH` and `FPS_CLOSING_STOCK_MISMATCH` alert types.
- The biggest POC additions are new stakeholder types, RO-lite authorization, generalized retail receipt, role workbenches, interactive mock-mode actions, and trace rendering; the biggest MVP addition is the full RO lifecycle.
- Pre-existing correctness/security/hygiene issues (chaincode build, auth guard, Fabric submit await, single-key world state, NBF-LITE, etc.) are tracked separately in `glm-analysis-impl.md` and should be resolved in parallel — they are orthogonal to this scope split.
