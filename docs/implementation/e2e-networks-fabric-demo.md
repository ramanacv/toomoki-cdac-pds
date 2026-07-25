# ViksitPDS E2E Networks Fabric Demo (Compose)

Stand up the controlled Fabric demonstration on **one plain E2E Networks cloud
node** using the same root Docker Compose stack and Fabric bootstrap already
documented in [fabric-deployment.md](../../fabric-deployment.md).

This is a remote controlled demo, not a pilot or production deployment. Run
exactly one API replica.

## Architecture

```text
Browser
  │
  ├─ :4173 ──▶ web
  └─ :8080 ──▶ keycloak
web ──▶ api :3000 ──▶ postgres
                 └──▶ Fabric peers / orderer (profile fabric)
```

Public firewall / security rules: **22**, **4173**, **8080**.  
Keep Postgres `5433`, Fabric peer/orderer/CA, and CouchDB **closed** to the internet.

## Node baseline

| Item | Value |
|---|---|
| OS | Ubuntu 24.04 LTS |
| Size | **4 vCPU / 16 GB RAM** minimum for Fabric; more CPU/RAM if builds feel tight |
| Disk | **80 GB** or larger (Fabric + Node images) |
| Network | Public IPv4 on the node, SSH key access |
| Host packages | Docker Engine + Compose plugin, Git, Node.js 22 |

### RAM

**8 GB is not reliable for Fabric mode.** Prefer **16 GB**.

Rough budget: two peers allow up to ~1 GB each (`mem_limit` in
`blockchain/fabric-network/docker-compose.fabric.yml`), plus CouchDB, orderer,
CAs, Postgres, Keycloak, API, web, and Docker. Steady state is often **6–8+ GB**;
`bootstrap-fabric-full.sh` and `docker compose --build` can exceed **8 GB**.

If you must use 8 GB: add 4–8 GB swap, build API/web before starting Fabric, and
expect OOM risk. Demo ledger mode without Fabric can fit 8 GB; this guide stays
on Fabric.

## Host setup

### 1. Clone and configure

```bash
git clone <repo-url> toomoki-cdac-pds
cd toomoki-cdac-pds
cp .env.example .env
```

Set strong local-only secrets in `.env` / the shell (never commit them):

- `KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME`
- `KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD`
- `PDS_METRICS_CLIENT_SECRET`
- `PDS_BENCHMARK_CLIENT_SECRET`
- `PDS_INTEGRATION_CLIENT_SECRET` (if your bootstrap requires it)
- `PDS_DEMO_USER_PASSWORD`

### 2. Public URL and OIDC/CORS

Replace `<PUBLIC_IP>` with the node’s public IPv4:

```bash
export PUBLIC_IP=<PUBLIC_IP>
export PUBLIC_WEB=http://${PUBLIC_IP}:4173
export PUBLIC_AUTH=http://${PUBLIC_IP}:8080
```

In `.env` (or the environment used for Compose builds):

```bash
VITE_OIDC_AUTHORITY=${PUBLIC_AUTH}/realms/viksitpds
PDS_OIDC_ISSUER=${PUBLIC_AUTH}/realms/viksitpds
PDS_OIDC_JWKS_URI=http://keycloak:8080/realms/viksitpds/protocol/openid-connect/certs
PDS_CORS_ORIGINS=${PUBLIC_WEB}
PDS_PUBLIC_WEB_ORIGIN=${PUBLIC_WEB}
PDS_LEDGER_MODE=fabric
PDS_FABRIC_ENDORSING_ORGS=FoodAndCivilSuppliesMSP,GodownWarehouseMSP
```

`VITE_OIDC_AUTHORITY` is a **build-time** web image arg. Rebuild `web` after
changing it.

### 3. Start PostgreSQL and Keycloak

```bash
KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=... \
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=... \
docker compose --profile iam up -d postgres keycloak
```

Wait until both are healthy: `docker compose --profile iam ps`.

### 4. Install deps and bootstrap IAM

```bash
npm ci

KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=... \
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=... \
PDS_METRICS_CLIENT_SECRET=... \
PDS_BENCHMARK_CLIENT_SECRET=... \
PDS_INTEGRATION_CLIENT_SECRET=... \
PDS_DEMO_USER_PASSWORD=... \
npm run iam:bootstrap
```

### 5. Point Keycloak `pds-web` at the public web origin

