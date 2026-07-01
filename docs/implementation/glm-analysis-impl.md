# PDS-Chain — Implementation Plan for GLM Analysis Findings

> Companion to [docs/product/glm-analysis.md](../product/glm-analysis.md).
> Generated: 2026-06-25
>
> This is a working plan, not a contract. Tasks are grouped into phases ordered by risk/dependency.
> Each task lists: **Files**, **What to do**, **Acceptance criteria**, and **Tests**.
> Severity tags match the analysis: CRITICAL / HIGH / MEDIUM / LOW.

## Conventions

- Prefer minimal, surgical diffs. No rewrites unless a task explicitly says so.
- Keep build green after every task: `npm run build && npm run lint && npm test`.
- Update docs in the same task as the code change when behavior changes.
- One logical change per commit where practical.

---

## Phase 0 — Repo hygiene & safety nets (do first, unblocks everything)

### T0.1 — Exclude artifacts and NBF-LITE from git (CRITICAL #1, HIGH #9)

**Files**
- `.gitignore`

**What to do**
- Add entries:
  - `NBF-LITE/` (whole tree — it is separate reference tooling, see root README).
  - `blockchain/fabric-network/crypto/`
  - `blockchain/fabric-network/channel-artifacts/`
  - `blockchain/fabric-network/chaincode-packages/`
  - `tmp/`
  - `*.tar.gz` (chaincode packages), `*.pem`, `*-linux` (NBF binaries already covered by NBF-LITE/ but harmless).
- Confirm nothing currently tracked matches the new patterns (they are all untracked per git status, so no `git rm --cached` needed). If any are tracked, `git rm --cached -r` them first.

**Acceptance criteria**
- `git status` no longer shows `NBF-LITE/**`, `crypto/**`, `channel-artifacts/**`, `chaincode-packages/**`.
- `git check-ignore` returns the paths above.

**Tests**
- Manual: `git status --porcelain | grep -c NBF-LITE` → 0.

---

## Phase 1 — Chaincode correctness & build (CRITICAL #2, HIGH #6, #7, #8)

### T1.1 — Fix chaincode build to include Fabric entrypoints (CRITICAL #2)

**Files**
- `blockchain/chaincode/pds-chaincode/tsconfig.json`
- `blockchain/chaincode/pds-chaincode/package.json` (ensure `main`/bundle entrypoint consistency)
- `blockchain/fabric-network/scripts/package-chaincode-bundle.sh` (verify `dist/src/server.js` exists after build)

**What to do**
- Remove the `exclude` for `contract.ts` / `server.ts` (or add them explicitly to `include`).
- Ensure `server.ts` is the Fabric entrypoint exported in the bundle `package.json`.
- Reconcile: source `package.json` `main` should point at the engine (`dist/src/index.js`) for the demo/API path; the **bundle** `package.json` `main` must point at `dist/src/server.js` for Fabric.

**Acceptance criteria**
- `npm run build --workspace=@pds/pds-chaincode` produces `dist/src/contract.js`, `dist/src/server.js`, `dist/src/invoker.js`, `dist/src/index.js`, `dist/src/operations.js`.
- `package-chaincode-bundle.sh` produces a bundle whose `dist/src/server.js` exists and imports `contract.js`.

**Tests**
- Add `blockchain/chaincode/pds-chaincode/test/contract.test.ts` that imports the compiled contract and asserts operation dispatch (see T1.5).

### T1.2 — Initialize stock on `createCommodityLot` (HIGH #6)

**Files**
- `blockchain/chaincode/pds-chaincode/src/index.ts` (`createCommodityLot`, ~`137-142`)

**What to do**
- On lot creation, also initialize `stock[lotId]` (or the per-stakeholder stock record) to `quantityKg` owned by `currentOwner`.
- Emit a stock-opening ledger event so the journal/replay stays consistent.

**Acceptance criteria**
- After `createCommodityLot`, `getCurrentStock` reflects `quantityKg` for the owner.
- `RecordLedgerProof` replay of the create event reproduces the same stock state.

**Tests**
- Unit test: create lot → `getCurrentStock` returns `quantityKg`.

