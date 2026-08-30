# Data format parsers / readers / importers inventory

**Scope:** Full repository scan of `apps/`, `packages/`, `scripts/`, `mock/`, `blockchain/`, `infra/`, and workspace `package.json` files for anything that parses, reads, imports, or converts external data formats.

**Date:** 2026-08-09

**Method:** Dependency review across all workspaces; ripgrep for format libraries and keywords (`parse`, `import`, `multer`, `pdf`, `xlsx`, `ocr`, `ndjson`, etc.); inspection of loaders under fixtures, ledger ports, Fabric config, SQL seed tooling, and HTTP body handling.

---

## Executive summary

The codebase is **JSON-centric**. Deliberate file-format pipelines use:

- **JSON** (fixtures, state snapshots, Fabric manifests, HTTP bodies, JWT claims)
- **NDJSON** (append-only ledger/envelope journals; write-primary, read mainly in tests)
- **SQL** (Postgres schema/seed consumption via `psql` / init mounts)
- **PEM / X.509** (Fabric identity and TLS material)
- **YAML** only as **inputs to Fabric CLI tools** (`cryptogen`, `configtxgen`), not parsed by application TypeScript
- **CSV** only as a tiny **env-var list splitter** (not spreadsheet CSV)
- **tar.gz** as Fabric chaincode packaging (peer lifecycle), not an app importer
- **application/x-www-form-urlencoded** for OIDC token requests (scripts/tests)

**Notably absent from first-party code and direct dependencies:** PDF, Excel/XLSX/XLS, TSV, spreadsheet CSV parsers, XML, MessagePack, OCR/PaddleOCR/Tesseract, image codecs (sharp/jimp), multipart file-upload handlers, Markdown/HTML document parsers (beyond Vite serving `index.html` and test jsdom).

---

## Direct workspace dependencies (parsing-relevant)

| Workspace | Parsing-related deps | Notes |
|-----------|----------------------|-------|
| `@pds/api` | `pg`, `@nestjs/platform-express`, `class-validator`, `class-transformer`, `@hyperledger/fabric-gateway`, `@grpc/grpc-js` | JSON HTTP + JSONB + Fabric gRPC; **no** multer/pdf/xlsx/ocr direct deps |
| `@pds/web` | none for documents | `jsdom` is vitest-only |
| `@pds/fixtures` | none | ESM `import … with { type: 'json' }` |
| `@pds/shared-types` | none | Custom JSON validators |
| `@pds/pds-chaincode` | `fabric-contract-api`, `fabric-shim` | JSON world-state |
| mocks | none | Manual JSON body `JSON.parse` |
| root | none | Scripts use Node builtins |

**Transitive only (present in lockfile / SBOM, unused by app parsers):** `multer`, `busboy`, `formidable` (via Nest/Express/supertest), `js-yaml` (via ESLint), `protobufjs` / `google-protobuf` (via Fabric gateway gRPC).

---

## Inventory by format