The realm import allows only localhost redirect URIs. Patch them:

```bash
PDS_PUBLIC_WEB_ORIGIN=${PUBLIC_WEB} \
KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=... \
KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=... \
npm run iam:configure-public-web
```

That script updates `pds-web` redirect URIs / web origins / logout URIs and sets
realm `sslRequired=none` for plain HTTP public demos (required when the browser
talks to Keycloak on a non-localhost host over HTTP).

Use `kcadm` against **`http://localhost:8080` inside the Keycloak container**
(or an SSH tunnel to localhost:8080). Opening the Admin Console on the public
IP while `sslRequired=external` shows “HTTPS required”.

### 6. Bootstrap Fabric (authorized reset)

`blockchain/fabric-network/scripts/bootstrap-fabric-full.sh` stops Fabric
containers and clears in-container ledger state. Run only when that reset is
explicitly authorized:

```bash
blockchain/fabric-network/scripts/bootstrap-fabric-full.sh
```

### 7. Start API + web in Fabric mode

```bash
PDS_LEDGER_MODE=fabric \
PDS_FABRIC_ENDORSING_ORGS=FoodAndCivilSuppliesMSP,GodownWarehouseMSP \
docker compose --profile iam --profile fabric up -d --build api web
```

Ensure Keycloak remains up (`--profile iam`) if you recreate the stack.

### 8. Verify

```bash
docker compose ps
curl -fsS http://127.0.0.1:3000/health
```

Expect Fabric ledger mode in the health/API path used by your build.

Optional:

```bash
PDS_E2E_FABRIC=true npm run regression:fabric
```

Proofs: `GET /ledger-proofs/{eventId}` and admin proof summary until status is
`COMMITTED`.

Browser: `http://<PUBLIC_IP>:4173`.

## Browser sign-in limitation (plain HTTP + public IP)

OIDC Authorization Code + PKCE needs the Web Crypto API (`crypto.subtle`).
Browsers expose that only in a **secure context**: `https://` or
`http://localhost` / `http://127.0.0.1`.

Signing in from a remote browser at `http://<public-ip>:4173` fails with
`Crypto.subtle is available only in secure contexts`. That is a browser rule,
not a ViksitPDS bug. This Compose guide documents the plain public-HTTP layout;
for a jury-facing public URL terminate TLS with a real hostname (load balancer
or host certificates) and rebuild with HTTPS `VITE_OIDC_AUTHORITY` / CORS /
Keycloak redirect URIs.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm ci` missing lockfile | Not in repo root | `cd` to directory containing `package-lock.json` |
| Web Docker build: `apps/web/node_modules` not found | npm hoisted deps | Pull latest Dockerfiles that `mkdir -p` workspace `node_modules` |
| Sign-in no-op / authority on localhost | Web built with default `VITE_OIDC_AUTHORITY` | Set public authority in `.env`, `docker compose ... up -d --build --force-recreate web` |
| Keycloak 403 / HTTPS required on public IP | `sslRequired=external` | Run `npm run iam:configure-public-web` (sets `sslRequired=none` for HTTP origins) via localhost/`kcadm` |
| Invalid `redirect_uri` | `pds-web` still localhost-only | Re-run `iam:configure-public-web` with `PDS_PUBLIC_WEB_ORIGIN=http://<ip>:4173` |
| API token validation fails | Issuer/JWKS mismatch | Browser issuer = public Keycloak URL; API `PDS_OIDC_JWKS_URI` can stay `http://keycloak:8080/...` |
| Fabric discovery / endorsement fails | Peers/channel/chaincode | Re-check bootstrap; see [fabric-deployment.md](../../fabric-deployment.md) |
| OOM during bootstrap/build | Undersized node | Use 16 GB RAM; avoid concurrent heavy builds |

## Safety

- Do not commit `.env`, Fabric crypto, journals, or cloud secrets.
- Do not expose Fabric admin or Postgres ports publicly.
- Do not claim crash atomicity, concurrent mutation safety, or pilot readiness.
- Do not run live-lifecycle / reset unless explicitly authorized.

## Related

- [DEPLOYMENT.md](../../DEPLOYMENT.md)
- [fabric-deployment.md](../../fabric-deployment.md)
- [scripts/iam/configure-public-web-client.sh](../../scripts/iam/configure-public-web-client.sh)
