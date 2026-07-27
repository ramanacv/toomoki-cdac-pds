# Beneficiary registry and eligibility proof/outbox coverage

Assessment date: 2026-07-26. Scope: current API behavior for beneficiary lifecycle and eligibility case workflow, not supply-chain/FPS proofs.

## Where proofs are enqueued

| Path | Enqueue site | Trigger |
|------|--------------|---------|
| Beneficiary lifecycle | `apps/api/src/modules/beneficiary-registry/beneficiary-registry.repository.ts` (`applyPostgres`) | Every **new** accepted `POST /beneficiary-registry/v1/events` payload |
| Eligibility final RCMS effect | `apps/api/src/modules/eligibility/eligibility.repository.ts` (`persistFinalDecision`) | `EligibilityService.decision()` and `EligibilityService.reinstate()` only |
| Supply chain (out of scope) | `apps/api/src/modules/core/pds-runtime.ts` (`saveStateChanges`) | Ledger engine mutations — **not** used by beneficiary/eligibility modules |

Outbox worker: `apps/api/src/modules/fabric/fabric-gateway.ledger-port.ts` (polls `ledger_outbox`, calls `FabricGatewayClient.submitLedgerEventAsync` → `ledgerProofFromEvent` in `ledger-proof.ts`).

Analytics bucketing: `apps/api/src/modules/fabric/ledger-proof.ts` (`proofAnalyticsModuleFor`, `ELIGIBILITY_EVENT_TYPES`).

Proof read APIs: `apps/api/src/modules/proofs/proofs.service.ts`.

## Event type catalog

### Beneficiary lifecycle (`packages/shared-types/src/beneficiary-registry.ts`)

`BENEFICIARY_LIFECYCLE_EVENT_TYPES`:

- `BENEFICIARY_CREATED`
- `MEMBER_ADDED`
- `MEMBER_REMOVED`
- `HOUSEHOLD_BIFURCATED`
- `MIGRATION_RECORDED`
- `CARD_TRANSFERRED`
- `VERIFICATION_COMPLETED`
- `STATUS_CHANGED`
- `RECORD_DEACTIVATED`

On-chain/Fabric **eventType** for these proofs equals the lifecycle `eventType` (privacy-safe inner payload in `proofEvent()`).

### Eligibility workflow actions (`packages/shared-types/src/eligibility.ts`)

Case actions: `SCREENING` | `NOTICE` | `VERIFICATION` | `RECOMMENDATION` | `DECISION` | `APPEAL` | `REINSTATEMENT`.

Fabric-facing proof **eventType** (only for final decisions):

- `EligibilityDecisionAuthorized` — all `decision()` outcomes except reinstatement
- `EligibilityDecisionReversed` — `reinstate()` when `decision === 'REINSTATED'`

Intermediate workflow steps do **not** define separate Fabric event type strings.

## Persistence model (atomic vs snapshot)

| Module | Postgres enabled (`PDS_PERSISTENCE_BACKEND=postgres` + `PDS_POSTGRES_DSN`) | Default / in-memory / file-only |
|--------|---------------------------------------------------------------------------|----------------------------------|
| Beneficiary registry | Single transaction: projection + `beneficiary_lifecycle_events` + `ledger_events` + `ledger_outbox` | In-memory maps only; **no** `ledger_outbox`, **no** Fabric queue |
| Eligibility non-final | Single transaction: `eligibility_cases` + `eligibility_case_actions` (and screening tables for `persistScreening`) | Repository persist methods no-op; in-memory only |
| Eligibility final | Single transaction: case + action + `ration_cards_mock` + `monthly_entitlements` + `ledger_events` + `ledger_outbox` | Same no-op gap as above |
| Core PDS ledger | Row-scoped `executeMutationTx` + outbox in one commit when postgres pool present | `persistAfterMutation()` → file snapshot + `appendEvents` (separate steps) |

Beneficiary and eligibility modules **do not** go through `pds-runtime` snapshot persistence.

## Gap matrix

Legend: **yes** = durable outbox row on postgres path; **no** = no outbox by design or implementation; **partial** = depends on backend or only some substates.

