# Visual test: `feature/ghost-beneficiary-eligibility`

**Date:** 2026-07-23  
**Scope:** Browser walkthrough of the Eligibility review workspace on this branch  
**Commit:** `2418eaa` — feat: add beneficiary eligibility screening and review

## Environment

| Surface | URL | Mode |
|---|---|---|
| Local mock preview | http://127.0.0.1:4174 | `VITE_DATA_SOURCE=mock` (offline fixtures) |
| Docker Compose web | http://127.0.0.1:4173 | Online API + Keycloak |
| Eligibility mock | http://127.0.0.1:3010 | Profile `eligibility` |

Docker images were rebuilt for this branch. PostgreSQL already contained the additive eligibility/registry tables at retest time (`eligibility_cases`, `eligibility_case_actions`, `eligibility_screenings`, `beneficiary_registry_projection`, `beneficiary_lifecycle_events`). Online mutating flows were **not** exercised because `PDS_DEMO_USER_PASSWORD` is not available in this session.

## Verified outcomes

### Offline fixture UI (primary visual pass)

- Login advertises **Eligibility review** for Control Office / Management / Auditor personas.
- Control Office (`DSO / FDO / TSO`) reaches `/eligibility` with:
  - amber synthetic-service banner and fictional policy `MH-PANEL-DEMO-2026-V1`;
  - offline read-only alert;
  - summary cards, registry lifecycle, planning-impact, and beneficiary table;
  - nine fixture rows (five MH `BEN-DEMO-*` + four JK `BEN-JK-DEMO-*`);
  - masked card refs only; no Aadhaar wording in page text;
  - **Run external eligibility check** and lifecycle actions disabled in offline mode.
- Management and Auditor also see Eligibility review; actions remain disabled.
- FPS persona does **not** get an Eligibility review nav item.
- Beneficiary row selection highlights the chosen row.
- No console errors observed during the eligibility navigation path.

### Online Compose surface (partial)

- Docker web serves the rebuilt bundle containing Eligibility review / external-simulation copy.
- API health is OK; unauthenticated `GET /eligibility/v1/summary` returns `401` as expected.
- Login and `/role-login` render correctly (“Backend reachable”, Keycloak personas including `demo-department`).
- Interactive screening / guided case actions were blocked without the local demo Keycloak password.

## Visual / UX findings

| Severity | Finding | Evidence |
|---|---|---|
| Medium | Desktop summary card truncates `NOT_CONFIGURED` in the four-column metric row (`scrollWidth` > `clientWidth` on the status value). Mobile single-column shows the full string. | Desktop eligibility screenshot; DOM overflow check |
| Low | Narrow viewport reports page-level horizontal overflow (~530px content on 390px width) despite table `overflow-x-auto`. Likely wide table expanding layout. | Mobile resize measurement |
| Info | Product docs still describe “five” Maharashtra profiles; fixtures/UI now also list four JK profiles (nine total). | `mock/entities/eligibility-beneficiaries.json` |
| Info | Offline Control Office correctly cannot run screening; online interactive proof still needed for the happy-path demo. | Code: `mutable = role === 'CONTROL_OFFICE' && !offline` |

## Not covered (needs credentials / explicit auth)

1. Keycloak sign-in as `demo-department` / auditor.
2. Live **Run external eligibility check** against eligibility-mock.
3. Guided notice → verification → decision / appeal / reinstate UI states.
4. Entitlement gate allow/block after RCMS decision.
5. Fabric proof status badges after a final decision.

## Recommended next actions

1. Soft-wrap or shorten service-status display in the metric cards (e.g. `break-all` / smaller type / tooltip for `NOT_CONFIGURED`).
2. Contain table overflow so mobile page width stays within the viewport (`min-w-0` on main column / ensure only the table scrolls).
3. Align product copy with nine MH+JK fixture profiles.
4. Prefer `http://localhost:4173` for OIDC demos; `http://127.0.0.1:4173` fails Keycloak `redirect_uri` validation for `pds-web`.
5. Re-run an authenticated online visual pass once `PDS_DEMO_USER_PASSWORD` is available in the shell (eligibility service token is already present; no secret commits).

## Recheck — 2026-07-23 19:30 IST (`f3fa199`)

Re-ran after `fix: migrate postgres schema before api startup`.

### Verified now healthy

| Check | Result |
|---|---|
| `api` / `web` / `eligibility-mock` | Healthy |
| Schema tables | Present (`eligibility_*`, registry projection/lifecycle) |
| `schema-migrate` Compose service | Present; API no longer dies on missing relations |
| Unauthenticated eligibility routes | `401` (not `404`) |
| Offline Eligibility UI | Banner, 9 beneficiaries, actions disabled — confirmed |
| Role gating | Management/Auditor see nav; FPS does not |
| `@pds/web` eligibility + shell tests | **18/18 passed** |
| OIDC via `http://localhost:4173/role-login` | Keycloak sign-in form opens; username prefilled `demo-department` |

