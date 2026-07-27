# Mocks-only integrity + proof completeness

Living status for the mocks-only beneficiary/eligibility integrity and Fabric
proof completeness work. Constraints: mocks/fixtures only, no AI/ML, no live
UIDAI/CRS/SMART-PDS, no PII on Fabric, PostgreSQL authoritative, chaincode
evidence-only.

## Status (2026-07-26)

| Phase | Scope | Status |
| --- | --- | --- |
| 1a | Eligibility checkpoint proofs (NOTICE / VERIFICATION / RECOMMENDATION / APPEAL + decision/reinstate) | Done |
| 1b | Parametric outbox coverage for all 9 `BENEFICIARY_*` types | Done |
| 1c | Trust completeness widgets (expected vs COMMITTED, missing, dead-letter) | Done |
| 2 | Deterministic integrity score + linkageDigest duplicate fixtures + explainability UI | Done |
| 3 | Verification → `MEMBER_REMOVED` registry bridge; gate restored from durable cases | Done |
| 4 | Projection/proof drift + missing-proof alerts in analytics | Done |
| 5 | Docs / claim hygiene | Done (this document + assumption updates) |
| 6 | Supply-chain atomic command+outbox | Deferred to [mvp-hardening-plan.md](mvp-hardening-plan.md) |

## Honest claims (after this work)

Allowed:

- Mock integrity review correlates privacy-safe signals and routes officers to
  authorized RCMS decisions.
- Authorized beneficiary lifecycle decisions are asynchronously anchored on
  Fabric as tamper-evident, hash-only proofs.
- Deterministic mock lifecycle rules update operational status; Fabric proofs
  make unauthorized or missing evidence visible.

Forbidden on slides:

- Live biometric / Aadhaar oracle
- AI / ML de-duplication
- Real CRS/UIDAI/SMART-PDS connectivity
- Chaincode automatically changing beneficiary status
- PII or DPDP-sensitive data on the ledger
- “Zero silent drift” while supply-chain snapshot/outbox waiver remains

## Proof matrix

| Action / event | Fabric event type | Outbox |
| --- | --- | --- |
| All 9 beneficiary lifecycle types | same `eventType` | Yes (atomic with projection) |
| Eligibility NOTICE | `EligibilityNoticeIssued` | Yes |
| Eligibility VERIFICATION | `EligibilityVerificationRecorded` | Yes |
| Eligibility RECOMMENDATION | `EligibilityRecommendationRecorded` | Yes |
| Eligibility APPEAL | `EligibilityAppealOpened` | Yes |
| Eligibility DECISION | `EligibilityDecisionAuthorized` | Yes (+ RCMS/entitlement) |
| Eligibility REINSTATEMENT | `EligibilityDecisionReversed` | Yes (+ RCMS/entitlement) |
| Eligibility SCREENING | — | No (`NOT_REQUIRED`) |

## Key paths

- Checkpoint enqueue: `apps/api/src/modules/eligibility/eligibility.repository.ts`
- Completeness + drift: `apps/api/src/modules/proofs/proofs.service.ts` (`completeness`)
- Trust UI: `apps/web/src/components/FabricAnalyticsPanel.tsx`
- Deterministic scoring: `apps/eligibility-mock/src/scoring.ts`
- Registry bridge on deceased-member verification: `EligibilityService.bridgeDeceasedMemberRemoval`

## Phase 6 note

Beneficiary registry and eligibility checkpoint/final paths are already
row-scoped atomic (business row + outbox in one transaction). Broader “immutable
ledger” language for supply-chain still waits on
[mvp-hardening-plan.md](mvp-hardening-plan.md) replacement of snapshot + separate
outbox in `pds-runtime`.

## Verification commands (beneficiary-focused)

```sh
# Unit/integration matrix for lifecycle states + fraud review paths
npm run test:beneficiaries

# Supply-chain stock positive/negative lifecycle script gates (static)
npm run test:lifecycle

# Live supply-chain Fabric lifecycle (needs OIDC service token)
PDS_BENCHMARK_CLIENT_SECRET=... PDS_ALLOW_RESET=true node scripts/live-lifecycle.mjs

# Live beneficiary registry + eligibility exercise (needs OIDC service token)
PDS_BENCHMARK_CLIENT_SECRET=... npm run live:beneficiaries

# Live FPS auth success/failure matrix against epos-auth-mock (needs OIDC + mock token)
PDS_BENCHMARK_CLIENT_SECRET=... \
PDS_EPOS_AUTH_SERVICE_TOKEN=... \
EPOS_AUTH_BASE=http://127.0.0.1:3011 \
npm run live:fps-auth
```
