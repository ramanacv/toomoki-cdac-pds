# PDS-Chain Deployment Guide

This document covers how to deploy and operate PDS-Chain for local development, demo, and future pilot environments.

## Deployment Models

| Model | Use case | Ledger | Persistence |
|-------|----------|--------|-------------|
| **Docker Compose (default)** | Demo, stakeholder review | Demo mode — in-process chaincode (`PDS_LEDGER_MODE=demo`) | PostgreSQL |
| **Docker Compose `--profile fabric`** | Live Fabric demo | Fabric mode — `@hyperledger/fabric-gateway` (`PDS_LEDGER_MODE=fabric`) | PostgreSQL + CouchDB peers |
| **Local dev (file)** | Fast iteration, tests | Demo mode or test-only adapters | File (`tmp/`) |
| **Local dev (postgres)** | Integration testing | Demo mode (default) | PostgreSQL |
| **Production pilot** | Post-MVP | Full Fabric consortium (5-org target) | PostgreSQL + CouchDB peers |

The MVP ships with a **working Docker Compose stack** for both demo and live Fabric modes. The Fabric 3.1.x 2-org network lives under `blockchain/fabric-network/` and is started via `docker compose --profile fabric`.

## Default Docker Compose Deployment

### Architecture (demo profile)

```text
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  web :4173  │────▶│  api :3000  │────▶│  postgres :5432  │
│  React UI   │     │  NestJS 11  │     │  schema + seed   │
└─────────────┘     └──────┬──────┘     └──────────────────┘
                           │
                           ▼
                  PDS_LEDGER_MODE=demo
                  PdsChaincodeInvoker (in-process)
                  world state: /app/tmp/chaincode-world-state.json
                  journal:      /app/tmp/pds-ledger.ndjson
```

### Architecture (fabric profile)

Adds Fabric 3.1.x services on network `pds-fabric`. The API joins that network and uses `@hyperledger/fabric-gateway` to submit/evaluate on `pds-chaincode` / `pdschannel`.

```text
web ──▶ api (PDS_LEDGER_MODE=fabric) ──▶ postgres
              │
              ├── gRPC/TLS ──▶ peer0.food.example.com
              └── (dual-write) operational snapshots in postgres
orderer + peer0.godown + CouchDB + Fabric CAs (profile fabric)
```

### Start

```bash
docker compose up --build -d
```

### Stop

```bash
docker compose down
```

### Stop and remove database volume

```bash
docker compose down -v
```

### Services and Ports

| Service | Container port | Host port | Image / build |
|---------|----------------|-----------|---------------|
| `postgres` | 5432 | 5433 | `postgres:16-alpine` |
| `api` | 3000 | 3000 | `apps/api/Dockerfile` |
| `web` | 4173 | 4173 | `apps/web/Dockerfile` |

### Compose Environment (API)

The root `docker-compose.yml` sets (demo profile defaults):

```env
PDS_LEDGER_MODE=demo
PDS_PERSISTENCE_BACKEND=postgres
PDS_POSTGRES_DSN=postgresql://pds:pds@postgres:5432/pds_chain
PDS_LEDGER_BACKEND=chaincode-runtime
PDS_CHAINCODE_STATE_PATH=/app/tmp/chaincode-world-state.json
PDS_LEDGER_JOURNAL_PATH=/app/tmp/pds-ledger.ndjson
```

Fabric gateway variables are also present with defaults pointing at mounted crypto under `/app/blockchain/fabric-network/crypto/`.

### Ledger mode (`PDS_LEDGER_MODE`)

| Value | Behavior | Fabric containers |
|-------|----------|-------------------|
| `demo` | In-process `PdsChaincodeInvoker` + PostgreSQL snapshots (default POC) | Not required |
| `fabric` | Real `@hyperledger/fabric-gateway` client to `pds-chaincode` on `pdschannel` | `--profile fabric` |

