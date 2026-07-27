# Eligibility scoring, Trust analytics, and lifecycle capability audit

**Scope:** Current repo behavior vs desired *deterministic integrity scoring + Trust completeness + drift alerts*.  
**Date:** 2026-07-26. Evidence from `apps/eligibility-mock`, `apps/web`, `apps/api`, `packages/shared-types`, and related docs.

## 1. Eligibility-mock / ghost detection

### How it works today

| Concern | Implementation |
| --- | --- |
| Screening status | Categorical `EligibilityScreeningStatus` (e.g. `DEATH_MATCH_REVIEW`, `DUPLICATE_RECORD_REVIEW`, `CLEAR`). Mock maps `demoBeneficiaryId` → fixed scenario in `apps/eligibility-mock/src/screening.ts`. |
| Signals | Array of `EligibilitySignal`: `source`, `status`, `risk` (LOW/MEDIUM/HIGH), `factCode`, fixed `observedAt`. No per-signal score. |
| Recommended action | Opaque string on response (`recommendedReviewAction`); not derived at runtime from rules. |
| Policy / rules | `policy.ruleIds[]` attached to scenario (e.g. `DEATH-MEMBER-01`, `JK-DUPLICATE-LINK-01`). Labels only—no executable policy engine. |
| Duplicate / linkage | J&K demo `BEN-JK-DEMO-001`: `REGISTRY_LINKAGE` signal with `TWO_ACTIVE_REGISTRY_REFERENCES`; status `DUPLICATE_RECORD_REVIEW`. No separate duplicate linkage digest field. |
| Integrity score | **None.** No numeric score, weights, or `ruleId → score` breakdown in types or mock. |
| Explainability | UI shows rule IDs, signals, fact codes, `evidenceDigest`, `responseAttestationHash`. No `/explanation` API or structured rule firing metadata. |
| Attestation | `evidenceDigest = sha256(canonical({ request, signals, policyId }))`; `responseAttestationHash = sha256(canonical(baseResponse))`. Deterministic replays via `screeningRequestId`. |
| ViksitPDS consumption | `apps/api/src/modules/eligibility/eligibility.service.ts`: HTTP client, validation, idempotency, case FSM; CLEAR/portability closes case; review statuses open/update case **without** blocking entitlement until RCMS decision. |

### Key files

- `apps/eligibility-mock/src/screening.ts` — scenario table and digest/attestation generation.
- `apps/eligibility-mock/src/server.ts` — `POST /v1/screenings`, bearer auth.
- `packages/shared-types/src/eligibility.ts` — contracts, validators, case/decision types.
- `apps/api/src/modules/eligibility/*` — client, service, gate, repository, controller.
- `apps/web/src/pages/workspace/EligibilityReviewPage.tsx` — screening UI, case actions, registry lifecycle buttons.
- `docs/implementation/ghost-detection-impl.md` — shipped demo scope.
- `docs/product/ghost-beneficiarty-innovation-feature.md` — **desired** policy-as-code, evaluations, explanation API (mostly not implemented).

### Gaps vs desired deterministic integrity scoring

- No weighted rules, corroboration counts, or numeric integrity/confidence score.
- No evaluation step separate from static scenarios; `checks[]` on request is validated but not used to filter mock output.
- No duplicate **linkage digest** (only generic evidence digest over request+signals).
- No officer-facing structured explanation (rule fired, corroboration, why no auto-cancel).
- Product doc APIs (`POST /eligibility/v1/signals`, `/evaluations`, `GET .../explanation`) not present; actual surface is on-demand `POST /eligibility/v1/screenings` and case mutations.

## 2. Trust / Fabric analytics UI

### What exists

- **Module home:** `apps/web/src/pages/workspace/OverviewPage.tsx` (“Trust & reconcile”) embeds `FabricAnalyticsPanel`.
- **FabricAnalyticsPanel** (`apps/web/src/components/FabricAnalyticsPanel.tsx`):
  - Pipeline summary: COMMITTED, PENDING+SUBMITTING, FAILED, **DEAD_LETTER** counts.
  - Commit success %, oldest outstanding proof age.
  - Module buckets (supply-chain, eligibility, fps): proof counts.
  - By event type table; recent outbox rows with status, fabric TX, **payload hash** (truncated).
  - Detail dialog (Management/Auditor): full `proofPayload`, retry count, failure category, worker error.
- **API:** `ProofsService.getAnalytics()` / `getSummary()` (`apps/api/src/modules/proofs/proofs.service.ts`) reads `ledger_outbox`; types in `packages/shared-types/src/index.ts` (`LedgerProofAnalyticsResponse`).
- **Role cards:** `roleSummaryCards` on Overview still reflect operational demo metrics (alerts, ledger events for Auditor)—not a dedicated “proof completeness % of expected events” widget.

