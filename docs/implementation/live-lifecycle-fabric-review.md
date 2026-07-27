# Live lifecycle script — Fabric alignment review

Last updated: 2026-07-25

## Scope

Review and repair of `scripts/live-lifecycle.mjs` against the current OIDC +
FPS-scoped API, then a Fabric-mode run through beneficiary distribution with
per-step quantity checks and outbox proof completion.

## Findings fixed

1. **Stale shortage alert filter** — the script counted alerts using
   `procToFci` / `depotToIssue` ids that the current FCI→state→block→FPS route
   never creates, and hard-coded an alert count of `4` while Rice only raises
   three `SHORT_RECEIPT` alerts.
2. **FPS-scoped stock reads** — `pds-benchmark` includes the `fps` role and is
   assigned to `FPS-101`, so `GET /stock` only returns that shop. Upstream
   FCI/godown stock assertions against `/stock` were invalid. The script now
   keeps an explicit mass-balance ledger for every step and reads `/stock` only
   for FPS-101.
3. **Beneficiary quantity** — Rice previously set entitlement and distribution
   to the entire FPS receipt (4400 kg). It now uses the fixture-scale monthly
   entitlement (`25` kg) while preserving the short-receipt supply path.
4. **Auth body** — `POST /auth/mock-otp` no longer sends `authMode` (endpoint-
   derived) and includes opaque `aadhaarRefHash` for the ePoS auth seam.
5. **Proof completion** — waits on run-scoped ledger events, polls more often,
   and fails if `/admin/proofs/summary` still has `PENDING` /
   `SUBMITTING` / `FAILED` / `DEAD_LETTER` rows.

## Current Rice quantity path

| Step | Dispatched / allocated | Received / lifted | Shortage |
| --- | ---: | ---: | ---: |
| FCI → state godown | 5000 | 4900 | 100 |
| State → block godown | 4800 | 4750 | 50 |
| Block → FPS-101 | 4500 | 4400 | 100 |
| Beneficiary lift | — | 25 | — |

End balances: FCI `lotQty-5000`, state `100`, block `250`, FPS `4375`,
entitlement available `0`.

## Negative deficit scenarios

After the happy path, the script also exercises rejected deficit attempts and
checks that durable audit alerts remain (Postgres mutation rollbacks now keep
`RaiseAuditFlag` evidence):

| Case | Expected HTTP | Alert |
| --- | --- | --- |
| Duplicate / over-entitlement claim | 4xx | `DUPLICATE_CLAIM` |
| Over-allocation beyond block stock | 4xx | `UNAUTHORIZED_TRANSACTION` |
| Unauthorized Stage-II dispatch | 4xx | `UNAUTHORIZED_TRANSACTION` |
| FPS over-receipt above allocation | 4xx | `UNAUTHORIZED_TRANSACTION` |
| Follow-up FPS short receipt | success | `SHORT_RECEIPT` |

Set `NEGATIVE_TESTS=false` to skip this block.

## Runtime prerequisites

```sh
# API must be fabric + postgres, reset enabled for this controlled run
PDS_ALLOW_RESET=true
PDS_BENCHMARK_CLIENT_SECRET=...   # or PDS_E2E_ACCESS_TOKEN
node scripts/live-lifecycle.mjs
```

Evidence JSON is written under `/tmp/pds-live-lifecycle/` (not committed).

## Verification status

Commands run on 2026-07-25 against the local Fabric stack:

| Check | Result |
| --- | --- |
| `npm run test:lifecycle` | Passed (16 tests, includes rejection-alert + exception filter) |
| `node scripts/live-lifecycle.mjs` (Fabric) | Passed — run `LIVE-20260725113823` |
| Operational completion | Passed — happy path + 5 negative deficit cases |
| Lifecycle proof completion | Passed — 27 required proofs `COMMITTED` with Fabric tx ids |
| Stakeholder proof completion | Redacted at API proof boundary — display `name` / `dealerName` stripped before `RecordLedgerProof` |

Evidence (local only, not committed): `/tmp/pds-live-lifecycle/LIVE-20260725113823.json`.

Happy-path Rice end state before negatives: FCI `5000`, state `100`, block `250`,
FPS `4375`, entitlement available `0`. After the extra FPS short-receipt negative
case, FPS stock is `4424`.

Negative alerts observed as durable rows: `DUPLICATE_CLAIM`, three
`UNAUTHORIZED_TRANSACTION` (over-allocation, unauthorized Stage-II, FPS
over-receipt), and an additional `SHORT_RECEIPT`.

## Limitations

- Controlled single-replica demo persistence waiver still applies.
- Upstream stock is not re-read from `/stock` under the FPS-scoped service
  token; conservation is asserted from the planned ledger and mutation
  responses, with FPS stock confirmed via `/stock`.
- `RegisterStakeholder` operational payloads may still include display `name`
  in PostgreSQL / engine events; the API proof boundary redacts prohibited
  keys before Fabric submission. Legacy `DEAD_LETTER` rows from before that
  fix may remain until reset or manual retry.
- API and chaincode source now allow opaque `aadhaarRefHash` in proofs; the
  lifecycle omits that field until the deployed chaincode is upgraded.
- Rejected mutations now persist `RaiseAuditFlag` audit rows after Postgres
  rollback (required for durable negative-alert assertions).
- This does not prove crash atomicity or concurrent command safety.
- The controlled run temporarily required `PDS_ALLOW_RESET=true`; restore
  `false` afterward for normal demo posture.
