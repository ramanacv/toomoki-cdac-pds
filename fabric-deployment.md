# Fabric Mode — Deployment & Testing Guide

This guide covers bootstrapping the live Hyperledger Fabric network, starting the ViksitPDS stack in **Fabric mode** (`PDS_LEDGER_MODE=fabric`), and verifying end-to-end behavior.

For general deployment options (demo mode, local dev, production notes), see [DEPLOYMENT.md](DEPLOYMENT.md).

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Docker + Docker Compose** | Required |
| **Node.js 22+** and **npm** | For smoke/demo/regression scripts from the host |
| **Ports free** | `3000` (API), `4173` (web), `5433` (postgres), `7050/7051/7053/9051` (Fabric) |

You do **not** need Fabric CLI binaries on the host if you use the all-in-one bootstrap script (recommended).

## Architecture (fabric profile)

```text
web ──▶ api (PDS_LEDGER_MODE=fabric) ──▶ postgres
              │
              ├── gRPC/TLS ──▶ peer0.food.example.com
              └── (dual-write) operational snapshots in postgres
orderer + peer0.godown + CouchDB + Fabric CAs (profile fabric)
```

- **Channel:** `pdschannel`
- **Chaincode:** `pds-chaincode`
- **Organizations (deployed):** Food Department + Godown (2-org demo)

---

## Step 1 — Bootstrap the Fabric network

From the repository root:

```bash
cd /path/to/toomoki-cdac-pds

# Recommended: full bootstrap via Docker tools (no host peer/osnadmin/configtxgen needed)
./blockchain/fabric-network/scripts/bootstrap-fabric-full.sh
```

This script:

1. Stops existing Fabric containers (clears in-container ledger state)
2. Generates crypto, channel config, and connection profiles
3. Starts Fabric containers (orderer, 2 peers, CouchDB, CAs)
4. Joins the orderer and peers to channel `pdschannel`
5. Deploys chaincode `pds-chaincode`

**Alternative (manual):** if you already have Fabric CLI tools installed:

```bash
./blockchain/fabric-network/scripts/bootstrap-network.sh
docker compose --profile fabric up -d \
  orderer.pds.example.com couchdb0 couchdb1 \
  peer0.food.example.com peer0.godown.example.com \
  ca.food.example.com ca.godown.example.com
./blockchain/fabric-network/scripts/osnadmin-channel-join.sh
./blockchain/fabric-network/scripts/peer-channel-join.sh
./blockchain/fabric-network/scripts/deploy-chaincode.sh
```

Verify Fabric containers are running:

```bash
docker compose --profile fabric ps
```

You should see `orderer.pds.example.com`, `peer0.food.example.com`, `peer0.godown.example.com`, etc.

---

## Step 2 — Configure Fabric mode + auth tokens

Copy the Fabric env template to `.env` at the repo root (Docker Compose reads this):

```bash
cp .env.fabric.example .env
```

Key values in `.env.fabric.example`:

```env
PDS_LEDGER_MODE=fabric
PDS_PERSISTENCE_BACKEND=postgres
PDS_POSTGRES_DSN=postgresql://pds:pds@localhost:5433/pds_chain

# Required for mutating API calls in fabric mode
PDS_DEV_AUTH_TOKEN=dev-mvp-token
PDS_DEV_AUTH_ROLE=department
PDS_DEV_AUTH_SUBJECT=fabric-smoke
PDS_ADMIN_TOKEN=admin-mvp-token

# Web — always use live API in fabric mode
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=/api
VITE_DEV_AUTH_TOKEN=dev-mvp-token
VITE_ADMIN_TOKEN=admin-mvp-token
```

**Important:** In Fabric mode, every **mutating** API call (`POST`, `PUT`, etc.) requires:

```http
Authorization: Bearer dev-mvp-token
```

---

## Step 3 — Start the full stack

```bash
docker compose --profile fabric up --build -d
```

This starts:

- **postgres** (port `5433`)
- **api** with `PDS_LEDGER_MODE=fabric`, connected to the Fabric peer over the `pds-fabric` Docker network
- **web** UI (port `4173`)
- All Fabric services (if not already up from bootstrap)

Wait for health:

```bash
docker compose ps
# api should show "healthy"
```

---

## Step 4 — Verify API is in Fabric mode

```bash
curl -s http://localhost:3000/health | jq
```

Expected:

```json
{ "ok": true, "ledgerMode": "fabric" }
```

If you see `"ledgerMode": "demo"`, your `.env` was not picked up — confirm `PDS_LEDGER_MODE=fabric` is in `.env` and restart:

