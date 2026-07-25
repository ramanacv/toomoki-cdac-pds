# ViksitPDS Controlled-Demo Deployment Guide

## Scope And Safety

This guide deploys the local controlled demonstration: PostgreSQL, Keycloak,
one NestJS API replica, the React web application, and optionally the
Hyperledger Fabric 2.5.15 two-peer network.

It is not a pilot or production deployment. SMART-PDS/RCMS, state-SCM, and
AePDS/ePoS fixtures simulate approved integration seams; they are not live
government connections.

The current operational runtime uses an in-memory engine with serialized
full-state PostgreSQL snapshots. Snapshot saving and proof-outbox insertion are
separate operations. Consequently:

- run exactly one API replica;
- reset and deterministically reseed before a controlled demonstration;
- do not claim crash safety or concurrent mutation safety;
- do not deploy pilot traffic on this persistence path;
- report PostgreSQL operational acceptance separately from Fabric proof
  completion.

The replacement gate is defined in
[MVP hardening plan](docs/implementation/mvp-hardening-plan.md).

## Services And Ports

| Service | Local endpoint |
|---|---|
| Web | http://localhost:4173 |
| API | http://localhost:3000 |
| API health | http://localhost:3000/health |
| OpenAPI | http://localhost:3000/openapi.json |
| Keycloak | http://localhost:8080 |
| PostgreSQL | `localhost:5433` |
| Food CouchDB debug profile | http://localhost:5984/_utils |
| Godown CouchDB debug profile | http://localhost:6984/_utils |

The API's PostgreSQL DSN inside Compose uses port `5432`; host tools use the
published port `5433`.

## Prerequisites

- Node.js 22 and npm;
- Docker and Docker Compose;
- Git;
- sufficient local resources for PostgreSQL, Keycloak, and optional Fabric.

The maintained Fabric bootstrap runs pinned `hyperledger/fabric-tools:2.5.15`
inside Docker. Host `peer`, `osnadmin`, and `configtxgen` binaries are not
required.

Never commit `.env`, local secrets, generated Fabric crypto, channel artifacts,
chaincode packages, database dumps, journal output, or lifecycle evidence.

## Configuration

Copy the non-secret template:

```bash
cp .env.example .env
```

Important settings:

| Setting | Controlled-demo value |
|---|---|
| `PDS_AUTH_MODE` | `oidc` |
| `PDS_AUTHORIZATION_MODE` | `database` |
| `PDS_PERSISTENCE_BACKEND` | `postgres` in Compose |
| `PDS_LEDGER_MODE` | `demo` or `fabric` |
| `PDS_ALLOW_RESET` | `false` except during an explicitly authorized reset |
| `VITE_DATA_SOURCE` | `api`; use `mock` only as an explicitly labelled offline workspace |
| `VITE_OIDC_AUTHORITY` | browser-reachable Keycloak realm |

Static deployed API tokens are not supported. Browser users use Authorization
Code + PKCE. Service clients use OIDC client credentials.

Use strong local-only values for:

- `KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME`;
- `KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD`;
- `PDS_METRICS_CLIENT_SECRET`;
- `PDS_BENCHMARK_CLIENT_SECRET`;
- `PDS_INTEGRATION_CLIENT_SECRET`;
- `PDS_DEMO_USER_PASSWORD`.

Do not place those values in tracked files or shell history on a shared host.

## Install And Verify Source

```bash
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```

HTTP verification is a separate gate:

```bash
npm run test:demo-http
```

If the execution environment forbids loopback listeners, report that command as
environment-blocked rather than an application success or failure.

## Start PostgreSQL And IAM

Start only the dependencies first:

```bash
KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=pds-local-admin \
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD='<local-admin-password>' \
docker compose --profile iam up -d postgres keycloak
```

Wait until both services are healthy:

```bash
docker compose ps
```

Bootstrap the realm clients, roles, demo users, and database assignments:

