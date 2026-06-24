# PDS-Chain

Blockchain-enabled trust, traceability, audit, and authenticated-delivery layer for India's **Public Distribution System (PDS)**.

PDS-Chain complements SMART-PDS, state PDS systems, ePoS, and command-centre dashboards. It does **not** replace them. The MVP demonstrates one complete rice journey from procurement to beneficiary distribution with mock data and simulated integrations.

## What the MVP Demonstrates

```text
Procurement Centre
  -> Miller
  -> State Godown
  -> Block Godown
  -> FPS Allocation
  -> FPS Receipt
  -> Beneficiary Authentication (mock)
  -> Entitlement Validation
  -> Distribution
  -> Blockchain Receipt
  -> Audit And Traceability
```

## Core Privacy Rule

Sensitive beneficiary data stays **off-chain**. Aadhaar numbers, biometrics, OTPs, mobile numbers, and full ration card numbers must not be written to the ledger. Only privacy-preserving hashes, references, and audit proofs are stored on-chain.

## Architecture Overview

PDS-Chain supports two ledger modes via `PDS_LEDGER_MODE`:

| Mode | Value | Ledger | Fabric containers |
|------|-------|--------|-------------------|
| **Demo** (default) | `demo` | In-process `PdsChaincodeInvoker` + PostgreSQL snapshots | Not required |
| **Fabric** | `fabric` | `@hyperledger/fabric-gateway` → `pds-chaincode` on `pdschannel` | `--profile fabric` |

Legacy `PDS_LEDGER_BACKEND=chaincode-runtime` maps to demo; `fabric-gateway` maps to fabric.

The NestJS API is organized into feature modules under `apps/api/src/modules/` (health, stakeholders, lots, transfers, allocations, auth, entitlements, distributions, trace, audit, dashboard, ledger, fabric).

## Technology Stack

| Layer | Technology |
|-------|------------|
| Blockchain | Hyperledger Fabric 3.1.x (2-org demo) or in-process chaincode runtime (demo mode) |
| Chaincode | TypeScript (`blockchain/chaincode/pds-chaincode`) |
| API | NestJS 11 on Node.js 22 |
| Database | PostgreSQL 16 |
| Frontend | React 19 + Vite 7 |
| Monorepo | npm workspaces |

## Repository Layout

```text
apps/
  api/          NestJS REST API
  web/          React dashboard and workflow UI
blockchain/
  chaincode/pds-chaincode/   Shared ledger engine + Fabric contract
  fabric-network/            Fabric 3.x 2-org stack, bootstrap scripts, connection profiles
infra/
  postgres/     schema.sql and seed.sql (generated from mock seed)
mock/
  entities/     Canonical mock domain records (JSON)
  seed/         Backend bootstrap payload
  scenarios/    Per-demo scenario overrides
  workspace/    Dashboard mock aggregates
packages/
  fixtures/     Typed loader for mock/ data (@pds/fixtures)
  shared-types/ DTOs, enums, shared constants
scripts/
  demo/         Happy-path and exception-path demos
  fabric/       Chaincode runtime bootstrap
docs/           Product, technical, and implementation documentation
```

> **Note:** The `NBF-LITE/` folder contains separate CDAC/academia reference tooling and is not part of the PDS-Chain application runtime.

## Prerequisites

- **Node.js 22+** and **npm** (matches Docker images)
- **Docker** and **Docker Compose** (recommended for quickest start)
- **Git**

Optional for local PostgreSQL without Docker:

- PostgreSQL 16 with database `pds_chain`, user `pds`, password `pds`

## Quick Start (Docker — Recommended)

From the repository root:

```bash
# 1. Clone and enter the repo
git clone <repository-url>
cd toomoki-cdac-pds

# 2. Copy environment template (for local/non-Docker use; Docker Compose sets its own env)
cp .env.example .env

# 3. Start PostgreSQL, API, and web UI
docker compose up --build
```