```bash
docker compose --profile fabric up --build -d
```

Readiness (ledger bootstrapped from seed data):

```bash
curl -s http://localhost:3000/health/ready | jq
```

Dashboard smoke:

```bash
curl -s http://localhost:3000/dashboard/summary | jq
```

---

## Step 5 — Run automated Fabric smoke tests

### Gateway smoke (recommended first check)

```bash
PDS_DEV_AUTH_TOKEN=dev-mvp-token npm run smoke:fabric
```

This:

1. Hits `/health`
2. `POST /stakeholders` (with Bearer token)
3. `GET /trace/lots/LOT-RICE-2026-001` and asserts `verificationSource === "chaincode"`

### Shell smoke

```bash
PDS_DEV_AUTH_TOKEN=dev-mvp-token blockchain/fabric-network/scripts/smoke-fabric.sh
```

### Happy-path demo against live Fabric API

```bash
PDS_DEV_AUTH_TOKEN=dev-mvp-token node scripts/demo/happy-path.mjs --ledger=fabric
```

### Exception-path demo

```bash
PDS_DEV_AUTH_TOKEN=dev-mvp-token node scripts/demo/exception-path.mjs --ledger=fabric
```

### Full regression suite (includes Fabric gates)

```bash
PDS_DEV_AUTH_TOKEN=dev-mvp-token npm run regression:fabric
```

This runs build, all tests, demo smoke, fabric smoke, and opt-in fabric e2e tests.

---

## Step 6 — Test in the Web UI

1. Open **http://localhost:4173**

2. Confirm the status badge shows **"Live API (Fabric)"** (not "Demo data" or "Live API (Demo)").

3. A yellow banner appears at the top in Fabric mode — **enter the API bearer token**:
   - Token: `dev-mvp-token` (must match `PDS_DEV_AUTH_TOKEN` on the API)
   - Click **Save token**

4. Switch roles via the role selector:
   - Department, Procurement, Godown, FPS, Auditor

5. Exercise workflow actions from the workbench (allocate, receipt, distribution, etc.) — these hit the real Fabric ledger.

6. Open **Trace Explorer** for a lot (e.g. `LOT-RICE-2026-001`) and confirm trace data comes from chaincode (`verificationSource: chaincode`).

7. Try scenario selectors:
   - **Happy path**
   - **Short receipt**
   - **Duplicate claim**

8. **Admin pages** (optional): `/admin` routes need `X-Admin-Token: admin-mvp-token` when `PDS_ADMIN_TOKEN` is set. Set this in the admin UI or via `VITE_ADMIN_TOKEN` if you rebuild the web image with that env baked in.

---

## Step 7 — Manual API testing with curl

Register a stakeholder (requires auth in fabric mode):

```bash
curl -s -X POST http://localhost:3000/stakeholders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-mvp-token" \
  -d '{
    "stakeholderId": "MANUAL-001",
    "stakeholderType": "DISTRICT_SUPPLY_OFFICE",
    "name": "Manual Test",
    "district": "Demo",
    "licenseNo": "MAN-001",
    "status": "ACTIVE"
  }' | jq
```

Trace a lot:

```bash
curl -s http://localhost:3000/trace/lots/LOT-RICE-2026-001 | jq
```

OpenAPI spec: **http://localhost:3000/openapi.json**

---

## Step 8 — Validate Fabric artifacts (optional)

```bash
node blockchain/fabric-network/scripts/validate-fabric-artifacts.mjs
```

---

## Cleanup / reset

Stop everything:

```bash
docker compose --profile fabric down
```

Stop and wipe postgres data:

```bash
docker compose --profile fabric down -v
```

### Full Fabric re-bootstrap (crypto or channel corruption)

If channel join fails or crypto is stale, wipe cryptogen artifacts and re-bootstrap. **Do not** re-run `cryptogen` on top of an existing tree without deleting org MSP directories first.

```bash
docker compose --profile fabric down

# Wipe stale cryptogen artifacts (keep fabric-ca/ — used by CA containers)
rm -rf blockchain/fabric-network/crypto/ordererOrganizations \
       blockchain/fabric-network/crypto/peerOrganizations \
       blockchain/fabric-network/channel-artifacts

./blockchain/fabric-network/scripts/bootstrap-fabric-full.sh
docker compose --profile fabric up --build -d
```

---

## Troubleshooting

### Common issues