### 1. JSON

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 1.1 | ESM JSON import (`with { type: 'json' }`) | `/home/ramana/work/sources/cc/toomoki-cdac-pds/packages/fixtures/src/data.ts` → `mock/entities/*.json`, `mock/seed/backend.json`, `mock/scenarios/*.json`, `mock/workspace/dashboard-summary.json` | Canonical fixture loader for stakeholders, lots, transfers, eligibility beneficiaries, scenarios, backend seed | **Both**: bundled into API/web/chaincode consumers at build/runtime; also test fixture source |
| 1.2 | `JSON.parse` + `readFile(Sync)` | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/infrastructure/ledger-port.ts` (`FilePdsLedgerPort.loadState`) | Loads full ledger state snapshot from `pds-state.json` | **App runtime** (file/demo backend) |
| 1.3 | Same | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/infrastructure/state-store.ts` (`FilePdsStateStore`) | Alternate/legacy state JSON load/save | **App runtime** |
| 1.4 | Same | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/config/fabric.config.ts` | Loads `fabric-contract.json`, `network-manifest.json`, connection-profile JSON | **App runtime** (Fabric modes) |
| 1.5 | Same | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/fabric/fabric-contract.ts` | Loads Fabric contract manifest JSON | **App runtime** |
| 1.6 | Same | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/admin/admin.service.ts` | Reads `network-manifest.json` for admin network evidence | **App runtime** |
| 1.7 | Same | `/home/ramana/work/sources/cc/toomoki-cdac-pds/blockchain/chaincode/pds-chaincode/src/invoker.ts` | Loads chaincode world-state JSON file | **App runtime** (local chaincode runtime mode) |
| 1.8 | Same | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/integrations/integration-events.service.ts` (`loadFile`) | Loads/saves `integration-events.json` fallback store | **App runtime** (file persistence path) |
| 1.9 | `JSON.parse` on UTF-8 buffers | `/home/ramana/work/sources/cc/toomoki-cdac-pds/blockchain/chaincode/pds-chaincode/src/contract.ts`, `contract-base.ts` | Parses chaincode transaction args and world-state values; CouchDB-style selector queries as JSON strings | **App runtime** (Fabric peers) |
| 1.10 | `TextDecoder` + `JSON.parse` | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/fabric/fabric-gateway.client.ts` | Decodes Fabric submit/evaluate result bytes as JSON | **App runtime** |
| 1.11 | Nest Express built-in JSON body parser + `ValidationPipe` / `class-validator` DTOs | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/main.ts`; DTOs under `apps/api/src/modules/**/dto/*.ts` | Parses `application/json` request bodies into typed DTOs | **App runtime** |
| 1.12 | Custom `readJson` (`JSON.parse` of request stream) | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/eligibility-mock/src/server.ts`, `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/epos-auth-mock/src/server.ts` | Mock HTTP JSON body reader (32 KiB cap on eligibility) | **App runtime** (demo mocks) |
| 1.13 | `response.json()` / `JSON.parse(text)` | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/web/src/api.ts`, `admin-api.ts`, `citizen-api.ts`; API clients `eligibility-client.ts`, `epos-auth-client.ts`; many `scripts/*.mjs` | HTTP JSON client decoding | **App runtime** / **tooling** |
| 1.14 | Custom validators | `/home/ramana/work/sources/cc/toomoki-cdac-pds/packages/shared-types/src/eligibility.ts` (`validateEligibilityScreening*`), `epos-auth.ts` (`validateEposAuth*`) | Schema/privacy validation of already-parsed JSON objects | **App runtime** |
| 1.15 | `JSON.parse` of JSONB when driver returns strings | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/infrastructure/postgres-snapshot.ts` (`mapAlertRow`, `mapEventRow`); `integration-events.service.ts` (`normalized_payload`) | Rehydrates JSONB columns into objects | **App runtime** |
| 1.16 | `JSON.parse` + `readFileSync` | `/home/ramana/work/sources/cc/toomoki-cdac-pds/scripts/generate-postgres-seed.mjs` | Reads mock entity JSON → emits `infra/postgres/seed.sql` | **Tooling** |
| 1.17 | Same | `/home/ramana/work/sources/cc/toomoki-cdac-pds/scripts/seed-integration-fixtures.mjs` | Loads `mock/integrations/maharashtra-sandbox-events.json` and POSTs to API | **Tooling** |
| 1.18 | Same | `/home/ramana/work/sources/cc/toomoki-cdac-pds/blockchain/fabric-network/scripts/validate-fabric-artifacts.mjs` | Validates network/contract/connection-profile JSON | **Tooling** |
| 1.19 | Same (tests) | `apps/api/test/fabric-network.test.ts`, `iam-config.spec.ts` (Keycloak `viksitpds-realm.json`), etc. | Static fixture/config assertions | **Test** |
| 1.20 | OpenAPI as in-memory TS object | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/openapi/openapi.document.ts` | Spec is authored as a JS object (not loaded from an external `.json`/`.yaml` file) | **App runtime** (served), not a file parser |
| 1.21 | Security evidence generators | `/home/ramana/work/sources/cc/toomoki-cdac-pds/scripts/generate-security-evidence.sh` | Produces CycloneDX / license JSON via `npm sbom` / `npm query` + `jq` | **Tooling** (writes JSON; does not implement a custom SBOM parser) |

Canonical mock JSON corpus: `/home/ramana/work/sources/cc/toomoki-cdac-pds/mock/**/*.json` (14 files).

---

### 2. NDJSON / JSONL

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 2.1 | Custom append of `JSON.stringify(event) + '\n'` | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/infrastructure/ledger-port.ts` (`appendEvents`) | Append-only ledger journal (`*.ndjson`) | **App runtime** (write) |
| 2.2 | Same pattern | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/fabric/fabric-client.ts` (`LocalFabricClient`) | Appends Fabric envelope submit/evaluate records to `*.ndjson` | **App runtime** (write; local/envelope mode) |
| 2.3 | Path wiring | `fabric-envelope-ledger-port.ts`, `fabric-chaincode-ledger-port.ts`, `fabric.config.ts`, `ledger-port-factory.ts` | Configures journal/envelope NDJSON paths | **App runtime** |
| 2.4 | `readFileSync` of journal text | Tests e.g. `file-ledger-port.spec.ts`, `runtime.test.ts`, `fabric-client.test.ts`, `fabric-gateway.ledger-port.spec.ts` | Assert journal contents; **no production NDJSON line-reader** that rebuilds state from journal | **Test** |