### What is missing

- **Trust completeness widgets:** No UI/API that compares *expected* proofs (e.g. per lifecycle event, eligibility decision, distribution) vs outbox COMMITTED rows.
- **Missing-proof alerts:** No automated alert when an operational mutation lacks a COMMITTED proof or `fabric_tx_id`; lifecycle UI shows `registry.pendingProofs` count only on Eligibility page.
- **Drift detection:** No comparison between PostgreSQL projection/event `evidenceDigest` and outbox/Fabric `payloadHash` or nested proof payload fields. `reconcileAlerts` in engine is supply-chain oriented, not registry/proof digest parity.
- **Dedicated dead-letter queue UX:** Count shown in analytics cards only; no drill-down filter, manual retry from UI, or alert surfacing on Overview `AlertsSummary`.
- **ePoS proof module:** FPS auth proofs bucket exists in analytics classification; separate from eligibility screening attestation.

## 3. Beneficiary lifecycle → projection → entitlement gate

### State machine (registry)

- Event types: `packages/shared-types/src/beneficiary-registry.ts` (`BENEFICIARY_CREATED`, `MIGRATION_RECORDED`, `HOUSEHOLD_BIFURCATED`, `MEMBER_REMOVED`, `RECORD_DEACTIVATED`, etc.).
- Projection: `BeneficiaryRegistryRepository.nextProjection()` updates `householdSize` via `householdSizeDelta`, `districtCode` on migration, `state` on deactivation; optimistic version; each new event sets `proofStatus: PENDING` and enqueues ledger outbox (Postgres path).
- UI triggers: Eligibility review page buttons — Register, Record migration, Record bifurcation (`recordLifecycle()` → `submitBeneficiaryLifecycleEvent`).

### Death / screening path (parallel, not auto-wired)

- Death **screening** → eligibility case → verification (`DECEASED_MEMBER_CONFIRMED` for `BEN-DEMO-001`) adjusts household/entitlement in **eligibility service**, not via `MEMBER_REMOVED` lifecycle event.
- RCMS **decision** (`CARD_CANCELLED` / `TEMPORARILY_SUSPENDED`) sets in-memory `eligibility-gate` and persists case; `pds-runtime.validateEntitlement` calls `assertEligibilityGateOpen(rationCardHash)`.
- **Entitlement gate demo:** `POST /eligibility/v1/entitlement-gate` and UI “Check entitlement gate”; distribution blocked only when gate blocked + balance checks.

### Gaps

- Lifecycle events and eligibility case workflow are **manually** demoed; no automatic projection update when screening verifies death (member removal is decision action, not registry `MEMBER_REMOVED`).
- `MIGRATION_RECORDED` / bifurcation in UI use simplified deltas (e.g. bifurcation `-1` only); not tied to screening `PORTABILITY` / `HOUSEHOLD_SPLIT_PENDING` signals.
- Registry projection `state` stays `ACTIVE` for migration/bifurcation unless `RECORD_DEACTIVATED` / explicit `newState`.
- Gate state is process-local Map (`eligibility-gate.ts`); restored from DB on eligibility repository load for cases with blocked flag, but not a full SMART-PDS sync.

## 4. epos-auth-mock attestation (if relevant)

- **Pattern:** Idempotent `authTxnId`, scenario lookup by `aadhaarRefHash` / `rationCardHash`, fixed `assessedAt`, **no** response attestation hash (contrast eligibility mock).
- **Types:** `packages/shared-types/src/epos-auth.ts` — privacy validators, modes OTP/biometric/supervisor exception.
- **Engine:** `apps/epos-auth-mock/src/auth-engine.ts`.
- Distribution path uses auth result + `authTxnRefHash` in ledger engine; not cross-linked to eligibility `responseAttestationHash`.

## Recommended next actions (for desired target state)

1. Add optional `integrityScore` + `ruleContributions: { ruleId, weight, fired }[]` to shared types; implement deterministic evaluator in eligibility-mock (or API) reading versioned policy JSON.
2. Add duplicate linkage digest field when `REGISTRY_LINKAGE` fires (hash of opaque linkage refs only).
3. Trust API: `GET /proofs/v1/completeness` — expected vs actual by entity/event type; surface on Overview + alert when gap &gt; 0 or DEAD_LETTER &gt; 0.
4. Drift job: for COMMITTED rows, recompute `payloadHashFor(proofPayload)` and compare to outbox; optional compare lifecycle `evidenceDigest` to proof payload nested hash.
5. Wire optional lifecycle `MEMBER_REMOVED` from authorized eligibility decision for demo coherence.