**Backward compatibility:** deprecated `PDS_LEDGER_BACKEND=chaincode-runtime` maps to `demo`; `fabric-gateway` maps to `fabric`.

Test-only adapters (`local-file`, `fabric-envelope`) remain available via `PDS_LEDGER_BACKEND` for dev tooling and unit tests.

PostgreSQL is initialized from:

- `infra/postgres/schema.sql`
- `infra/postgres/seed.sql`

### Fabric profile

**Prerequisites:** Fabric CLI binaries on the host (`peer`, `osnadmin`, `configtxgen`). See [blockchain/fabric-network/README.md](blockchain/fabric-network/README.md).

```bash
# 1. Generate crypto, channel block, deploy chaincode (host-side)
blockchain/fabric-network/scripts/bootstrap-network.sh

# 2. Start full stack with live ledger
PDS_LEDGER_MODE=fabric docker compose --profile fabric up --build -d

# 3. Verify API + gateway (from repo root)
node scripts/smoke-fabric-gateway.mjs
# Optional: peer-level smoke
blockchain/fabric-network/scripts/smoke-fabric.sh
```

Gateway env vars (defaults in root `docker-compose.yml`; overrides in `blockchain/fabric-network/fabric-env.example`):

| Variable | Default (compose) | Purpose |
|----------|-------------------|---------|
| `PDS_LEDGER_MODE` | `demo` / set `fabric` for profile | Top-level ledger switch |
| `PDS_FABRIC_PEER_ENDPOINT` | `peer0.food.example.com:7051` | gRPC peer endpoint |
| `PDS_FABRIC_PEER_TLS_CERT_PATH` | mounted crypto TLS CA | Peer TLS CA cert |
| `PDS_FABRIC_PEER_HOST_ALIAS` | `peer0.food.example.com` | SNI override for TLS |
| `PDS_FABRIC_MSP_ID` | `FoodAndCivilSuppliesMSP` | Client MSP ID |
| `PDS_FABRIC_CERT_PATH` | User1 signcert | Client identity cert |
| `PDS_FABRIC_KEY_PATH` | User1 keystore dir | Client private key |
| `PDS_FABRIC_CHANNEL` | `pdschannel` | Channel name |
| `PDS_FABRIC_CHAINCODE` | `pds-chaincode` | Chaincode name |
| `PDS_FABRIC_CLIENT_ORG` | `FoodAndCivilSupplies` | Org name for connection profile selection |

### Health Checks

```bash
curl -f http://localhost:3000/health
# Expected: {"ok":true}

curl -f http://localhost:3000/dashboard/summary
```

Web UI: open http://localhost:4173 and confirm the API status indicator shows online.

## Environment Configuration

Copy the template before non-Docker runs:

```bash
cp .env.example .env
```

Fabric-specific overrides: `blockchain/fabric-network/fabric-env.example`

### Persistence Backend (`PDS_PERSISTENCE_BACKEND`)

| Value | Behavior |
|-------|----------|
| `file` | State stored in `PDS_STATE_PATH`; no PostgreSQL required |
| `postgres` | Operational snapshots in PostgreSQL; requires `PDS_POSTGRES_DSN` |

### Legacy ledger backend (`PDS_LEDGER_BACKEND`)

Prefer **`PDS_LEDGER_MODE`** for new deployments.

| Value | Maps to | Description |
|-------|---------|-------------|
| `chaincode-runtime` | `demo` | In-process chaincode invoker (default) |
| `fabric-gateway` | `fabric` | Real gateway client (deprecated alias) |
| `local-file` | test-only | Simplest file-backed ledger journal |
| `fabric-envelope` | test-only | Fabric-style envelope records to `PDS_FABRIC_ENVELOPE_PATH` |

Bootstrap chaincode runtime before first demo-mode API start:

```bash
npm run fabric:bootstrap
```

### Fabric Client Organization (`PDS_FABRIC_CLIENT_ORG`)

