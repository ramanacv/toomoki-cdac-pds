# ViksitPDS public HTTPS demo on a single EC2 (Compose + Caddy)

This is the supported way to run a **browser-reachable** controlled demo on a
public host. Modern browsers only expose `crypto.subtle` (required for OIDC
PKCE) in a secure context: **HTTPS** or localhost. Plain
`http://<public-ip>:4173` cannot sign in.

## Architecture

```text
Browser
  │
  ├─ https://<web-host>      ──▶ Caddy :443 ──▶ web :4173
  └─ https://<auth-host>     ──▶ Caddy :443 ──▶ keycloak :8080
                                    │
web ──▶ api :3000 ──▶ postgres
                 └──▶ Fabric (optional --profile fabric)
```

Caddy obtains a Let's Encrypt certificate automatically. You do **not** need a
custom domain: [sslip.io](https://sslip.io) maps `\<ip\>.sslip.io` and
`auth.\<ip\>.sslip.io` to your Elastic IP.

## EC2 baseline

- Ubuntu 24.04, **16 GB RAM** recommended for Fabric mode
- Security group: **22, 80, 443** (ACME + HTTPS). Do not expose Postgres or Fabric.
- After cutover, prefer not publishing 4173/8080 publicly; Caddy is the edge.

## One-time host setup

Install Docker Engine + Compose plugin, Git, and Node.js 22. Clone this
repository.

```bash
cp .env.example .env
# set KEYCLOAK_BOOTSTRAP_ADMIN_* and demo/client secrets in .env
```

Generate HTTPS public-demo settings (replace IP and email):

```bash
chmod +x scripts/edge/configure-https-demo-env.sh scripts/iam/configure-public-web-client.sh

scripts/edge/configure-https-demo-env.sh \
  --ip 151.185.43.18 \
  --email you@example.com \
  --write-env
```

Or with your own DNS:

```bash
scripts/edge/configure-https-demo-env.sh \
  --web demo.example.com \
  --auth login.example.com \
  --email you@example.com \
  --write-env
```

Point both DNS names (or rely on sslip.io) at the Elastic IP. Open ports 80 and
443 before starting Caddy.

## Start stack

```bash
# IAM deps
docker compose --profile iam up -d postgres keycloak

npm ci
# export secrets, then:
npm run iam:bootstrap

# Point pds-web redirects at the HTTPS web origin
set -a && source .env && set +a
npm run iam:configure-public-web

# Optional Fabric bootstrap (authorized reset)
# blockchain/fabric-network/scripts/bootstrap-fabric-full.sh

# App + TLS edge (rebuild web so VITE_OIDC_AUTHORITY is baked in)
PDS_LEDGER_MODE=fabric \
PDS_FABRIC_ENDORSING_ORGS=FoodAndCivilSuppliesMSP,GodownWarehouseMSP \
docker compose --profile iam --profile fabric --profile edge up -d --build
```

For demo ledger without Fabric:

```bash
PDS_LEDGER_MODE=demo \
docker compose --profile iam --profile edge up -d --build
```

## Verify

```bash
curl -fsS "https://${PDS_AUTH_HOST}/realms/viksitpds/.well-known/openid-configuration" | head
curl -fsS "https://${PDS_WEB_HOST}/" | head
curl -fsS http://127.0.0.1:3000/health
```

Open `https://<web-host>` in a browser and use **Sign in with Keycloak**.

## Troubleshooting

| Symptom | Fix |
|---|---|
| ACME / certificate failure | Ports 80+443 open; hostname resolves to this instance; valid `PDS_ACME_EMAIL` |
| `Crypto.subtle` / insecure context | You are still on `http://` or a raw IP URL — use the `https://` web host |
| Keycloak `HTTPS required` | Run `npm run iam:configure-public-web` after HTTPS is up; prefer `sslRequired=external` |
| Invalid `redirect_uri` | Re-run `iam:configure-public-web` with `PDS_PUBLIC_WEB_ORIGIN=https://<web-host>` |
| Issuer / JWKS mismatch | Rebuild web after changing `VITE_OIDC_AUTHORITY`; API issuer must match Keycloak's public HTTPS issuer |

## Safety

This remains a controlled demonstration: single API replica, demo secrets, and
optional Fabric two-peer network. It is not a pilot or production deployment.