```bash
KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=pds-local-admin \
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD='<local-admin-password>' \
PDS_METRICS_CLIENT_SECRET='<metrics-secret>' \
PDS_BENCHMARK_CLIENT_SECRET='<benchmark-secret>' \
PDS_INTEGRATION_CLIENT_SECRET='<integration-secret>' \
PDS_DEMO_USER_PASSWORD='<demo-user-password>' \
npm run iam:bootstrap
```

The bootstrap:

- assigns `demo-fps` to `FPS-101`;
- creates durable subject-role and FPS-scope assignments;
- configures management, department, supply-chain, audit, and platform users;
- configures the Maharashtra non-production integration service client;
- restricts that client to SMART-PDS/RCMS, state-SCM, and AePDS/ePoS endpoint
  families and canonical event types.

Run the IAM checks after changing realm or authorization configuration:

```bash
npm run test:iam
```

## Start In Demo Ledger Mode

The demo ledger mode does not require Fabric containers:

```bash
PDS_LEDGER_MODE=demo docker compose up -d --build api web
```

Check the deployment:

```bash
docker compose ps
curl http://localhost:3000/health
```

Open http://localhost:4173 and sign in through Keycloak. The UI presents:

- Department;
- Supply-chain Operations;
- Fair Price Shop Demo;
- Audit/Management;
- Platform Administration.

The FPS workspace must display the authenticated `FPS-101` assignment.
Authentication and distribution controls must remain visibly labelled as
simulations of authoritative AePDS/ePoS events.

## Seed Simulated Integration Events

This command sends `mock/integrations/maharashtra-sandbox-events.json` through
the authenticated canonical integration endpoints:

```bash
PDS_INTEGRATION_CLIENT_SECRET='<integration-secret>' \
npm run fixtures:integrations
```

Expected output identifies
`adapter: "fixture-backed-maharashtra-sandbox"` and
`realIntegration: false`.

The source-event HTTP contract is:

| Result | Status |
|---|---|
| New accepted event | `201` |
| Identical replay | `200`, original result |
| Missing-parent quarantine | `202` |
| Conflicting content for the same source ID | `409` |
| Malformed or prohibited content | validation error |

Use the integration service token to inspect:

- `GET /integrations/events`;
- `GET /integrations/health`;
- `GET /integrations/events/{sourceSystem}/{sourceEventId}/trace`;
- `POST /integrations/reconcile`.

The browser demo endpoints are not pilot ingestion endpoints.

## Start Fabric Mode

### Destructive reset warning

`blockchain/fabric-network/scripts/bootstrap-fabric-full.sh` stops the Fabric
containers and clears their in-container ledger state before rebuilding the
local network. Run it only when the local Fabric reset is explicitly
authorized.

```bash
blockchain/fabric-network/scripts/bootstrap-fabric-full.sh
```

The script generates local crypto and connection profiles, starts the orderer,
both peers, CouchDB, and CAs, joins `pdschannel`, and deploys
`pds-chaincode`.

The bootstrap's initial policy is a local-demo choice. Inspect the committed
definition before presenting governance claims. A policy requiring both Food
and Godown signatures must be deployed as an explicit new chaincode sequence
and verified on both peers.

Start the application in Fabric mode:

```bash
PDS_LEDGER_MODE=fabric \
PDS_FABRIC_ENDORSING_ORGS=FoodAndCivilSuppliesMSP,GodownWarehouseMSP \
docker compose --profile fabric up -d --build api web
```

Use the exact deployed MSP ID `GodownWarehouseMSP`.

`RecordLedgerProof` is the API's submission boundary. Named chaincode business
functions are compatibility functions. Do not configure the API to synchronously
re-execute business commands on Fabric.

### Chaincode upgrades

Before changing a deployed definition:

1. query the currently committed definition;
2. choose a new sequence for changed code;
3. package and install the identical artifact on both peers;
4. approve with Food and Godown organizations;
5. check commit readiness;
6. commit the definition;
7. verify it and run the two-peer regression.

Never copy an example sequence blindly or reuse a committed sequence for changed
code. Preserve the cross-peer gossip and discovery settings.