| Event / action | Proof enqueued? | Primary files | Notes |
|----------------|-----------------|---------------|-------|
| `BENEFICIARY_CREATED` | yes (postgres) / partial (memory) | `beneficiary-registry.repository.ts`, `beneficiary-registry.controller.ts` | Same code path for all lifecycle types when postgres pool exists |
| `MEMBER_ADDED` | yes / partial | same | Requires positive `householdSizeDelta` |
| `MEMBER_REMOVED` | yes / partial | same | Requires negative delta |
| `HOUSEHOLD_BIFURCATED` | yes / partial | same | |
| `MIGRATION_RECORDED` | yes / partial | same | |
| `CARD_TRANSFERRED` | yes / partial | same | Type exists; demo/tests use subset of types |
| `VERIFICATION_COMPLETED` (registry) | yes / partial | same | Distinct from eligibility case `VERIFICATION` action |
| `STATUS_CHANGED` | yes / partial | same | |
| `RECORD_DEACTIVATED` | yes / partial | same | |
| Eligibility `SCREENING` | no | `eligibility.service.ts` → `persistScreening` | Opens/updates case; `proofStatus: NOT_REQUIRED` |
| Eligibility `NOTICE` | yes (postgres) / partial (no pool) | `transitionAndPersist` → `persistCaseAction` | `EligibilityNoticeIssued` |
| Eligibility `VERIFICATION` | yes (postgres) / partial (no pool) | `verification()` → `persistCaseAction` | `EligibilityVerificationRecorded`; may bridge `MEMBER_REMOVED` |
| Eligibility `RECOMMENDATION` | yes (postgres) / partial (no pool) | `transitionAndPersist` → `persistCaseAction` | `EligibilityRecommendationRecorded` |
| Eligibility `DECISION` | yes (postgres) / partial (no pool) | `decision()` → `persistFinalDecision` | Sets `proofEventId`, `proofStatus: PENDING`; proof type `EligibilityDecisionAuthorized` |
| Eligibility `APPEAL` | yes (postgres) / partial (no pool) | `appeal()` → `persistCaseAction` | `EligibilityAppealOpened` |
| Eligibility `REINSTATEMENT` | yes (postgres) / partial (no pool) | `reinstate()` → `persistFinalDecision` | Proof type `EligibilityDecisionReversed` |
| Clear/portability screening (no open case) | no | `runScreening` early exit | Closes prior case in memory/postgres without outbox |
| Eligibility service unavailable (quarantine) | no | `runScreening` catch | No case mutation; no proof |

### Product-aligned interpretation

Checkpoint proofs (NOTICE / VERIFICATION / RECOMMENDATION / APPEAL) plus final
decision/reinstatement are now enqueued. SCREENING remains `NOT_REQUIRED`.
See [mocks-integrity-proof-completeness-plan.md](mocks-integrity-proof-completeness-plan.md).

### Operational gaps (not enqueue bugs)

- Without postgres, beneficiary and eligibility mutations are not durable and never hit `ledger_outbox` (typical unit/e2e tests use `PDS_PERSISTENCE_BACKEND=file` for the core ledger only).
- Outbox rows store a **LedgerEvent-shaped** JSON blob; the worker wraps with `ledgerProofFromEvent` at submission time (actor defaults to SYSTEM).

## Relevant tests

| File | What it covers |
|------|----------------|
| `apps/api/test/beneficiary-registry.spec.ts` | Projection rules; postgres atomicity includes `ledger_outbox` |
| `apps/api/test/eligibility-postgres-atomicity.spec.ts` | Checkpoint + final decision atomic outbox |
| `apps/api/test/eligibility.service.spec.ts` | Full workflow; `proofStatus: PENDING` on decision |
| `apps/api/test/e2e/eligibility-api.e2e.spec.ts` | HTTP auth; beneficiary registry + eligibility gate flow |
| `apps/api/test/ledger-proof.spec.ts` | Privacy validation; eligibility module analytics bucket |
| `apps/api/test/proofs.service.spec.ts` | Outbox analytics includes eligibility-case rows |
| `blockchain/chaincode/pds-chaincode/test/ledger.test.ts` | Chaincode accepts beneficiary + eligibility decision event types |
| `apps/web/test/eligibility-review.test.tsx` | UI loads registry summary (no proof worker assertion) |
| `packages/shared-types/test/eligibility.test.ts` | Screening contract validation |
| `docs/implementation/eligibility-testing-gap-analysis.md` | Broader eligibility test/deferred work context |

## Recommended next actions

1. Document in demo runbooks that postgres is required for beneficiary/eligibility Fabric proofs.
2. Add integration test: postgres + lifecycle + eligibility checkpoints → outbox COMMITTED (opt-in Fabric).
3. Align memory-mode beneficiary registry with explicit “proof not queued” disposition in API responses when pool is absent.
