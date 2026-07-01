# PDS-Chain — End-to-End Review (GLM Analysis)

> Generated: 2026-06-25
> Scope: Full review of docs, API (`apps/api`), chaincode (`blockchain/`), frontend (`apps/web`), infra (`infra/`, `scripts/`), and repo hygiene.
> Companion document: [docs/implementation/glm-analysis-impl.md](../implementation/glm-analysis-impl.md) — implementation plan for every issue below.

## What's working well

- **Clear product traceability**: `cdac-problem-statement → brd → prd → feature-spec → architecture → design → mvp-implementation-plan` is coherent and internally consistent on vision.
- **Sound core architecture**: single source of truth for ledger business logic in `PdsLedgerEngine` (`blockchain/chaincode/pds-chaincode/src/index.ts`), with thin demo (`invoker.ts`) and Fabric (`contract.ts`) adapters over it — a good pattern.
- **Clean ledger-mode abstraction**: `PDS_LEDGER_MODE=demo|fabric` with a factory (`apps/api/src/modules/ledger/ledger-port-factory.ts`) selecting among 6 port implementations.
- **Privacy rule is schema-aligned**: DTOs and chaincode payloads use `beneficiaryRefHash` / `rationCardHash` / auth enums — no Aadhaar/OTP/biometric fields in the typed paths.
- **Postgres seed is genuinely generated** from `mock/seed/backend.json` via `npm run fixtures:sql` (header comment present in `seed.sql`).
- **Good test breadth on the API** (~37 spec files) and parameterized SQL throughout the postgres adapters (low injection risk).

---

## CRITICAL issues

### 1. NBF-LITE is a hygiene and security landmine inside this repo

The untracked `NBF-LITE/` tree contains a **Docker registry blob store** (`sawtooth-core/docker/compose/data/docker/registry/v2/blobs/…`), compiled binaries (`*-linux`, `nbf-agent-release-1`), `.tar` files, PDFs, and what looks like **private key material**. The root `.gitignore` does **not** exclude any of it. One `git add .` would bloat the repo and leak key-like artifacts. The README correctly says NBF-LITE is separate reference tooling — so it should not live in this tree at all.

→ Move NBF-LITE to a separate repo / git submodule, or gitignore it wholesale plus add a documented clone step. Never commit registry blobs, tarballs, or PEM files.

### 2. Fabric chaincode build excludes the Fabric entrypoints

`blockchain/chaincode/pds-chaincode/tsconfig.json` excludes `contract.ts` and `server.ts`, so `dist/` contains only `index.js`, `invoker.js`, `operations.js`. But `package-chaincode-bundle.sh` expects `dist/src/server.js` as the Fabric entrypoint. Real Fabric deployment is likely broken.

→ Add `contract.ts`/`server.ts` to the chaincode tsconfig build and verify the bundle actually runs.

### 3. No authentication on business endpoints

Every mutating endpoint (create lot, dispatch, distribute, resolve alerts) is open. Only `/admin/*` has a guard. The docs (`docs/technical/technical-stack.md:137-138`) even claim JWT + RBAC exists — it doesn't. Acceptable for a local demo; dangerous if exposed.

→ Add an auth guard + role mapping before any non-demo deployment. At minimum make it a documented hard requirement in DEPLOYMENT.md.

---

## HIGH issues

### 4. Likely state-path bug in postgres/fabric adapters

`FilePdsLedgerPort(statePath, journalPath)` is instantiated as `new FilePdsLedgerPort(journalPath, journalPath)` in both `apps/api/src/infrastructure/postgres-chaincode-ledger-port.ts:14` and `apps/api/src/modules/fabric/fabric-gateway.ledger-port.ts:19`. State file and event journal collide.

→ Pass the correct `statePath`.

### 5. `sync-await.ts` spin-loop hack

`apps/api/src/infrastructure/sync-await.ts` spawns child processes in a spin loop to bridge sync-over-async in the postgres store. Fragile under load.

→ Make the ledger port interface properly async end to end.

### 6. Chaincode accounting bugs

- `createCommodityLot` records the lot but **never updates `stock`** (`index.ts:137-142`); stock only comes from seed or `RecordLedgerProof` replay. Lots created via the API have zero stock.
- `dispatchLot` sets `currentOwner = toOrg` immediately but receiver stock is only added on `receiveLot` (`index.ts:160-175` vs `:204`) — in-transit ownership vs stock is inconsistent.
- `RecordLedgerProof`/`applyLedgerEvent` can inject arbitrary state via `projectEventToState` **without business-rule validation** (`index.ts:339-346`, `:600-650`).

→ Initialize stock on lot creation; reconcile dispatch/ownership semantics; validate `RecordLedgerProof` payloads.

### 7. No on-chain authorization

`PdsChainContract` does no MSP / client-identity checks (`contract.ts:20-137`). Any channel member can invoke any write; `assertActiveStakeholder` only checks registry status, not the tx submitter.

→ Add `ctx.clientIdentity` / MSP checks scoped per operation (e.g. only godown can `ReceiveLot`).

### 8. Single-key world state

The entire ledger is one JSON blob under key `pds.state` (`contract.ts:5-17`). Every write is a full read-modify-write — high MVCC collision rate on Fabric, and the demo invoker has **no file locking** (`invoker.ts:39-59`), so concurrent demo requests can lose updates.

→ Split state into per-entity keys, or at minimum add file locking for the demo invoker.

### 9. Crypto + build artifacts not gitignored

`blockchain/fabric-network/crypto/`, `channel-artifacts/`, and `chaincode-packages/` are untracked but **not in `.gitignore`** — high accidental-commit risk (private keys, CA DBs).

→ Add them to `.gitignore`.

### 10. Fabric version skew + broken connection profiles

