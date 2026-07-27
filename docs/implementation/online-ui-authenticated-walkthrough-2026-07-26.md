# Online UI authenticated walkthrough — 2026-07-26

## Scope

Browser walkthrough of the Docker Compose ViksitPDS web UI at
`http://localhost:4173` with Keycloak OIDC personas. Screenshots were captured
during the session under the Playwright MCP output directory (not committed).

Environment at run time: `api`, `web`, `postgres`, `keycloak`,
`eligibility-mock`, `epos-auth-mock`, and local Fabric peers were healthy.
Ledger mode observed in admin: `fabric` with PostgreSQL persistence.

## Entry

`/role-login` module-first chooser worked for all five entries (Supply chain,
Card & eligibility, FPS authentication, Trust & reconcile, Platform admin).
Persona continue buttons pre-filled Keycloak `login_hint` and completed
Authorization Code + PKCE against `localhost:4173` (not `127.0.0.1`).

## Personas and screens exercised

| Persona | Username | Module landing | Screens visited | Workflow actions |
| --- | --- | --- | --- | --- |
| FCI Depot Officer | `demo-fci` | `/m/supply-chain` | Workbench, Lots, Transfers, Trust home, Dashboard, Verify | Workbench **Run action** available (Stage-I style queue) |
| Godown Operator | `demo-godown` | `/m/supply-chain` | Module home, Workbench, Lots, Transfers, Verify | Workbench actions present |
| DSO (supply) | `demo-department` | `/m/supply-chain` | Module home, Workbench, Transfers, Verify, Dashboard | **Run action** advanced commodity queue |
| Eligibility officer (DSO) | `demo-department` | `/m/eligibility` | Module home, `/eligibility` | Selected beneficiary; **Run external eligibility check** invoked |
| BSO | `demo-block-office` | `/m/supply-chain` | Module home, Workbench, Allocations, Transfers, Verify | No runnable action (upstream waiting) |
| FPS Haveli | `demo-fps` | `/m/fps` | Module home, Workbench, Allocations, Distribution, Verify | Workbench buttons showed upstream waits; Allocations/Distribution showed existing auth ledger rows |
| FPS Mulshi | `demo-fps-202` | `/m/fps` | Module home, Workbench, Allocations, Distribution | Shop isolation visible: **0 allocations** vs FPS-101 |
| Auditor | `demo-auditor` | `/m/trust` | Module home, Dashboard, Stakeholders, Verify, Eligibility | Read-only trust views; Dashboard showed open alerts |
| Platform admin | `demo-platform-admin` | `/admin/overview` | Overview, Network, Stakeholders, Ledger, Alerts, Tools | Admin console reachable after clean Keycloak logout/login |

## Verified UI outcomes

- Live API badge and role-scoped module nav rendered for operational personas.
- Supply-chain lots/transfers showed live seeded + lifecycle records (multiple
  commodities; growing transfer count as actions ran).
- FPS-101 allocations/distribution showed beneficiary auth ledger rows with
  privacy-safe hashes and Fabric proof status chips.
- FPS-202 showed empty allocation register (shop isolation).
- Trust Overview loaded operational summary and Fabric proof analytics language
  (supply / eligibility / FPS buckets).
- Admin Network reported `fabric` ledger mode, `postgres` persistence,
  channel `pdschannel`, chaincode `pds-chaincode`.
- Admin Ledger pipeline sample: committed proofs present; dead-letter count
  non-zero (requires separate proof-retry attention).
- Admin Alerts listed open `UNAUTHORIZED_TRANSACTION` HIGH signals.

## Blockers and defects observed

1. **Eligibility case create FK failure** — Online **Run external eligibility
   check** surfaced:
   `insert or update on table "eligibility_cases" violates foreign key
   constraint "eligibility_cases_ration_card_hash_fkey"`.
   External service itself reported `HEALTHY`; entitlement remained unchanged.
2. **Keycloak VERIFY_PROFILE** — `demo-fps-202` required an email on first
   login (`Update Account Information`). Other personas did not hit this in
   the same run.
3. **API rate limiting** — Rapid multi-persona navigation produced
   `Online service unavailable / Rate limit exceeded` with no silent mock
   fallback (correct online-mode behavior, but interrupts demos if personas
   are switched quickly).
4. **Session sticky without Keycloak end-session** — Clearing only
   `sessionStorage` was insufficient; app **Log out** (`signoutRedirect`) was
   required for clean persona switches. Incomplete logout previously showed
   wrong journey copy / Forbidden on admin.
5. **Audit-alerts deep link** — Direct `/audit-alerts` sometimes bounced to a
   module home depending on active module/role context; auditor eventually
   reached alerts content via trust/admin surfaces.
6. **Upstream-gated workbench** — FPS and BSO often showed
   `Waiting for Godown Operator` / `Waiting for FCI Depot Officer` rather than
   runnable issue/auth actions, so full end-to-end custody→issue was not
   completed in one continuous authenticated pass.

## Recommended next actions

1. ~~Fix eligibility case insert against `ration_card_hash` FK~~ — addressed:
   idempotent `seed.sql` + Compose `seed-reference-data` + repository
   `ensureRationCardParent` before case write; re-run `npm run iam:bootstrap`
   (applies seed) or `docker compose up seed-reference-data` on retained volumes.
2. ~~Pre-complete Keycloak profile email for all demo users~~ — addressed in
   `iam:bootstrap` (`email` / `emailVerified` / clear `requiredActions` + disable
   realm `VERIFY_PROFILE`). Re-run bootstrap so `demo-fps-202` is updated.
3. ~~Document demo persona-switch cadence / raise read rate limits~~ — Compose
   demo defaults are now 600/120; web surfaces a distinct 429 message.
4. ~~Run a single-pass live lifecycle before UI demos~~ — documented in
   `docs/product/assumptions-for-demo.md`; workbench shows an upstream-wait
   banner when the role has no runnable actions.
5. ~~Investigate non-zero `DEAD_LETTER` RegisterStakeholder proofs~~ — proof
   boundary now redacts stakeholder display names; new stakeholder proofs can
   commit. Legacy DEAD_LETTER rows from before the fix may remain until an
   authorized reset or manual retry.

## Follow-up applied (same day)

See the code changes for IAM bootstrap, role-login SSO end-session, eligibility
parent ensure, idempotent seed, Compose seed job, and `ledgerProofFromEvent`
stakeholder redaction. Re-bootstrap IAM and re-apply seed on the running stack
before re-testing online eligibility / FPS-202 first login.

## Evidence commands

- HTTP health: `GET http://localhost:4173/` → 200; `GET http://localhost:3000/health` → `{"ok":true}`.
- Browser automation: Playwright MCP against `http://localhost:4173` with
  Keycloak at `http://localhost:8080`.
- Offline fixture supplement (`http://127.0.0.1:4174`) was available earlier
  but was not the primary path once demo credentials were provided.
