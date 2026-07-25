# ViksitPDS

ViksitPDS is a demonstration and near-MVP trust, reconciliation, traceability,
and immutable-proof layer for India's Public Distribution System.

It complements SMART-PDS/RCMS, IAeSCM and state supply-chain systems,
AePDS/ePoS, procurement, logistics, authentication infrastructure, and command
centres. It does not replace them and is not production-ready.

## What The Controlled PoC Demonstrates

- a procurement-to-FPS custody journey;
- an identity-scoped `FPS-101` workspace with a second FPS fixture proving
  isolation;
- visibly simulated FPS authentication and distribution actions;
- fixture-backed SMART-PDS/RCMS, state-SCM, and AePDS/ePoS source events;
- privacy-safe beneficiary lifecycle projections, external ghost/duplicate
  screening, guided decisions, appeals, and reinstatement;
- canonical provenance, replay/conflict handling, missing-parent quarantine,
  reconciliation, and source-to-proof trace;
- PostgreSQL operational state with asynchronous, non-sensitive Fabric proofs;
- separate operational and proof completion.

The external adapters are simulations of authorized integration seams. They are
not live Maharashtra or J&K integrations.

## Authority And Privacy

PostgreSQL is authoritative for ViksitPDS operational workflow state. Fabric
stores privacy-approved immutable proofs asynchronously through
`RecordLedgerProof`; Fabric delay or failure does not roll back an accepted
operation.

Never place raw Aadhaar, biometrics, OTPs, phone/mobile numbers, full ration-card
values, unmasked beneficiary names or addresses, or device credentials in
responses, logs, source-event storage, dead letters, or Fabric proofs. Use
approved hashes and opaque references.

## Current Limitation

The controlled demo still runs the in-memory domain engine with serialized
full-state PostgreSQL snapshots. Snapshot persistence and proof-outbox insertion
are separate operations. Run exactly one API replica, reset and deterministically
reseed before demonstrations, and do not infer crash atomicity, concurrent
mutation safety, pilot readiness, or production readiness.

The mandatory replacement is tracked in
[MVP hardening plan](docs/implementation/mvp-hardening-plan.md).

## Architecture

| Layer | Technology and responsibility |
|---|---|
| Web | React 19 + Vite 7; separate department, operations, FPS, audit/management, and platform-admin journeys |
| API | NestJS 11 on Node.js 22; OIDC, database authorization, domain and integration services |
| Operations | PostgreSQL 16; workflow state, assignments, canonical events, reconciliation, proof outbox |
| Proofs | Hyperledger Fabric 2.5.15 two-org demo or in-process demo ledger |
| Contracts | `@pds/shared-types` and fixture-backed adapters in `mock/integrations/` |

Ledger modes:

| `PDS_LEDGER_MODE` | Behavior |
|---|---|
| `demo` | In-process ledger adapter; Fabric containers not required |
| `fabric` | Fabric Gateway to `pds-chaincode` on `pdschannel` |

The API modules include authorization, integrations, proof/outbox operations,
and the operational domain modules under `apps/api/src/modules/`.

## Repository Layout

```text
apps/api/                    NestJS API
apps/web/                    React application
packages/shared-types/       Public domain and API contracts
packages/fixtures/           Typed canonical fixtures
blockchain/chaincode/        TypeScript Fabric contracts
blockchain/fabric-network/   Fabric 2.5.15 two-org local network
infra/postgres/              Additive schema and generated seed
infra/keycloak/              Local OIDC realm import
mock/entities/               Canonical operational fixtures
mock/integrations/           Simulated source-system events
scripts/                     Seed, IAM, lifecycle, smoke, and regression tooling
docs/                        Product, architecture, design, and implementation docs
```

`NBF-LITE/` is separate reference/research tooling and is not part of the
ViksitPDS runtime.

## Prerequisites

- Node.js 22 and npm;
- Docker and Docker Compose;
- Git.

Fabric CLI binaries are not required on the host for the maintained full
bootstrap; its scripts use the pinned Fabric 2.5.15 tool image.

## Controlled Local Start

Copy the non-secret template and install dependencies:

```bash
cp .env.example .env
npm ci
```

Start PostgreSQL and Keycloak:

```bash
KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=pds-local-admin \
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD='<local-admin-password>' \
docker compose --profile iam up -d postgres keycloak
```

Bootstrap demo users, `demo-fps` → `FPS-101`, database authorization, and
service clients. Supply local-only secrets; do not commit them:

