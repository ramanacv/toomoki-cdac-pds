# FPS beneficiary authentication success + failure lifecycle

Last updated: 2026-07-26

## Scope

Inventory and addition of a comprehensive live script for Fair Price Shop (FPS)
beneficiary authentication outcomes through the API ↔ `epos-auth-mock` seam,
including failure paths and distribution gates.

## Prior coverage (gap)

| Artifact | What it covered | Gap |
| --- | --- | --- |
| `scripts/live-lifecycle.mjs` | One happy-path `POST /auth/mock-otp` then distribution | No failure matrix; does not require epos-auth-mock |
| `scripts/live-beneficiary-lifecycle.mjs` | Registry + eligibility fraud narrative | No FPS auth endpoints |
| `apps/epos-auth-mock/test/server.test.ts` | Mock HTTP unit cases | Not an authenticated API lifecycle |
| `apps/api/test/epos-auth-client.spec.ts` | Client adapter unit tests | No live stack |
| `apps/api/test/distributions.module.spec.ts` | Supervisor-exception alert in-process | Not mock-wired |

## New script

`scripts/live-fps-auth-lifecycle.mjs` — npm scripts:

- `npm run live:fps-auth` — live run against API + mock
- `npm run test:fps-auth` — syntax + unit/static gates

## Cases exercised

1. epos-auth-mock health (`simulationOnly`)
2. API wiring — client claims `SUCCESS`, mock `aadhaar-demo-fail-hash` forces `FAILURE`
3. Direct mock reason codes for success / fail / suspended / demographic mismatch
4. API OTP success, biometric success
5. API failures via aadhaar and ration-card scenario keys
6. FPS-scoped `/auth/transactions` listing
7. Raw Aadhaar / raw numeric beneficiary ref rejected (`400`)
8. Conflicting `authTxnId` reuse (`400`) and duplicate ledger auth (`409`)
9. Distribution rejected after `FAILURE`
10. Supervisor-exception auth → distribution + `UNAUTHORIZED_TRANSACTION` alert
11. OTP success distribution when FPS-101 Rice stock is available

## Privacy

Request bodies use opaque `*RefHash` / `*Hash` values. The script intentionally
POSTs a synthetic raw-looking `123412341234` once to assert HTTP `400` rejection;
that probe is not persisted in evidence beyond the status code. It never sends
OTP values, biometrics, phone numbers, or full ration-card numbers.

## Verification status

Commands run on 2026-07-26 against local Fabric + epos-auth-mock:

| Check | Result |
| --- | --- |
| `npm run test:fps-auth` | Passed (mock + shared-types + API static/unit) |
| `npm run live:fps-auth` | Passed — run `FPS-AUTH-20260726120009` (20 cases) |
| Mock wiring | Passed — client `SUCCESS` overridden to mock `FAILURE` |
| Distribution after auth failure | Passed — HTTP 400 |
| Supervisor-exception path | Passed — distribution + `UNAUTHORIZED_TRANSACTION` alert |

Evidence (local only, not committed): `/tmp/pds-live-fps-auth/FPS-AUTH-20260726120009.json`.

## Limitations

- Controlled demo simulation — not a live UIDAI / AePDS integration.
- Successful distribution cases require FPS-101 Rice stock ≥ `2 × DISTRIBUTION_KG`
  (typically after `live-lifecycle`); otherwise the script fails closed.
- Auth transaction records store `authResult`, not mock `reasonCode`; reason
  codes are asserted via direct mock calls.
- Outbox / Fabric proof completion is deferred to `live-lifecycle.mjs`.
- Does not prove crash atomicity or concurrent command safety.