**Note:** Operational state recovery uses **JSON snapshot** (`loadState`), not NDJSON replay. NDJSON is primarily an audit/append journal.

Tracked/local journal artifacts may exist (e.g. `apps/api/journal.ndjson`, `journal.ndjson`) — data files, not parsers.

---

### 3. SQL dumps / seed files

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 3.1 | Custom JSON→SQL generator | `/home/ramana/work/sources/cc/toomoki-cdac-pds/scripts/generate-postgres-seed.mjs` | Converts mock JSON into `INSERT` statements in `infra/postgres/seed.sql` | **Tooling** |
| 3.2 | Postgres init mounts + `psql -f` | `/home/ramana/work/sources/cc/toomoki-cdac-pds/docker-compose.yml`; `/home/ramana/work/sources/cc/toomoki-cdac-pds/scripts/iam/bootstrap-keycloak.sh` | Applies `infra/postgres/schema.sql` and `seed.sql` | **Runtime infra** / **tooling** |
| 3.3 | `pg` query strings (not dump parsers) | `apps/api/src/infrastructure/postgres-*.ts`, repositories, `pds-runtime.ts` | Operational SQL against live DB | **App runtime** |
| 3.4 | `readFileSync` of `.sql` as text | `apps/api/test/schema.spec.ts`, `infrastructure.test.ts`, `quantity-conservation.spec.ts` | Static schema/seed assertions | **Test** |

Artifacts: `/home/ramana/work/sources/cc/toomoki-cdac-pds/infra/postgres/schema.sql`, `seed.sql`.

---

### 4. YAML

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 4.1 | Hyperledger `cryptogen` (external) | `/home/ramana/work/sources/cc/toomoki-cdac-pds/blockchain/fabric-network/scripts/generate-crypto.sh` + `crypto-config.yaml` | Reads org crypto YAML to generate MSP material | **Tooling** (Fabric bootstrap) |
| 4.2 | Hyperledger `configtxgen` (external) | `/home/ramana/work/sources/cc/toomoki-cdac-pds/blockchain/fabric-network/scripts/configtxgen.sh` + `config/configtx.yaml` | Reads channel config YAML → genesis `.block` | **Tooling** |
| 4.3 | Raw text `readFileSync` (no YAML parse) | `apps/api/test/infrastructure.test.ts`, `iam-config.spec.ts`, `fabric-deploy.test.ts`; `validate-fabric-artifacts.mjs` | Regex/string checks against `docker-compose*.yml` | **Test/tooling** |

**No `js-yaml` / `yaml` usage in first-party application code.** Lockfile `js-yaml` is ESLint-transitive.

---