## Verify Operational And Proof Completion

Check API mode:

```bash
curl http://localhost:3000/health
```

Run the Fabric regression only against a running local network:

```bash
PDS_E2E_FABRIC=true npm run regression:fabric
```

For any accepted business event, inspect its proof:

```text
GET /ledger-proofs/{eventId}
```

Auditor or platform-admin subjects can inspect:

```text
GET /admin/proofs/summary
```

Interpret status exactly:

| Status | Meaning |
|---|---|
| `PENDING` | ready or scheduled for submission |
| `SUBMITTING` | claimed by one worker |
| `COMMITTED` | Fabric commit confirmed and `fabricTxId` recorded |
| `FAILED` | retryable, with `nextAttemptAt` |
| `DEAD_LETTER` | retry limit exhausted; authorized manual retry required |

An operation can be successful while its proof is pending or retryable. Do not
call it proof-complete until the row is `COMMITTED` with a real Fabric
transaction ID.

## Authorized Reset And Live Lifecycle

The live lifecycle mutates local demo data and requires reset permission. Do not
run it unless reset/reseed was requested or clearly authorized.

For an authorized controlled demonstration:

1. enable reset only for the lifecycle window;
2. run exactly one API replica;
3. reset and deterministically reseed;
4. ingest the simulated integration fixtures if they are part of the script;
5. exercise the operational journey;
6. wait for every intended proof to become `COMMITTED`;
7. store any generated evidence outside the repository;
8. disable reset again.

```bash
PDS_BENCHMARK_CLIENT_SECRET='<benchmark-secret>' \
node scripts/live-lifecycle.mjs
```

The script reports operational results and polls proof status separately. A
business lifecycle pass with outstanding proofs is not a full proof-completion
pass.

## Troubleshooting

### API cannot validate tokens

- Confirm Keycloak is healthy.
- Confirm the browser issuer is reachable from the browser.
- Confirm the API's JWKS URI is reachable from the API container.
- Confirm audience `pds-api`.
- Re-run `npm run iam:bootstrap` only with the required local secrets.

### Authenticated subject receives `403`

- Confirm the token subject has an active database role assignment.
- For FPS calls, confirm an active `FPS` scope assignment.
- For integration calls, confirm source system, endpoint family, event type,
  and credential assignments.
- Do not treat token claims as a substitute for database authorization.

### FPS resource returns `404`

An individual resource assigned to another FPS intentionally returns `404` to
avoid disclosure. A legacy mutation body whose identity fields conflict with
the authenticated assignment returns `403`.

### Proof remains pending or failed

- Check `GET /ledger-proofs/{eventId}` and `/admin/proofs/summary`.
- Inspect API logs without copying sensitive payloads into an issue.
- Confirm both peers, orderer, chaincode definition, gateway identity, TLS
  paths, discovery, and endorsement settings.
- Do not manually mark a proof committed.
- Use authorized replay for `DEAD_LETTER` after correcting the cause.

### Fabric discovery or endorsement fails

- Confirm both peers joined `pdschannel`.
- Confirm the exact MSP IDs in the committed policy.
- Confirm identical chaincode packages and approvals.
- Preserve peer external endpoints and cross-peer gossip bootstrap settings.
- Run a two-peer regression after correction.

## Pilot Release Gate

Before any pilot-ready claim, complete all of the following:

- Maharashtra department/NIC-approved RCMS/SMART-PDS, IAeSCM, and AePDS
  contracts and fixtures;
- row-scoped atomic PostgreSQL commands for ingestion, FPS receipt, and
  distribution;
- simultaneous command, worker, rollback, and crash testing;
- privacy and security review;
- TLS, secrets, VAPT, monitoring, incident response, retention, and authorized
  replay operations;
- backup/restore and recovery exercises;
- reconciliation sign-off;
- two-peer Fabric regression;
- deployment and HA/DR design for the approved target environment.

Passing the controlled-demo lifecycle does not satisfy this gate.