```bash
KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=pds-local-admin \
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD='<local-admin-password>' \
PDS_METRICS_CLIENT_SECRET='<metrics-secret>' \
PDS_BENCHMARK_CLIENT_SECRET='<benchmark-secret>' \
PDS_INTEGRATION_CLIENT_SECRET='<integration-secret>' \
PDS_DEMO_USER_PASSWORD='<demo-user-password>' \
npm run iam:bootstrap
```

Then start the single API replica and web application:

```bash
docker compose up -d --build api web
```

| Service | URL |
|---|---|
| Web | http://localhost:4173 |
| API | http://localhost:3000 |
| Health | http://localhost:3000/health |
| OpenAPI | http://localhost:3000/openapi.json |
| Keycloak | http://localhost:8080 |
| PostgreSQL | `localhost:5433` |

`VITE_DATA_SOURCE=api` is the maintained online mode.
`VITE_DATA_SOURCE=mock` is an explicitly labelled fixture-only workspace; there
is no automatic fallback.

For Fabric startup, integration fixture ingestion, reset/reseed gates, and proof
verification, use the [deployment guide](fabric-deployment.md).

## Key Configuration

| Variable | Purpose |
|---|---|
| `PDS_AUTH_MODE=oidc` | Validate OIDC access tokens |
| `PDS_AUTHORIZATION_MODE=database` | Require durable authorization assignments |
| `PDS_OIDC_*` | Issuer, audience, JWKS URI, and clock skew |
| `PDS_POSTGRES_DSN` | PostgreSQL connection |
| `PDS_LEDGER_MODE` | `demo` or `fabric` |
| `PDS_FABRIC_*` | Gateway identity, peer, channel, chaincode, and endorsers |
| `PDS_ALLOW_RESET` | Keep `false` except an explicitly authorized demo reset |
| `VITE_DATA_SOURCE` | `api` or explicit `mock` |
| `VITE_OIDC_*` | Browser OIDC authority and public client ID |

See [.env.example](.env.example) and
[fabric-env.example](blockchain/fabric-network/fabric-env.example) for the
complete local contract.

## Integration API

Authenticated `integration-service` accounts use:

- `POST /integrations/smartpds/v1/master-references`;
- `POST /integrations/scm/v1/allocation-events`;
- `POST /integrations/scm/v1/movement-events`;
- `POST /integrations/epos/v1/distribution-events`.

New, identical, quarantined, and conflicting events return `201`, `200`, `202`,
and `409` respectively. Operational endpoints expose integration events, source
health, reconciliation, trace, and proof status. Full API details are available
at `/openapi.json`.

## Beneficiary registry and eligibility demonstration

The Eligibility Review workspace contains fictional Maharashtra and J&K
profiles. A department user can run the separately deployable external
screening simulation, review death/activity/economic/land/duplicate signals,
record due-process actions, and demonstrate that review remains non-blocking
until an authorized RCMS decision.

Authorized lifecycle events use:

- `POST /beneficiary-registry/v1/events`;
- `GET /beneficiary-registry/v1/summary`;
- the eligibility case endpoints under `/eligibility/v1`.

PostgreSQL stores the operational registry projection and case history.
Privacy-safe lifecycle mutations and final decisions create asynchronous Fabric
proof intents; beneficiary identity and raw cross-agency evidence remain
off-chain. See the
[requirements alignment](docs/implementation/beneficiary-registry-alignment.md).

## Development And Verification

```bash
npm run build
npm run typecheck
npm run lint
npm test
npm run test:demo-http
```

Focused commands:

| Command | Purpose |
|---|---|
| `npm run fixtures:sql` | Regenerate PostgreSQL seed SQL |
| `npm run fixtures:integrations` | Ingest simulated source events through the canonical API seam |
| `npm run test:iam` | Check Keycloak and durable-authorization behavior |
| `npm run test:lifecycle` | Check lifecycle scripts and integration atomicity coverage |
| `npm run regression:fabric` | Opt-in two-peer Fabric regression when the network is running |

The full live lifecycle resets local demo data. Run it only when reset/reseed is
explicitly authorized. Report operational completion separately from proof
completion and verify all intended outbox rows are `COMMITTED`.

## Documentation

Start with the [documentation index](docs/README.md), especially:

1. [Product requirements](docs/product/prd.md)
2. [J&K/Maharashtra product reference](docs/product/jkmaha-epos-smartpds-reference.md)
3. [Technical architecture](docs/technical/architecture.md)
4. [Technical design](docs/technical/design.md)
5. [J&K/Maharashtra implementation plan](docs/implementation/jkmaha-epos-smartpds-implementation-plan.md)
6. [Deployment guide](fabric-deployment.md)