Runtime images are `fabric-orderer/peer:3.1.5` but tooling is `fabric-tools:2.5.12`. Connection profiles are inconsistent: `food-department.json`/`godown-warehouse.json` lack `channels.pdschannel`, while `procurement-miller.json`/`fps.json`/`audit-authority.json` reference non-existent peers from the 5-org manifest, which `validate-fabric-artifacts.mjs` then expects to exist.

→ Align tool image to 3.1.x; regenerate/fix profiles; make the validator match reality.

### 11. Dockerfile runs as root, no multi-stage

`apps/api/Dockerfile` is single-stage, copies the whole monorepo (web, fixtures, chaincode) into the API image, and runs as root.

→ Multi-stage build, copy only built API output + prod deps, `USER node`.

### 12. Fabric gateway submit isn't awaited

`FabricGatewayClient.submit` fires `submitAsync` and returns a txId **before Fabric confirms** (`apps/api/.../fabric-gateway.client.ts:28-31`); `FabricGatewayLedgerPort.appendEvents` doesn't await Fabric errors. DB/ledger divergence risk in fabric mode.

→ Await submit confirmation or handle async-result reconciliation explicitly.

### 13. Admin guard has gaps

Token comparison isn't timing-safe, there's no rate limiting, and the guard has no tests. Token is optional in demo mode when unset.

→ Use `crypto.timingSafeEqual`, add tests, document the demo-vs-fabric behavior.

---

## MEDIUM issues

- **Docs vs code drift**: README/technical-stack claim JWT auth, QR/verification IDs, Recharts, `/dashboard/fps-risk` + `/dashboard/pending-receipts`, `DB_LEDGER_MISMATCH` reconciliation, and "52 API tests" — none of these match the code. Update the docs or implement the features.
- **Broken doc link**: `docs/README.md:11` references `docs/reference/PDS_Blockchain_GrainChain_India.pptx.pdf` which doesn't exist.
- **`.env.example` mismatch**: documents `PDS_LEDGER_BACKEND` (deprecated) but not `PDS_LEDGER_MODE`, while the README centers on `PDS_LEDGER_MODE`.
- **Admin API/UI undocumented**: `/admin/*` endpoints and the `/admin` web route aren't in PRD/feature-spec/README.
- **Infrastructure ↔ modules/fabric dependency cycle**: `infrastructure/postgres-ledger-port.ts` imports from `modules/fabric/`, while `modules/ledger/` imports from `infrastructure/`. Inverted layering.
- **Missing DTOs/validation** on `POST /audit-alerts/:id/resolve` and `POST /trace/verify` (inline bodies, no class-validator).
- **No global exception filter** — domain errors surface as unhandled 500s.
- **Frontend is a monolith**: `App.tsx` ~636 lines, no `components/`/`pages/`/`hooks/` dirs, no React Router (`/admin` via `window.location.pathname`), placeholder `app.test.ts`.
- **Beneficiary hash naming split**: workflow hardcodes `beneficiary-hash` while mock entities use `demo-beneficiary-ref-hash` — breaks the mock/auth path. (Resolved: `demo-beneficiary-ref-hash` standardized to `beneficiary-hash` everywhere.)
- **Scenario selector doesn't affect live API alerts/summary** when online (only mock path).
- **Schema gaps**: no secondary indexes; missing FKs on `from_org`/`to_org`/`fps_id`/`stock_positions.stakeholder_id`; `users` table defined but never seeded.
- **Chaincode nits**: `currentMonth()` hardcoded to `'2026-06'` (`index.ts:317`); no duplicate-ID guards for lots/transfers/allocations/distributions; `createOrUpdateEntitlement` emits no ledger event; `hashReference` is non-cryptographic FNV.
- **Tests missing**: no `AdminGuard`, `postgres-ledger-port`, `sync-await`, or `contract.ts` tests; ~9/17 chaincode operations lack direct coverage.

---

## LOW issues

- Root `src/` files in `apps/api` are re-export barrels (not dead duplicates) — navigation noise; document or remove.
- Manual OpenAPI object in `openapi.document.ts` (drift risk vs actual routes — consider `@nestjs/swagger`).
- CouchDB creds `admin`/`adminpw` hardcoded and ports exposed.
- `scripts/README.md` still calls the Fabric scripts "placeholders" — stale.
- Bundle vendors `fixtures` into the chaincode package (bloat; engine uses `seed=false` on Fabric).
- Limited a11y (no skip links, missing `scope` on admin tables).

---

## Recommended improvement order

1. **Repo hygiene**: gitignore/extract NBF-LITE; gitignore `crypto/`, `channel-artifacts/`, `chaincode-packages/`.
2. **Fix the chaincode build** so `contract.ts`/`server.ts` compile and the bundle runs.
3. **Fix correctness bugs**: `FilePdsLedgerPort(journalPath, journalPath)`, `createCommodityLot` stock, dispatch ownership/stock semantics, await Fabric submit.
4. **Security baseline**: auth guard on business endpoints, timing-safe admin token, MSP checks in chaincode, privacy-field denylist + hash-format validation in chaincode.
5. **Harden deployment**: multi-stage non-root Dockerfiles, align Fabric tool image, fix connection profiles, await Fabric gateway results.
6. **Reconcile docs with code**: either implement JWT/QR/charts/extra-dashboard endpoints or rewrite the docs to match the actual MVP scope; fix the broken PDF link and `.env.example`.
7. **Code quality**: break the infra/modules cycle, add a global exception filter, fill missing DTOs/tests, split the frontend `App.tsx` and add a router.
8. **Schema**: add indexes + missing FKs; decide on the `users` table.

The full, per-issue implementation plan with file paths, acceptance criteria, and task ordering lives in [docs/implementation/glm-analysis-impl.md](../implementation/glm-analysis-impl.md).