### 5. CSV / TSV

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 5.1 | Custom `value.split(',')` (`parseCsvEnv`) | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/config/fabric.config.ts` | Splits `PDS_FABRIC_ENDORSING_ORGS` env into MSP ID list | **App runtime** (env list, not spreadsheet CSV) |
| 5.2 | Similar comma splits | `http-security.ts` (`PDS_CORS_ORIGINS`); vite preview hosts | Env list parsing | **App runtime** / web tooling |

**Absent:** papaparse, csv-parse, fast-csv, `.csv`/`.tsv` data files, spreadsheet importers. Product docs mention CSV imports as a future MVP idea only (`docs/product/brd.md`).

---

### 6. PEM / certificates / private keys

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 6.1 | `readFile` + `node:crypto.createPrivateKey` + Fabric `signers` | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/fabric/fabric-identity.service.ts` | Loads signing cert PEM and keystore (`*.pem` / `*_sk`) | **App runtime** (Fabric gateway) |
| 6.2 | `readFile` TLS CA | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/fabric/fabric-gateway.connection.ts` | Loads peer TLS root cert (`ca.crt`) | **App runtime** |

---

### 7. JWT / JWKS (base64url + JSON)

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 7.1 | Custom base64url decode + `JSON.parse` + RSA verify | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/api/src/modules/auth/oidc-identity-provider.ts` | Parses OIDC access-token header/claims; fetches JWKS JSON | **App runtime** |
| 7.2 | `atob` + `JSON.parse` | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/web/src/auth-token.ts` | Client-side JWT payload decode for persona/UI; also `localStorage` JSON for pending persona | **App runtime** (browser) |

---

### 8. Form-urlencoded / multipart / FormData

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 8.1 | `URLSearchParams` as request body | `/home/ramana/work/sources/cc/toomoki-cdac-pds/scripts/iam/service-token.mjs`; `apps/api/test/e2e/fabric-api.e2e.spec.ts`; `blockchain/fabric-network/scripts/smoke-fabric.sh` | OIDC `client_credentials` token exchange (`application/x-www-form-urlencoded`) | **Tooling** / **test** |
| 8.2 | Nest/Express default parsers | `@nestjs/platform-express` | Can parse JSON/urlencoded; **no** first-party `multer` / `FileInterceptor` / upload controllers found | **Infrastructure present, unused for files** |

**Absent:** multipart evidence uploads, `FormData` file ingest, mime-type based document routing.

---

### 9. ZIP / tar / archives

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 9.1 | Fabric `peer lifecycle chaincode package` → `.tar.gz` | `/home/ramana/work/sources/cc/toomoki-cdac-pds/blockchain/fabric-network/scripts/deploy-chaincode.sh`; bundle prep in `package-chaincode-bundle.sh` | Packages/installs chaincode; does not unzip user documents | **Tooling** |
| 9.2 | Fabric channel `.block` binary | `configtxgen.sh`, `peer-channel-join.sh`, `osnadmin-channel-join.sh` | Generates/consumes channel config blocks via Fabric CLIs | **Tooling** |

**Absent:** adm-zip, jszip, unzipper, yauzl, app-level archive importers.

---

### 10. Protobuf / MessagePack / gRPC wire formats

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 10.1 | `@hyperledger/fabric-gateway` + `@grpc/grpc-js` (transitive protobuf) | Fabric gateway client/connection modules under `apps/api/src/modules/fabric/` | Transport encoding for peer RPCs; **application payloads remain JSON strings** inside Fabric args | **App runtime** (opaque to app) |

**Absent:** first-party `.proto` files, MessagePack libraries, custom protobuf document parsers.

---

### 11. HTML / Markdown

| # | Library / mechanism | Path(s) | What it does | Runtime vs tooling |
|---|---------------------|---------|--------------|--------------------|
| 11.1 | Vite static entry | `/home/ramana/work/sources/cc/toomoki-cdac-pds/apps/web/index.html` | SPA shell; not a document importer | **App runtime** (serve) |
| 11.2 | `jsdom` | `apps/web` vitest config / `test/setup.ts` | Browser DOM for React tests | **Test** |
| 11.3 | String template write | `/home/ramana/work/sources/cc/toomoki-cdac-pds/scripts/benchmark-competition.mjs` | **Writes** Markdown summary; does not parse Markdown | **Tooling** (writer) |

**Absent:** marked, remark, cheerio, mammoth, HTML scraping pipelines. Docs PDFs under `docs/` are reference artifacts only — **not parsed by code**.

---

### 12. Images / OCR

| Status | Detail |
|--------|--------|
| **Absent** | No sharp, jimp, canvas, pdf.js, tesseract, PaddleOCR, or image upload/OCR pipelines. “Evidence” in domain code means structured JSON digests/fields, not scanned documents. |

---

### 13. PDF / Excel / XML

| Format | Status |
|--------|--------|
| PDF | **Absent** as parser. PDFs exist only as documentation under `docs/` (e.g. requirements/product PDFs). |
| Excel / XLSX / XLS | **Absent** (no exceljs, xlsx/SheetJS, node-xlsx). |
| XML | **Absent** as app parser. |

---

## Grouped “evidence” / upload note

Domain “evidence” (eligibility digests, audit alert `evidence` JSONB, Fabric ledger proofs) is **structured JSON**, not file uploads. No document-scanning or multipart evidence importer exists.

---

## Notably ABSENT (checklist)

| Capability | Found? |
|------------|--------|
| PDF parser (`pdf-parse`, pdfjs, etc.) | No |
| Excel/XLSX/XLS | No |
| Spreadsheet CSV/TSV importers | No |
| XML parser | No |
| Application YAML parser | No (CLI tools only) |
| OCR / PaddleOCR / Tesseract | No |
| Image codecs / scanners | No |
| Multipart / multer file uploads in app code | No (transitive dep only) |
| MessagePack | No |
| First-party Protobuf schemas | No |
| Markdown/HTML document ingest | No |
| NDJSON replay-to-state reader | No (append-only + tests) |
| ZIP document importers | No |

---

## Recommended next actions (if ingest is planned)

1. Decide authoritative formats for beneficiary/eligibility bulk import (CSV vs JSON vs XLSX) and keep privacy hashing at the boundary.
2. If multipart evidence is required, add explicit Nest `FileInterceptor` limits, mime allowlists, and virus scanning — do not rely on transitive multer alone.
3. Do not treat Fabric `.tar.gz` packaging or PEM loading as document-ingest precedents; they are infrastructure, not business importers.