| Service | URL |
|---------|-----|
| Web UI | http://localhost:4173 |
| API | http://localhost:3000 |
| API health | http://localhost:3000/health |
| OpenAPI spec | http://localhost:3000/openapi.json |
| PostgreSQL | `localhost:5433` (db: `pds_chain`, user/pass: `pds`/`pds`) |

The web UI data mode is controlled by `VITE_DATA_SOURCE` (default `auto`): use the live API when online, fixtures from `mock/` when offline, or force `api` / `mock` explicitly. See [Mock data and fixtures](docs/implementation/mock-data.md).

### Demo Scenarios in the UI

Use the scenario selector in the dashboard:

- **Happy path** — full custody chain clears
- **Short receipt** — receipt mismatch raises an audit alert
- **Duplicate claim** — second distribution in the same month is blocked

Role views: Department, Procurement, Godown, FPS, Auditor.

### Fabric profile (live blockchain)

Requires Fabric CLI tools on the host (`peer`, `osnadmin`, `configtxgen`). See [DEPLOYMENT.md](DEPLOYMENT.md) for the full sequence.

```bash
# 1. Generate crypto, channel config, deploy chaincode
blockchain/fabric-network/scripts/bootstrap-network.sh

# 2. Start postgres + API (fabric mode) + web + Fabric peers/orderer/CAs
PDS_LEDGER_MODE=fabric docker compose --profile fabric up --build

# 3. Smoke test (API must be healthy; expects verificationSource=chaincode)
node scripts/smoke-fabric-gateway.mjs
```

Default `docker compose up` keeps demo mode (`PDS_LEDGER_MODE=demo`) unchanged. The API container joins the `pds-fabric` Docker network for peer connectivity when the fabric profile is active.

## Local Development (Without Docker)

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure environment

```bash
cp .env.example .env
```

Default `.env.example` values use file persistence and demo ledger mode (`PDS_LEDGER_BACKEND=chaincode-runtime` → `PDS_LEDGER_MODE=demo`).

### 3. Bootstrap chaincode runtime state

```bash
npm run fabric:bootstrap
```

### 4. Build workspaces

```bash
npm run build
```

### 5. Start PostgreSQL (if using postgres persistence)

```bash
docker compose up postgres -d
```

Set in `.env`:

```env
PDS_PERSISTENCE_BACKEND=postgres
PDS_POSTGRES_DSN=postgresql://pds:pds@localhost:5432/pds_chain
```

### 6. Start the API

```bash
npm run start --workspace=@pds/api
```

API listens on port `3000` (override with `PORT`).

### 7. Start the web UI

**Production-like preview** (serves built assets):

```bash
npm run build --workspace=@pds/web
npm run start --workspace=@pds/web
```

Open http://localhost:4173. The Vite dev server proxies `/api` to `http://localhost:3000` when using `npx vite` from `apps/web` during development.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API listen port |
| `PDS_LEDGER_MODE` | `demo` | `demo` (in-process chaincode) or `fabric` (gateway client) |
| `PDS_PERSISTENCE_BACKEND` | `file` | `file` or `postgres` |
| `PDS_POSTGRES_DSN` | `postgresql://pds:pds@localhost:5432/pds_chain` | PostgreSQL connection string |
| `PDS_LEDGER_BACKEND` | `chaincode-runtime` | **Deprecated alias** — use `PDS_LEDGER_MODE`; see [DEPLOYMENT.md](DEPLOYMENT.md) |
| `PDS_FABRIC_CLIENT_ORG` | `FoodAndCivilSupplies` | Fabric client org identity (fabric mode) |
| `PDS_FABRIC_CHANNEL` | `pdschannel` | Fabric channel (fabric mode) |
| `PDS_FABRIC_CHAINCODE` | `pds-chaincode` | Chaincode name (fabric mode) |
| `PDS_STATE_PATH` | `./tmp/pds-state.json` | Local file state (file persistence) |
| `PDS_LEDGER_JOURNAL_PATH` | `./tmp/pds-ledger.ndjson` | Append-only ledger journal |
| `PDS_CHAINCODE_STATE_PATH` | `./tmp/chaincode-world-state.json` | Chaincode world state file |
| `PDS_FABRIC_ENVELOPE_PATH` | `./tmp/pds-fabric-envelope.ndjson` | Fabric envelope journal |
| `VITE_DATA_SOURCE` | `auto` | Web data mode: `api`, `mock`, or `auto` |
| `VITE_API_BASE_URL` | `/api` | Web API base URL |