| Org name | Role | Connection profile |
|----------|------|-------------------|
| `FoodAndCivilSupplies` | Department | `food-department.json` |
| `ProcurementMiller` | Procurement | `procurement-miller.json` |
| `GodownWarehouse` | Godown | `godown-warehouse.json` |
| `FairPriceShop` | FPS | `fps.json` |
| `AuditAuthority` | Auditor | `audit-authority.json` |

Profiles live in `blockchain/fabric-network/connection-profiles/`.

## Local Deployment (No Docker)

### File-based (minimal)

```bash
cp .env.example .env
# Ensure:
# PDS_PERSISTENCE_BACKEND=file
# PDS_LEDGER_MODE=demo
# (or PDS_LEDGER_BACKEND=chaincode-runtime)

npm ci
npm run fabric:bootstrap
npm run build
npm run start --workspace=@pds/api
```

In another terminal:

```bash
npm run build --workspace=@pds/web
npm run start --workspace=@pds/web
```

### PostgreSQL-backed

```bash
docker compose up postgres -d

export PDS_PERSISTENCE_BACKEND=postgres
export PDS_POSTGRES_DSN=postgresql://pds:pds@localhost:5433/pds_chain
export PDS_LEDGER_MODE=demo

npm run fabric:bootstrap
npm run build
npm run start --workspace=@pds/api
```

## Build and Release Artifacts

### Build all packages

```bash
npm ci
npm run build
```

Build order (handled by workspaces):

1. `@pds/shared-types`
2. `@pds/pds-chaincode`
3. `@pds/api` and `@pds/web`

### Docker images

```bash
docker compose build
```

Images are built from the **repository root** context so workspaces resolve correctly.

API image CMD: `npm run start --workspace=@pds/api`  
Web image CMD: `npm run start --workspace=@pds/web` (Vite preview on `0.0.0.0:4173`)

## Hyperledger Fabric (Live 2-Org Demo)

### Current status

- **Fabric version:** 3.1.x (channel participation; no genesis system channel)
- **Channel:** `pdschannel`
- **Chaincode:** `pds-chaincode` (TypeScript)
- **Organizations (deployed):** Food Department + Godown (2-org demo)
- **Organizations (documented):** 5 in `network-manifest.json` (expand later)
- **Bootstrap:** `blockchain/fabric-network/scripts/bootstrap-network.sh`
- **Compose integration:** root `docker-compose.yml` with `--profile fabric`

Validate artifacts:

```bash
node blockchain/fabric-network/scripts/validate-fabric-artifacts.mjs
```

### Bootstrap and run

```bash
# Host: crypto, channel join, chaincode lifecycle
./blockchain/fabric-network/scripts/bootstrap-network.sh

# Containers: postgres + api (fabric) + web + orderer + peers + CouchDB + CAs
PDS_LEDGER_MODE=fabric docker compose --profile fabric up --build -d

# Smoke tests
node scripts/smoke-fabric-gateway.mjs
blockchain/fabric-network/scripts/smoke-fabric.sh
```

For demo mode without Fabric containers:

```bash
npm run fabric:bootstrap
PDS_LEDGER_MODE=demo npm run start --workspace=@pds/api
```

See [blockchain/fabric-network/README.md](blockchain/fabric-network/README.md) for step-by-step script breakdown.

## Mock Data and SQL Generation

Canonical mock and seed data lives in `mock/` and is exposed through `@pds/fixtures`. See [docs/implementation/mock-data.md](docs/implementation/mock-data.md) for the full layout and editing workflow.

| Path | Purpose |
|------|---------|
| `mock/entities/` | Workspace entity JSON used by the web mock layer |
| `mock/seed/backend.json` | API, chaincode, and PostgreSQL bootstrap payload |
| `mock/scenarios/` | Scenario-specific dashboard and alert overrides |
| `infra/postgres/seed.sql` | Generated SQL (do not edit by hand) |

Regenerate PostgreSQL seed after changing mock seed data:

