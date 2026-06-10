# PDS-Chain Deployment Guide

This document covers how to deploy and operate PDS-Chain for local development, demo, and future pilot environments.

## Deployment Models

| Model | Use case | Fabric network | Persistence |
|-------|----------|----------------|-------------|
| **Docker Compose (default)** | Demo, stakeholder review | Chaincode runtime (in-process) | PostgreSQL |
| **Local dev (file)** | Fast iteration, tests | Chaincode runtime or local-file | File (`tmp/`) |
| **Local dev (postgres)** | Integration testing | Chaincode runtime | PostgreSQL |
| **Fabric scaffold** | Future pilot prep | Scaffold only (not wired to root compose) | N/A |
| **Production pilot** | Post-MVP | Full Fabric 2.5 consortium | PostgreSQL + CouchDB peers |

The MVP ships with a **working Docker Compose stack**. A full Hyperledger Fabric peer/orderer deployment is documented under `blockchain/fabric-network/` but is **scaffold-only** and not started by the root `docker-compose.yml`.

## Default Docker Compose Deployment

### Architecture

```text
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  web :4173  │────▶│  api :3000  │────▶│  postgres :5432  │
│  React UI   │     │  NestJS     │     │  schema + seed   │
└─────────────┘     └──────┬──────┘     └──────────────────┘
                           │
                           ▼
                  chaincode-runtime
                  (PdsChainContract logic)
                  world state: /app/tmp/chaincode-world-state.json
                  journal:      /app/tmp/pds-ledger.ndjson
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
| `postgres` | 5432 | 5432 | `postgres:16-alpine` |
| `api` | 3000 | 3000 | `apps/api/Dockerfile` |
| `web` | 4173 | 4173 | `apps/web/Dockerfile` |

### Compose Environment (API)

The root `docker-compose.yml` sets:

```env
PORT=3000
PDS_PERSISTENCE_BACKEND=postgres
PDS_POSTGRES_DSN=postgresql://pds:pds@postgres:5432/pds_chain
PDS_LEDGER_BACKEND=chaincode-runtime
PDS_CHAINCODE_STATE_PATH=/app/tmp/chaincode-world-state.json
PDS_LEDGER_JOURNAL_PATH=/app/tmp/pds-ledger.ndjson
```

PostgreSQL is initialized from:

- `infra/postgres/schema.sql`
- `infra/postgres/seed.sql`

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

### Ledger Backend (`PDS_LEDGER_BACKEND`)

| Value | Status | Description |
|-------|--------|-------------|
| `local-file` | Supported | Simplest file-backed ledger journal |
| `chaincode-runtime` | **Default / recommended** | Runs `PdsChainContract` via in-process invoker; persists to `PDS_CHAINCODE_STATE_PATH` |
| `fabric-envelope` | Supported | Writes Fabric-style envelope records to `PDS_FABRIC_ENVELOPE_PATH` |
| `fabric-gateway` | Scaffold | Intended for live Fabric peer; requires network bootstrap (not in root compose) |

Bootstrap chaincode runtime before first API start:

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
# PDS_LEDGER_BACKEND=chaincode-runtime

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
export PDS_POSTGRES_DSN=postgresql://pds:pds@localhost:5432/pds_chain
export PDS_LEDGER_BACKEND=chaincode-runtime

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

## Hyperledger Fabric (Scaffold)

### Current status

- **Channel:** `pdschannel`
- **Chaincode:** `pds-chaincode` (TypeScript)
- **Organizations:** 5 (Food, Procurement, Godown, FPS, Audit)
- **Manifest:** `blockchain/fabric-network/network-manifest.json`
- **Compose scaffold:** `blockchain/fabric-network/docker-compose.fabric.yml` (peers + orderer; not integrated with root compose)

Validate scaffold artifacts:

```bash
node blockchain/fabric-network/scripts/validate-fabric-artifacts.mjs
```

Documented bootstrap entrypoint (informational only — does not deploy live Fabric):

```bash
./blockchain/fabric-network/scripts/bootstrap-network.sh
```

For local chaincode execution without a live Fabric network:

```bash
npm run fabric:bootstrap
PDS_LEDGER_BACKEND=chaincode-runtime npm run start --workspace=@pds/api
```

### Future Fabric Gateway deployment

When a live Fabric network is available:

1. Deploy peers, orderer, CA, and CouchDB per `docker-compose.fabric.yml` (or org-specific infra).
2. Install and approve `pds-chaincode` on `pdschannel`.
3. Set `PDS_LEDGER_BACKEND=fabric-gateway`.
4. Set `PDS_FABRIC_CLIENT_ORG` to the submitting organization's name.
5. Provide valid connection profile and crypto material paths (extend env as implemented in `apps/api/src/fabric-config.ts`).

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
| API fails on startup with unsupported backend | Invalid `PDS_LEDGER_BACKEND` or `PDS_PERSISTENCE_BACKEND` | Check `.env` against tables above |
| `ECONNREFUSED` to postgres | DB not running or wrong DSN | `docker compose up postgres -d`; verify DSN host (`postgres` in compose, `localhost` locally) |
| Web shows demo data only | API not reachable | Check `curl localhost:3000/health`; ensure API container is up |
| Empty chaincode state errors | Bootstrap not run | `npm run fabric:bootstrap` |
| Port already in use | Conflicting service | Change host ports in `docker-compose.yml` or stop conflicting process |
| Tests fail before run | Build required | `npm run build` (root `pretest` builds shared-types and chaincode) |

## Related Documentation

- [README.md](README.md) — project overview and quick start
- [docs/technical/architecture.md](docs/technical/architecture.md) — system architecture
- [docs/implementation/mvp-implementation-plan.md](docs/implementation/mvp-implementation-plan.md) — MVP scope and acceptance gates
- [blockchain/fabric-network/README.md](blockchain/fabric-network/README.md) — Fabric topology scaffold