Docker Compose overrides these for container networking. See [DEPLOYMENT.md](DEPLOYMENT.md) for full deployment and backend-mode guidance.

### Mock data and live switching

Mock entities live under `mock/` and are loaded through `@pds/fixtures`. The API and chaincode seed from `mock/seed/backend.json`; PostgreSQL seed SQL is generated from the same source (`npm run fixtures:sql`).

| `VITE_DATA_SOURCE` | Web behavior |
|--------------------|--------------|
| `api` | Fetch only from the REST API |
| `mock` | Use fixtures only (no API reads) |
| `auto` | Use API when online, otherwise fixtures (default) |

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all workspaces |
| `npm test` | Run all workspace tests |
| `npm run lint` | ESLint across apps, packages, chaincode |
| `npm run typecheck` | TypeScript check all workspaces |
| `npm run smoke` | Build + run end-to-end demo smoke test |
| `npm run demo:happy` | Run happy-path demo script |
| `npm run demo:exception` | Run exception-path demo script |
| `npm run fabric:bootstrap` | Initialize chaincode runtime world state |
| `npm run fixtures:sql` | Regenerate `infra/postgres/seed.sql` from mock seed |
| `npm run seed` | Reset `tmp/` and seed file-based demo state |
| `npm run reset` | Remove `tmp/` runtime artifacts |

## API Overview

Key endpoints (full spec at `/openapi.json`):

| Group | Examples |
|-------|----------|
| Health | `GET /health` |
| Dashboard | `GET /dashboard/summary` |
| Stakeholders | `GET /stakeholders`, `POST /stakeholders` |
| Lots | `GET /lots`, `POST /lots`, `GET /lots/:lotId/history` |
| Transfers | `POST /transfers`, `POST /transfers/:id/receive` |
| FPS | `POST /fps-allocations`, `POST /fps-allocations/:id/receipt` |
| Auth (mock) | `POST /auth/mock-otp`, `POST /auth/simulated-biometric` |
| Entitlements | `GET /entitlements`, `POST /entitlements/validate` |
| Distribution | `POST /distributions`, `GET /distributions/:id` |
| Trace | `GET /trace/lots/:lotId`, `GET /trace/distributions/:id` |
| Audit | `GET /audit-alerts`, `POST /audit-alerts/reconcile` |

## Verification

```bash
# Unit and integration tests (52 API tests)
npm test

# Full smoke (happy + exception flows, demo mode)
npm run smoke

# Fabric gateway smoke (requires --profile fabric stack)
node scripts/smoke-fabric-gateway.mjs

# API health (when running)
curl http://localhost:3000/health
```

## Documentation

Start with [docs/README.md](docs/README.md):

1. [Business Requirements](docs/product/brd.md)
2. [Product Requirements](docs/product/prd.md)
3. [Feature Specification](docs/product/feature-spec.md)
4. [Technical Architecture](docs/technical/architecture.md)
5. [MVP Implementation Plan](docs/implementation/mvp-implementation-plan.md)
6. [Fabric Gateway refactor](docs/implementation/fabric-gateway-plus-refactor.md) — completed NestJS 11 + ledger modes

## Deployment

For Docker Compose, environment matrices, demo vs fabric ledger modes, Fabric bootstrap, and production notes, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.