### T1.3 — Reconcile dispatch/receive ownership vs stock semantics (HIGH #6)

**Files**
- `blockchain/chaincode/pds-chaincode/src/index.ts` (`dispatchLot` ~`160-175`, `receiveLot` ~`204`)

**What to do**
- Decide and document the in-transit model. Recommended: on dispatch, deduct sender stock and move the lot to `IN_TRANSIT` with `currentOwner` unchanged until receipt; on receipt, add receiver stock and flip `currentOwner`.
- Or, if ownership transfers at dispatch, introduce an in-transit stock bucket so totals reconcile.
- Validate `dispatchedQtyKg` against remaining lot quantity and lot status (no re-dispatch after RECEIVED).

**Acceptance criteria**
- Stock totals are conserved across dispatch+receive for both orgs in all tested scenarios.
- Re-dispatch of a RECEIVED lot is rejected.

**Tests**
- Extend `test/ledger.test.ts`: dispatch → receive → assert both stock positions; reject double-dispatch.

### T1.4 — Validate `RecordLedgerProof` payloads (HIGH #6)

**Files**
- `blockchain/chaincode/pds-chaincode/src/index.ts` (`applyLedgerEvent` / `projectEventToState` ~`339-346`, `600-650`)

**What to do**
- Restrict the event types accepted by `RecordLedgerProof` to a known allowlist.
- Run each projected event through the same validation path as the corresponding typed operation (or reject business-state-mutating events from this path entirely for fabric mode).

**Acceptance criteria**
- Arbitrary/unknown event payloads are rejected, not silently projected.
- Documented allowlist of events accepted via `RecordLedgerProof`.

**Tests**
- Negative test: `RecordLedgerProof` with unknown event type throws.

### T1.5 — Add MSP/client-identity authorization to the contract (HIGH #7)

**Files**
- `blockchain/chaincode/pds-chaincode/src/contract.ts`
- `blockchain/chaincode/pds-chaincode/src/index.ts` (helper for org/role resolution)

**What to do**
- Use `ctx.clientIdentity.getMSPID()` and `ctx.clientIdentity.getAttributeValue('...')` to gate writes by org/role.
- Map operations to required orgs (e.g. `ReceiveLot` → godown, `AllocateToFPS` → godown, `RecordDistribution` → FPS).
- Keep demo invoker unaffected (no client identity there) but document the divergence.

**Acceptance criteria**
- Unauthorized MSP/role invocations are rejected by the contract.
- Demo path still works.

**Tests**
- `test/contract.test.ts` with a stub `ctx` carrying an MSPID and asserting allow/deny per operation.

### T1.6 — Add file locking to demo invoker (HIGH #8)

**Files**
- `blockchain/chaincode/pds-chaincode/src/invoker.ts` (~`39-59`)

**What to do**
- Guard the read-modify-write on the world-state file with a process-level lock (e.g. `proper-lockfile` or a simple lockfile). Queue concurrent invocations.

**Acceptance criteria**
- Concurrent demo invocations do not lose updates (verified by a concurrency test).

**Tests**
- `test/invoker.test.ts`: spawn N concurrent writes, assert all persist.