### Still open

| Issue | Status |
|---|---|
| Desktop `NOT_CONFIGURED` metric overflow (`scrollWidth` 237 > `clientWidth` 230) | Still present |
| Mobile page horizontal overflow (~530px on 390px) | Still present |
| Authenticated online screening / guided case actions | Blocked — `PDS_DEMO_USER_PASSWORD` still unavailable |
| OIDC via `http://127.0.0.1:4173` | **Fails** with Keycloak `Invalid parameter: redirect_uri` |

Use `localhost`, not `127.0.0.1`, when continuing the online UI walkthrough.

## Authenticated online re-run — 2026-07-26 evening

Visible Playwright + Glass walkthrough on `http://localhost:4173` after the
two-commodity Admin Tools reset series `R20260726-171531-22be`.

### Preconditions observed

- `eligibility-mock` healthy (`GET /health` → `simulationOnly: true`).
- External service summary on Eligibility review: **HEALTHY**.
- Admin reset had wiped `monthly_entitlements`. Before guided decisions /
  gate checks, seed July Rice rows for `ration-card-demo-*` and
  `ration-card-jk-demo-*` were restored (same heads-up as FPS issue: without
  them the UI surfaces “Eligibility entitlement … was not found”).

### Scenario A — ghost / death-match (`BEN-DEMO-001` Asha Patil)

| Step | Result |
| --- | --- |
| Select row + **Run external eligibility check** | `DEATH_MATCH_REVIEW`; `DEATH_REGISTRY` **MATCH · HIGH**; integrity **40/100**; recommended `VERIFY_MEMBER_AND_RECALCULATE_HOUSEHOLD` |
| **Entitlement gate check** (pre-decision) | **Distribution allowed** · RCMS ACTIVE · 25 kg available (review alone does not block) |
| Guided actions | Issue notice → Recommend ineligible → **Authorize member removal** |
| Case after decision | `DECIDED` path then **Accept appeal** → **Reinstate** |
| Final UI | Guided state **REINSTATED**; gate **Distribution allowed · ELIGIBLE**; Fabric proof shown **COMMITTED** in UI |

### Scenario B — economic / fraud-band cancellation (`BEN-DEMO-003` Meera Kulkarni)

| Step | Result |
| --- | --- |
| External screening | Opened case; income/GST high-band signals (mock) |
| Guided actions | Issue notice → Recommend ineligible → **Authorize cancellation** |
| Planning impact during cancelled state | Baseline 195 → **180 kg/month** (−15 kg); indicative subsidy **₹−450** |
| Gate after cancellation (before appeal) | Exercised in-run; planning impact confirmed entitlement planning drop |
| Accept appeal → Reinstate | Planning restored to **195 kg/month** / ₹0 delta |
| Final UI | Case **REINSTATED**; gate **Distribution allowed · ELIGIBLE** · 10 kg available after 5 kg lifted |

### Summary metrics after both paths

| Metric | Value |
| --- | ---: |
| Open cases | 0 |
| Decisions / appeals | 2 / 2 |
| Reversals / quarantine | 2 / 0 |

### Honesty / gaps from this evening pass

| Item | Status then | Fix status |
| --- | --- | --- |
| Post-reset `monthly_entitlements` wipe | Broke gate until SQL reseed | Fixed in API reset (keep/reseed entitlements + operational month) |
| **Record verification** after Issue notice | Often unavailable in UI | Fixed — button shown in `NOTICE_ISSUED` |
| UI proof `COMMITTED` vs DB `PENDING` | Mismatch on `eligibility_cases.proof_status` | Fixed — outbox status synced back to cases |

### Verdict

**PASS for authenticated online ghost/fraud demo path** on this stack: external
screening, human-authorized decisions, planning-impact simulation, appeal /
reinstate, and entitlement-gate allow after reinstatement all exercised in a
visible browser. Do not claim zero-defect proof-status durability for that
evening session; re-verify after the fixes above.

### Demo checklist

1. Prefer `localhost:4173` for Keycloak.
2. After Admin Tools reset, entitlements should already be present (no manual
   SQL); if an older API build is running, restore seed July rows before gate demos.
3. Show `BEN-DEMO-001` for death-registry ghost review; show `BEN-DEMO-003` for
   cancellation → blocked planning → appeal → reinstate.
4. Optional: after Issue notice, use **Record verification** before recommend.