| Symptom | Fix |
|---------|-----|
| `ledgerMode: "demo"` in `/health` | Copy `.env.fabric.example` → `.env`, restart compose with `--profile fabric` |
| `401` on POST requests | Set `PDS_DEV_AUTH_TOKEN` on API **and** Bearer token in web UI |
| `Fabric gateway smoke` fails on `verificationSource` | API still in demo mode — see above |
| API can't connect to peer | Run bootstrap; check `docker compose --profile fabric ps`; crypto must exist under `blockchain/fabric-network/crypto/` |
| `ECONNREFUSED` to postgres | `docker compose up postgres -d`; host port is **5433** |
| Web shows mock/fixture data | API not reachable — check `curl localhost:3000/health`; badge should say "Live API (Fabric)" |
| Port conflicts | Stop other services on 3000/4173/7051 or change ports in compose files |

### JoinChain / MSP / certificate errors

**Error example:**

```text
proposal failed (err: bad proposal response 500: "JoinChain" for channelID = pdschannel failed
because of validation of configuration block ... Failed capabilities check ...
x509: ECDSA verification failure ... ca.pds.example.com
```

**Root cause:** Partial crypto regeneration. `cryptogen` does not safely refresh an existing `crypto/` tree. Re-running it without wiping first can leave:

- A **CA cert wrongly placed in `admincerts/`** (e.g. `ca.pds.example.com-cert.pem`)
- **New** org-level `cacerts/` but **old** orderer/peer node certs that no longer chain to the new CA

When a peer runs `peer channel join`, it validates the channel config block and sets up the Orderer MSP. A CA cert in `admincerts/` causes ECDSA verification failure.

**Fix:** Use the [Full Fabric re-bootstrap](#full-fabric-re-bootstrap-crypto-or-channel-corruption) steps above.

The bootstrap scripts now guard against this:

- `generate-crypto.sh` deletes `ordererOrganizations/` and `peerOrganizations/` before `cryptogen`
- `configtxgen.sh` removes stale channel blocks before regenerating
- `bootstrap-fabric-full.sh` runs `docker compose --profile fabric down` first

**Verify MSP health after regeneration:**

```bash
# admincerts should contain only Admin identity certs, NOT the CA cert
ls blockchain/fabric-network/crypto/ordererOrganizations/pds.example.com/msp/admincerts/

# Orderer node cert should verify against org CA
openssl verify \
  -CAfile blockchain/fabric-network/crypto/ordererOrganizations/pds.example.com/msp/cacerts/ca.pds.example.com-cert.pem \
  blockchain/fabric-network/crypto/ordererOrganizations/pds.example.com/orderers/orderer.pds.example.com/msp/signcerts/*.pem
```

### Chaincode install / Docker build errors

**Error example:**

```text
chaincode install failed: docker build failed: write unix @->/run/docker.sock: write: broken pipe
```

**Root cause (most common):** **Docker Engine v29+** is incompatible with Fabric peer/orderer images **before v2.5.15**. The peer uses an older Docker client library that breaks when talking to Docker v29's API (see [hyperledger/fabric#5350](https://github.com/hyperledger/fabric/issues/5350)).

**Fix (recommended):** Use Fabric **2.5.15+** peer and orderer images (this repo defaults to `hyperledger/fabric-peer:2.5.15` and `hyperledger/fabric-orderer:2.5.15`). Recreate the Fabric containers, then redeploy chaincode:

```bash
docker compose --profile fabric pull orderer.pds.example.com peer0.food.example.com peer0.godown.example.com
docker compose --profile fabric up -d --force-recreate \
  orderer.pds.example.com peer0.food.example.com peer0.godown.example.com
./blockchain/fabric-network/scripts/deploy-chaincode.sh
```

**Alternatives if you cannot upgrade Fabric images:**

- Downgrade Docker Engine to **v28.x**, or
- Deploy chaincode as a service (CCAAS) so peers do not build Docker images during `chaincode install`

Ensure Docker is healthy (`docker info`) and peers can reach the socket (they mount `/var/run/docker.sock`).

---

## Quick reference — one-liner flow

```bash
cd /path/to/toomoki-cdac-pds
./blockchain/fabric-network/scripts/bootstrap-fabric-full.sh
cp .env.fabric.example .env
docker compose --profile fabric up --build -d
curl -s http://localhost:3000/health
PDS_DEV_AUTH_TOKEN=dev-mvp-token npm run smoke:fabric
# Then open http://localhost:4173, save token dev-mvp-token, test workflows
```

---

## Related documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) — general deployment models and environment reference
- [blockchain/fabric-network/README.md](blockchain/fabric-network/README.md) — Fabric topology and bootstrap script breakdown
- [docs/technical/poc-to-mvp-with-fabric.md](docs/technical/poc-to-mvp-with-fabric.md) — Fabric mode readiness plan and auth/UI changes
