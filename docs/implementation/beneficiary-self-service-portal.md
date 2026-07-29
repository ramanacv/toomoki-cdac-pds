# Beneficiary self-service portal (simulated RCMS citizen login)

Scope: respond to the request for an "FPS beneficiary module" where a beneficiary can log in with their Aadhaar, using the J&K and Maharashtra portals as the reference pattern. Confirms the prior gap, records the portal research, and documents the simulation implemented on 2026-07-29.

## Gap confirmation

Before this change ViksitPDS had no beneficiary-facing journey. `apps/web/src/pages/RoleLoginPage.tsx` offered only operational Keycloak personas (FCI, godown, DSO/BSO, FPS dealers, auditor, platform admin). Beneficiaries existed only as data: synthetic fixtures in `mock/entities/eligibility-beneficiaries.json` with `demoAadhaarNumber` (9999-prefixed), `aadhaarRefHash`, `rationCardHash`, entitlement, and FPS tagging, used by the eligibility module and the FPS auth simulation.

## Reference pattern from the state portals

Both states use the same NIC RCMS public-login pattern (verified July 2026):

- **J&K** — [rcms.jk.gov.in](https://rcms.jk.gov.in/indexv.aspx) offers a Public Login where a registered citizen signs in with one of: Aadhaar number, login ID + password, or ration-card number, always verified by an OTP sent to the Aadhaar-seeded mobile of the head of family. Services: application status, ration-card download, modifications, grievances. The J&K SMART-PDS application exposes the same Aadhaar/mobile/ration-card citizen login journeys.
- **Maharashtra** — [rcms.mahafood.gov.in](https://rcms.mahafood.gov.in/) ("Self Service for Ration Card") uses the identical flow: Aadhaar-based OTP to the head-of-family mobile for grievance registration and card self-service. Entitlement visibility is provided by the "Know Your Ration Entitlement" report (RCMH03) on the NFSA state portal, and distribution transparency by AePDS reports and the Mera Ration app.

Key journey properties adopted: 12-digit Aadhaar entry, OTP to the head-of-family Aadhaar-seeded mobile, head-of-family as the signing identity, and read-only card/entitlement/history views.

## What was implemented

A clearly labelled **simulation** of that citizen journey, kept separate from the operational Keycloak identity model, since in a state deployment this journey belongs to SMART-PDS/RCMS (see `docs/product/jkmaha-epos-smartpds-reference.md`, which keeps citizen services out of ViksitPDS's authoritative scope).

### API — `apps/api/src/modules/beneficiary-portal/`

`/beneficiary-portal/v1` endpoints (`@Public()` with a portal-local session, since beneficiaries are not operational personas):

- `POST /login/request-otp` — accepts **only** synthetic demo Aadhaar numbers (must start `9999`); anything else is rejected before lookup and the submitted value is never echoed, logged, or persisted. Matches the head-of-family fixture; family-member numbers get a hint to use the head-of-family number. Returns a challenge with masked mobile and the displayed demo OTP (`123456`). Per-IP request limiting.
- `POST /login/verify-otp` — 5 attempts, 5-minute challenge TTL; issues an opaque in-memory session token (30-minute TTL).
- `GET /me` — masked card ref, masked Aadhaar/mobile, fictional household members (masked member Aadhaar), FPS assignment, and live entitlement status/balance via `EligibilityService.gate` (falls back to fixture values).
- `GET /me/distributions` — ledger distributions filtered strictly to the signed-in card's `rationCardHash`, each with Fabric proof status and `fabricTxId` from `ProofsService` where available.
- `GET /me/auth-history` — ePoS authentication events for the card.
- `POST /me/surrender` — voluntary card surrender (see below).
- `POST /logout`.

### Web — `/citizen`

`apps/web/src/pages/citizen/CitizenPortalPage.tsx` (+ `apps/web/src/citizen-api.ts`): Aadhaar → OTP → dashboard flow with panels for card/household, entitlement balance, distribution history with proof status, and authentication events. The login page (`RoleLoginPage`) gained a separate "Beneficiary self-service" entry card outside the Keycloak persona flow. Simulation boundaries are stated on both pages ("synthetic demo Aadhaar only", "ViksitPDS is not a UIDAI authentication provider").

### Demo arc

FPS dealer (`demo-fps`, FPS-101) records an authentication and distribution against `ration-card-demo-001-hash` → beneficiary signs in at `/citizen` with `999988880001` → sees the issue with its Fabric proof status. This showcases the trust-layer value: a beneficiary independently verifying their own issue history against blockchain-anchored evidence.

## Beneficiary removal from the active list (added 2026-07-29)

Two removal journeys share one idempotent path, `EligibilityService.removeBeneficiaries`:

1. **Officer bulk removal (fraud confirmed).** `POST /eligibility/v1/beneficiaries/removals` (department role only) accepts 1–20 `demoBeneficiaryIds`, a `reasonCode` (`FRAUD_CONFIRMED` or `DUPLICATE_RECORD`), and an idempotency key. The eligibility review workspace (`/m/eligibility`) gained per-row checkboxes, a reason selector, and a "Remove selected" action so an officer can remove several beneficiaries at once after the mock screening services confirm fraud.
2. **Voluntary surrender by the beneficiary.** `POST /beneficiary-portal/v1/me/surrender` requires an active citizen session and the literal typed confirmation `SURRENDER`. The citizen dashboard shows a "Surrender my ration card" panel with a type-to-confirm input; after surrender the dashboard shows a removed-card notice and hides the panel. The idempotency key is deterministic per beneficiary (`CITIZEN-SURRENDER-<id>`), so repeat submissions replay instead of failing. Reason code: `VOLUNTARY_SURRENDER`; the recorded actor is the beneficiary's opaque `subjectRefHash`.

Effects per removed beneficiary:

- `eligibilityStatus` becomes `CANCELLED` and a `removal` record (`reasonCode`, `source`, `removedAt`, `removedBy`, optional `registryProofEventId`) is attached; the eligibility summary keeps the row visible (marked REMOVED in the UI) but excludes it from planning-impact totals.
- The in-process entitlement gate blocks the ration card, so FPS distribution attempts are refused.
- A privacy-safe `RECORD_DEACTIVATED` beneficiary-registry lifecycle event is applied (auto-creating the registry record first when the beneficiary was never registered), which queues a Fabric proof through the existing registry outbox path. Event IDs derive from the idempotency key, so identical replays succeed and conflicting reuse fails.
- Removals are one-way in the demo (no un-remove endpoint); `POST /eligibility/v1/demo/reset` restores the seed list. Removal state is in-memory alongside the eligibility beneficiary overlay, consistent with the controlled-demo persistence limitation.

Already-removed beneficiaries report `ALREADY_REMOVED` and keep their original removal record; conflicting idempotency-key reuse returns 409.

## Privacy boundary (do not weaken)

- Only the synthetic `9999…` demo Aadhaar range is accepted; real-format numbers are rejected before any processing with a warning never to enter a real Aadhaar.
- Responses carry only masked identifiers (`XXXX-XXXX-0001`, `XXXXXX0001`) and fictional fixture names already used by the eligibility demo UI.
- Nothing from the login flow is persisted or written to ledger events, proofs, or logs; the existing recursive proof privacy validation is untouched.

## Verification

- `apps/api/test/beneficiary-portal.spec.ts` — 12 tests: synthetic-only guard (no value echo), malformed input, unknown number, family-member hint, OTP challenge lifecycle and lockout, masked-profile privacy assertions, session enforcement, per-card history scoping across two beneficiaries, OTP request rate limiting, surrender confirmation guard, and the surrender-to-removed-profile flow (gate blocked, opaque actor, idempotent repeat).
- `apps/api/test/beneficiary-removal.spec.ts` — 6 tests: bulk removal with gate blocking and registry deactivation proofs, registry-record privacy (no names/Aadhaar/mobile), idempotent replay and 409 on conflicting key reuse, `ALREADY_REMOVED` preservation, input validation with untouched state on unknown targets, voluntary-surrender source attribution and reset restoration.
- `apps/web/test/citizen-portal.test.tsx` — 5 tests: simulation labelling, full login-to-dashboard flow with masked data and proof status, typed surrender confirmation and removed-state banner, department-removal notice, API rejection surfacing.
- `apps/web/test/eligibility-review.test.tsx` — includes multi-select removal submission and removed-row rendering/selection blocking.
- `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` (556 tests, all workspaces), and `npm run test:demo-http` pass as of 2026-07-29 (the two previously noted lint errors in `apps/epos-auth-mock/src/auth-engine.ts` and `apps/web/test/api-distribute-auth.test.ts` are fixed).

## Limitations and open items

- Sessions/challenges are in-memory and single-replica, consistent with the controlled-demo persistence limitation; they reset on API restart.
- The portal reads beneficiary identity from fixtures; live eligibility case state is overlaid via the entitlement gate only. A pilot would replace this with an authorized RCMS reference adapter.
- Grievance registration (a core RCMS citizen feature) is not simulated; the domain engine's grievance support could back it if requested.
- This module must be presented as a simulation of the state RCMS journey — not as ViksitPDS offering Aadhaar authentication or citizen services in production.
