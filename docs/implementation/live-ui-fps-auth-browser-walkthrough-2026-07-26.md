# Live UI FPS authentication browser walkthrough — 2026-07-26 evening

## Scope

Visible Playwright + Glass run of FPS authentication / issue paths on
`http://localhost:4173` after series `R20260726-171531-22be` (Rice/Wheat custody
already completed earlier the same evening).

`epos-auth-mock` was healthy (`simulationOnly: true`).

## Eligibility honesty (prior step)

The earlier ghost/fraud eligibility browser pass was **not** issue-free:

| Item | Status |
| --- | --- |
| External screening + guided decisions + appeal/reinstate | Worked for `BEN-DEMO-001` and `BEN-DEMO-003` |
| Post-reset entitlement wipe | Broke gate checks until seed July rows were restored (“Eligibility entitlement … was not found”) |
| Guided **Record verification** step | Often skipped/unavailable after **Issue notice** (state jumped) |
| UI Fabric proof vs Postgres | UI showed `COMMITTED` while `eligibility_cases.proof_status` remained `PENDING` for both cases |

So: demo narrative completed, but do **not** claim a clean zero-defect eligibility pass.

## FPS auth cases exercised in UI

### FPS-101 (`demo-fps` / Suresh Jadhav)

| Case | UI action | Result |
| --- | --- | --- |
| Duplicate OTP issue (Rice) | Workbench **Attempt duplicate claim** | **PASS** — “Duplicate claim blocked as expected” / exceeds balance |
| Supervisor exception issue (Rice) | **Approve supervisor exception issue** (10 kg) | **PASS** — distribution `…-RICE-EXCEPTION` with `SUPERVISOR_EXCEPTION` / `EXCEPTION_APPROVED` |
| Duplicate OTP issue (Wheat) | Workbench **Attempt duplicate claim** | **PASS** — blocked as expected |
| Allocations desk | `/allocations` | **PASS** — Rice 300/299 short, Wheat 300/300 |
| Distribution / entitlements desk | `/distribution` | Shows monthly balances; exception Rice lifted to 0 |

Postgres after FPS-101 actions:

| Table | Evidence |
| --- | --- |
| `distribution_transactions` | Rice 25 (`MOCK_OTP`/`SUCCESS`), Wheat 10 (`MOCK_OTP`/`SUCCESS`), Rice exception 10 (`SUPERVISOR_EXCEPTION`/`EXCEPTION_APPROVED`) |
| `audit_alerts` | `DUPLICATE_CLAIM` ×3, `SHORT_RECEIPT` ×3, `UNAUTHORIZED_TRANSACTION` ×1 |
| `auth_transactions` | **0 rows** |

### FPS-202 isolation (`demo-fps-202` / Anita Deshmukh)

| Check | Result |
| --- | --- |
| Banner identity | Anita Deshmukh · FPS Dealer |
| Allocations register | **0 allocations** (shop isolation) |
| Module home “Assigned shop” | **FAIL / UX bug** — still shows **FPS-101** while logged in as Mulshi dealer |

## Gaps (observed during evening walkthrough)

1. **Auth Ledger UI shows 0 records** — workbench distribute path did not call
   `/auth/mock-otp` or `/auth/supervisor-exception` before `POST /distributions`.
2. **FPS-202 module home shop chip** incorrectly labeled **FPS-101** (hardcoded
   JWT fallback; Keycloak users lacked `pds_stakeholder_id`).
3. Full `npm run live:fps-auth` matrix (raw Aadhaar reject, biometric endpoint,
   forced mock FAILURE override, etc.) remains API/script coverage.

## Fixes applied after the walkthrough (code)

| Gap | Fix |
| --- | --- |
| Auth Ledger empty | `executeWorkflowAction` now records auth (`AUTH-{distributionId}`) before distribute |
| FPS-202 Assigned shop | Removed FPS-101 fallback; `GET /auth/fps-assignment` + Keycloak attributes in bootstrap |
| Reset wipes entitlements | Postgres reset keeps/reseeds `monthly_entitlements` (incl. operational month) |
| Eligibility proof PENDING in DB | `refreshProofStatuses` syncs outbox status back to `eligibility_cases` |
| Record verification after notice | UI shows the button in `NOTICE_ISSUED` as well as open/awaiting states |

Unit/typecheck coverage: `@pds/api` auth/eligibility/authorization specs; `@pds/web`
distribute-auth + eligibility-review. Re-run a short browser pass after API/web
restart + Keycloak bootstrap to confirm Auth Ledger rows and FPS-202 chip live.

## Verdict

**PASS with gaps** for the evening browser session (before fixes). Treat Auth Ledger
and FPS-202 shop labeling as fixed in code pending a re-verification pass.

## Demo checklist

1. Complete custody + FPS receipt for at least one commodity first.
2. As FPS-101: show duplicate claim block, then supervisor exception; confirm Auth Ledger has rows.
3. As FPS-202: show empty Allocations and Assigned shop **FPS-202** / Mulshi.
4. After admin reset, confirm July (operational month) entitlements exist before FPS issue.