```bash
npm run fixtures:sql
```

Web data source modes (`VITE_DATA_SOURCE`):

| Value | Behavior |
|-------|----------|
| `api` | Live API only |
| `mock` | Fixtures only |
| `auto` | API when online, fixtures otherwise (default) |

## Data Management

### Reset runtime files

```bash
npm run reset
```

Removes `./tmp/` (state, journal, chaincode world state).

### Seed file-based demo data

```bash
npm run build --workspace=@pds/api
npm run seed
```

### Reset PostgreSQL data (Docker)

```bash
docker compose down -v
docker compose up postgres -d
```

Schema and seed SQL re-run on fresh volume via `docker-entrypoint-initdb.d`.

## Demo and Smoke Verification

```bash
# After build
npm run demo:happy
npm run demo:exception
npm run smoke
```

`smoke` runs happy-path and exception-path flows in-process and prints JSON results.

## Operational Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness |
| `GET /dashboard/summary` | Stock and workflow counts |
| `GET /openapi.json` | API contract |
| `POST /audit-alerts/reconcile` | Re-evaluate alert rules |
| `GET /trace/lots/:lotId` | Lot custody trace |
| `POST /trace/verify` | Verify ledger digest |

## Security Notes (MVP)

- Default PostgreSQL credentials (`pds`/`pds`) are for **local/demo only**.
- No TLS termination in the default compose stack.
- Beneficiary authentication is **mock only** (OTP/biometric simulation).
- JWT/auth for application users is planned; not required for the current demo UI.
- Do not commit `.env` with production secrets.

## Production Considerations (Post-MVP)

Deferred by design — do not expect these in the default deployment:

- Real SMART-PDS, ePoS, and state PDS integrations
- Aadhaar/UIDAI authentication
- Keycloak or enterprise IAM
- Kubernetes / Helm charts
- HSM-backed key management
- Multi-channel Fabric or private data collections
- Offline Android FPS client
- AI/ML anomaly engine

Recommended production hardening path:

1. Externalize secrets (Vault, cloud secret manager).
2. TLS everywhere (reverse proxy or ingress).
3. Managed PostgreSQL with backups and replication.
4. Full Fabric consortium with MSP, endorsement policies, and monitoring.
5. Replace mock auth with approved government identity adapters.
6. Add observability (structured logs, metrics, request IDs — API supports request-ID logging foundation).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| API fails on startup with unsupported backend | Invalid `PDS_LEDGER_MODE`, `PDS_LEDGER_BACKEND`, or `PDS_PERSISTENCE_BACKEND` | Check `.env` against tables above |
| Fabric mode fails to connect | Bootstrap not run, peers down, or wrong crypto paths | Run `bootstrap-network.sh`; `docker compose --profile fabric ps`; verify mounted crypto |
| `ECONNREFUSED` to postgres | DB not running or wrong DSN | `docker compose up postgres -d`; use host port `5433` locally, `postgres` hostname in compose |
| Web shows demo data only | API not reachable | Check `curl localhost:3000/health`; ensure API container is up |
| Empty chaincode state errors | Bootstrap not run (demo mode) | `npm run fabric:bootstrap` |
| Port already in use | Conflicting service | Change host ports in `docker-compose.yml` or stop conflicting process |
| Tests fail before run | Build required | `npm run build` (root `pretest` builds shared-types and chaincode) |
| Gateway smoke warns on trace | API still in demo mode | Set `PDS_LEDGER_MODE=fabric` and use `--profile fabric` |

## Related Documentation

- [README.md](README.md) — project overview and quick start
- [docs/technical/architecture.md](docs/technical/architecture.md) — system architecture
- [docs/implementation/mvp-implementation-plan.md](docs/implementation/mvp-implementation-plan.md) — MVP scope and acceptance gates
- [blockchain/fabric-network/README.md](blockchain/fabric-network/README.md) — Fabric 3.x topology and bootstrap