> Note: splitting the world state into per-entity keys (the deeper fix for #8) is deferred to Phase 5 as a larger change. T1.6 is the safety net.

---

## Phase 2 — API correctness & security (HIGH #4, #5, #12, #13, CRITICAL #3)

### T2.1 — Fix `FilePdsLedgerPort` statePath argument (HIGH #4)

**Files**
- `apps/api/src/infrastructure/postgres-chaincode-ledger-port.ts:14`
- `apps/api/src/modules/fabric/fabric-gateway.ledger-port.ts:19`

**What to do**
- Pass the correct `statePath` as the first arg, `journalPath` as the second. Thread a `statePath` through config if not already present.

**Acceptance criteria**
- State and journal files are distinct paths; no collision.

**Tests**
- Unit test asserting the two paths differ and both are written.

### T2.2 — Make the ledger port interface async; remove `sync-await` spin loop (HIGH #5)

**Files**
- `apps/api/src/infrastructure/ledger-port.ts`
- `apps/api/src/infrastructure/postgres-state-store.ts`
- `apps/api/src/infrastructure/sync-await.ts` (delete after migration)
- All port implementations and `PdsRuntime`/`PdsLedgerFacade`

**What to do**
- Change `loadState`/`saveState`/`appendEvents` to `async`.
- Update `PdsLedgerEngine` call sites to await.
- Remove the child-process spin loop.

**Acceptance criteria**
- `sync-await.ts` removed; no remaining references.
- All tests pass; no sync-over-async hacks.

**Tests**
- Existing runtime tests; add a postgres-state-store unit test.

### T2.3 — Await Fabric gateway submit (HIGH #12)

**Files**
- `apps/api/src/modules/fabric/fabric-gateway.client.ts` (~`28-31`)
- `apps/api/src/modules/fabric/fabric-gateway.ledger-port.ts` (~`37-41`)

**What to do**
- Await the submit result; surface commit errors; do not return success before ordering/commit confirmation.
- Reconcile dual-write (Postgres + Fabric) ordering and error handling in `appendEvents`.

**Acceptance criteria**
- A failed Fabric submit returns an error to the caller (no false success).
- Documented dual-write behavior (which is source of truth on partial failure).

**Tests**
- Unit test with a stub gateway client that rejects; assert the ledger port propagates the error.

### T2.4 — Harden admin guard (HIGH #13)

**Files**
- `apps/api/src/modules/admin/admin.guard.ts`
- `apps/api/src/modules/admin/admin.config.ts`

**What to do**
- Use `crypto.timingSafeEqual` for token comparison.
- Reject empty tokens before comparing.
- Add rate limiting (per-IP) — use an in-memory bucket or `@nestjs/throttler`.
- Document demo-vs-fabric behavior clearly in DEPLOYMENT.md.

**Acceptance criteria**
- Constant-time comparison; no early-exit on length mismatch that leaks timing.
- Rate limiting active on `/admin/*`.

**Tests**
- `test/admin.guard.spec.ts`: valid token, invalid token, missing token, demo-mode-open, fabric-mode-required, rate limit.

### T2.5 — Authentication baseline for business endpoints (CRITICAL #3)

**Files**
- New `apps/api/src/modules/auth/auth.guard.ts`
- `apps/api/src/app.module.ts` (register globally or per-controller)
- `apps/api/src/modules/auth/auth.module.ts`
- DEPLOYMENT.md (document requirement)

**What to do**
- Introduce a guard that, in `fabric`/pilot mode, requires a valid identity (JWT or mTLS-derived) with a role claim.
- In `demo` mode, allow open access (preserve current dev UX) but log a warning.
- Map roles to operations consistent with the chaincode MSP mapping from T1.5.

**Acceptance criteria**
- In fabric mode, mutating endpoints reject unauthenticated requests.
- In demo mode, behavior unchanged.

**Tests**
- `test/auth.guard.spec.ts` covering both modes.

> JWT issuance is out of MVP scope per the production-considerations section; this task is the enforcement layer. Issuance can be a stub/identity-provider hook.

---

## Phase 3 — Deployment hardening (HIGH #10, #11)

### T3.1 — Multi-stage, non-root Dockerfiles (HIGH #11)

**Files**
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`

**What to do**
- API: builder stage installs all deps + builds only `@pds/shared-types`, `@pds/fixtures`, `@pds/pds-chaincode`, `@pds/api`; runtime stage copies `dist` + `node_modules` prod deps only.
- Web: builder stage builds Vite assets; runtime stage serves with a static server (e.g. `vite preview` or nginx).
- Add `USER node` to both; set `NODE_ENV=production`.
- Add `HEALTHCHECK` to API image (mirrors compose healthcheck).

**Acceptance criteria**
- `docker compose build` produces smaller images; `id` inside container is `node`.
- `docker compose up` still healthy end-to-end.

**Tests**
- Manual: `docker compose up --build -d && curl localhost:3000/health && curl localhost:4173`.

### T3.2 — Align Fabric tool image and fix connection profiles (HIGH #10)

**Files**
- `blockchain/fabric-network/docker-compose.fabric.yml` (tool image version)
- `blockchain/fabric-network/scripts/generate-crypto.sh`, `deploy-chaincode.sh` (tool image tag)
- `blockchain/fabric-network/connection-profiles/*.json`
- `blockchain/fabric-network/scripts/generate-connection-profiles.sh`
- `blockchain/fabric-network/scripts/validate-fabric-artifacts.mjs`

**What to do**
- Bump `fabric-tools` to a 3.1.x tag matching peers/orderer.
- Regenerate connection profiles so the 2 deployed orgs include `channels.pdschannel` with the real peers.
- Make the validator align with the 2-org deployment (either accept 2-org profiles or mark 5-org profiles as "future" and skip them with a warning).

**Acceptance criteria**
- `node blockchain/fabric-network/scripts/validate-fabric-artifacts.mjs` passes for the 2-org deployment.
- `bootstrap-network.sh` + `docker compose --profile fabric up` produces a healthy fabric stack.

**Tests**
- `node scripts/smoke-fabric-gateway.mjs` passes with `verificationSource=chaincode`.

---

## Phase 4 — Documentation reconciliation (MEDIUM)

### T4.1 — Fix doc/code contradictions

**Files**
- `README.md` (test count, env var table)
- `docs/technical/technical-stack.md` (JWT, QR, Recharts claims)
- `docs/product/prd.md`, `docs/product/feature-spec.md` (QR, dashboard endpoints, audit rules)
- `docs/technical/design.md` (dashboard endpoints, `ledger_events` table)
- `docs/implementation/mvp-implementation-plan.md` (gate status, login screen)
- `docs/README.md:11` (broken PDF link)
- `.env.example` (add `PDS_LEDGER_MODE`)

**What to do**
- For each claimed feature (JWT, QR, Recharts, `/dashboard/fps-risk`, `/dashboard/pending-receipts`, `DB_LEDGER_MISMATCH`, `IN_TRANSIT_DELAY`, `FPS_CLOSING_STOCK_MISMATCH`, `DISTRIBUTION_TAMPERED`, `FPS_OVER_DISTRIBUTION`): either implement (track in Phase 6) or rewrite the doc to say "planned/post-MVP".
- Update test count to the actual number (recompute after Phase 1–3 changes).
- Fix/remove the broken reference PDF link.
- Add `PDS_LEDGER_MODE` to `.env.example`.

**Acceptance criteria**
- No doc claims a feature that isn't in the code without a "planned" label.
- All internal doc links resolve.

**Tests**
- Manual doc review; optionally a link-check script.

### T4.2 — Document admin API/UI and ledger env matrix

**Files**
- `README.md` (API table)
- `docs/technical/design.md` (admin endpoints, `ledger_events`)
- `DEPLOYMENT.md` (admin guard behavior, demo-vs-fabric token rules)
- `docs/implementation/fabric-gateway-plus-refactor.md` (stale "stub" wording for `generate-connection-profiles.sh`)

**What to do**
- Add `/admin/*` endpoints and the `/admin` web route to the API table and design doc.
- Clarify the `PDS_LEDGER_MODE` vs legacy `PDS_LEDGER_BACKEND` matrix in one place.

**Acceptance criteria**
- Admin surface area and ledger-mode matrix fully documented.

---

## Phase 5 — Code quality & structure (MEDIUM)

### T5.1 — Break infrastructure ↔ modules/fabric cycle

**Files**
- `apps/api/src/infrastructure/postgres-ledger-port.ts`
- `apps/api/src/modules/fabric/fabric-envelope-ledger-port.ts`
- `apps/api/src/modules/ledger/ledger-port-factory.ts`

**What to do**
- Move shared port interfaces/types to `infrastructure/` (or a new `ports/` dir) and have `modules/fabric/` depend on `infrastructure/`, not vice versa.
- Introduce a small interface for the envelope port so `infrastructure` doesn't import `modules/fabric`.

**Acceptance criteria**
- `madge --circular apps/api/src` reports no cycles.

**Tests**
- `npx madge --circular --extensions ts apps/api/src` in CI.

### T5.2 — Global exception filter

**Files**
- New `apps/api/src/infrastructure/exception.filter.ts`
- `apps/api/src/main.ts`

**What to do**
- Add a global `ExceptionFilter` mapping domain errors from `@pds/pds-chaincode` to appropriate 4xx codes (e.g. not-found → 404, conflict/duplicate → 409, validation → 400), and unknown errors to 500 with a request id.

**Acceptance criteria**
- Domain errors no longer return raw 500s.

**Tests**
- `test/exception.filter.spec.ts`.

### T5.3 — Missing DTOs and validation

**Files**
- `apps/api/src/modules/audit/dto/resolve-alert.dto.ts`
- `apps/api/src/modules/trace/dto/verify-ledger.dto.ts`
- `apps/api/src/modules/audit/audit.controller.ts`
- `apps/api/src/modules/trace/trace.controller.ts`

**What to do**
- Add `class-validator` DTOs for `POST /audit-alerts/:id/resolve` and `POST /trace/verify`.

**Acceptance criteria**
- Invalid bodies return 400.

**Tests**
- Extend `test/dto-validation.spec.ts`.

### T5.4 — Frontend structure & routing

**Files**
- `apps/web/src/App.tsx` (split into components/pages/hooks)
- New `apps/web/src/components/`, `apps/web/src/pages/`, `apps/web/src/hooks/`
- Add `react-router-dom`; replace `window.location.pathname` routing in `main.tsx`.

**What to do**
- Break `App.tsx` into role/dashboard components and pages.
- Add real routes (`/`, `/admin`, scenario/role views as query params or nested routes).

**Acceptance criteria**
- `App.tsx` < 150 lines; deep links work; `app.test.ts` replaced with real render tests.

**Tests**
- Component render tests for dashboard, admin, workflow panel.

### T5.5 — Beneficiary hash naming consistency

**Files**
- `apps/web/src/workflow-actions.ts:13`
- `mock/entities/auth-transactions.json`
- `mock/entities/distributions.json`

**What to do**
- Unify the field name used by the workflow and mock entities (pick `beneficiaryRefHash` to match the API/chaincode).

**Acceptance criteria**
- Mock→API auth/distribution path uses a single field name.

**Tests**
- Update web tests + an API e2e check.

### T5.6 — Scenario selector affects live data

**Files**
- `apps/web/src/App.tsx` (~`102-103`, `225-238`)

**What to do**
- When API is online, applying a scenario should call an endpoint (or refresh) that reflects scenario overrides, or clearly disable the selector with an explanatory tooltip.

**Acceptance criteria**
- No silent divergence between selected scenario and displayed alerts/summary.

**Tests**
- Web test asserting selector behavior in `api` mode.

### T5.7 — (Optional, larger) Split chaincode world state into per-entity keys (HIGH #8 deeper fix)

**Files**
- `blockchain/chaincode/pds-chaincode/src/contract.ts`, `invoker.ts`, `index.ts`

**What to do**
- Store entities under separate keys (`lot:<id>`, `stock:<org>`, `entitlement:<rc>:<month>`, etc.) instead of one `pds.state` blob.
- Update queries to use range scans.

**Acceptance criteria**
- No full-state read-modify-write on writes; MVCC contention reduced.
- All existing tests pass after adaptation.

**Tests**
- Extended ledger + contract tests.

> Defer until after T1.1–T1.6 land; coordinate with T1.3 semantics.

---

## Phase 6 — Schema, tests, and polish (MEDIUM/LOW)

### T6.1 — Postgres indexes and FKs

**Files**
- `infra/postgres/schema.sql`

**What to do**
- Add indexes on `status`, `month`, `entity_id`, and FK/join columns.
- Add missing FKs: `from_org`/`to_org`/`fps_id` → `stakeholders`; `stock_positions.stakeholder_id` → `stakeholders`.
- Decide on the `users` table: seed it or remove it.

**Acceptance criteria**
- Dashboard/filter queries use indexes; FKs enforced; no orphaned `users` table.

**Tests**
- `EXPLAIN` on representative queries; schema lint.

### T6.2 — Fill test gaps

**Files**
- `apps/api/test/admin.guard.spec.ts` (T2.4)
- `apps/api/test/postgres-ledger-port.spec.ts`
- `apps/api/test/exception.filter.spec.ts` (T5.2)
- `blockchain/chaincode/pds-chaincode/test/contract.test.ts` (T1.1/T1.5)
- `blockchain/chaincode/pds-chaincode/test/invoker.concurrency.test.ts` (T1.6)
- Web component tests (T5.4)

**What to do**
- Add the test files listed above covering the gaps noted in the analysis.

**Acceptance criteria**
- Coverage of AdminGuard, postgres ledger port, exception filter, contract, invoker concurrency, and key web components.

### T6.3 — Chaincode nits

**Files**
- `blockchain/chaincode/pds-chaincode/src/index.ts`

**What to do**
- Replace hardcoded `currentMonth()` (`'2026-06'`, ~`317`, `596-598`) with a real month derived from the event timestamp or a passed value.
- Add duplicate-ID guards for `lotId`/`transferId`/`allocationId`/`distributionId`/`authTxnId`.
- Emit a ledger event from `createOrUpdateEntitlement`.
- Document `hashReference` as non-cryptographic; consider SHA-256 for integrity-critical refs (separate task if scoped).

**Acceptance criteria**
- No hardcoded month; duplicates rejected; entitlements auditable.

**Tests**
- Negative tests for duplicate IDs and month handling.

### T6.4 — Privacy field denylist + hash format validation

**Files**
- `blockchain/chaincode/pds-chaincode/src/contract.ts`, `index.ts`
- `packages/shared-types/src/index.ts`

**What to do**
- In the contract/engine, reject payloads containing prohibited PII fields (`aadhaar`, `mobile`, `otp`, raw ration card) before persistence.
- Validate `rationCardHash`/`beneficiaryRefHash` format (e.g. hex/base58 of a known length) so a raw card number can't be stored there.

**Acceptance criteria**
- PII-bearing payloads rejected; malformed hashes rejected.

**Tests**
- Negative tests for each denied field and malformed hash.

### T6.5 — Low-priority polish

**Files**
- `apps/api/src/openapi.ts` (consider `@nestjs/swagger` — optional)
- `blockchain/fabric-network/docker-compose.fabric.yml` (CouchDB creds via env, don't expose ports)
- `blockchain/fabric-network/scripts/README.md` (remove "placeholder" wording)
- `blockchain/fabric-network/scripts/package-chaincode-bundle.sh` (drop fixtures from bundle if unused on Fabric)
- `apps/web/src/AdminDashboard.tsx` (a11y: `scope` on th, skip link)
- Root `apps/api/src/*.ts` barrels (document or remove)

**Acceptance criteria**
- Items addressed as scoped; no behavior regressions.

---

## Suggested sequencing & gates

1. **Phase 0** → commit hygiene before anything else (prevents accidental secret/blob commits).
2. **Phase 1** → chaincode build + correctness (T1.1 first, it's the CRITICAL unblocker).
3. **Phase 2** → API correctness + security (T2.1, T2.3 are quick wins; T2.5 is the big one).
4. **Phase 3** → deployment hardening (can run parallel to Phase 2 review).
5. **Phase 4** → docs (after code settles so docs don't churn).
6. **Phase 5** → structural refactors (T5.7 optional/deferred).
7. **Phase 6** → tests, schema, polish.

**Gate after each phase**: `npm run build && npm run lint && npm test` green; `npm run smoke` green for demo mode; `node scripts/smoke-fabric-gateway.mjs` green when fabric profile changes are involved.

## Out of scope (explicitly deferred)

- Real SMART-PDS / ePoS / state PDS / Aadhaar integrations.
- Keycloak / enterprise IAM, JWT issuance.
- Kubernetes / Helm, HSM key management.
- Multi-channel Fabric, private data collections.
- Offline Android FPS client.
- AI/ML anomaly engine.

These match the "Production Considerations (Post-MVP)" section of DEPLOYMENT.md and should be tracked separately.
