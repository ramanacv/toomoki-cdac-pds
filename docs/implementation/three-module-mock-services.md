# Three-module mock services map

## Purpose

ViksitPDS presents three operational demo modules plus a trust layer. Authoritative
state systems remain outside ViksitPDS; local demos use fixture seams and
optional mock HTTP services.

This is **not** a live UIDAI, SMART-PDS, or state SCM integration.

## Module → mock / fixture map

| Demo module | Real-world analogue | What ViksitPDS uses in demos |
| --- | --- | --- |
| **Supply chain** | State SCM / IAeSCM | In-app lots, transfers, allocations + `mock/integrations` `STATE_SCM` fixtures. No separate `scm-mock` app. |
| **Card & eligibility** (ghost / list integrity) | SMART-PDS / RCMS review | Existing `@pds/eligibility-mock` (`apps/eligibility-mock`, port **3010**) for synthetic screening signals. |
| **FPS authentication** | AePDS / ePoS + Aadhaar auth | New `@pds/epos-auth-mock` (`apps/epos-auth-mock`, port **3011**) simulating **Aadhaar/UIDAI-style auth outcomes** (OTP / biometric / supervisor exception). |

Trust & reconcile uses ViksitPDS dashboard / audit / verify screens over the
above operational events and proofs.

## Privacy posture (mandatory)

Operational auth and Fabric proofs are **Aadhaar-linked only through opaque hashes**:

- `aadhaarRefHash`
- `beneficiaryRefHash`
- `rationCardHash`

Never put into Fabric proofs, auth mock request/response bodies, or proof fixtures:

- real Aadhaar numbers
- OTP values
- biometrics
- phone numbers
- full ration-card values

### Controlled demo UI panel (simulationOnly)

`mock/entities/eligibility-beneficiaries.json` may show **clearly fictional** UI
fields for the eligibility / FPS demo narrative:

- fictional name and address (always labelled `(Fictional)`)
- synthetic `demoAadhaarNumber` values that **must start with `9999`**
- synthetic `demoMobileNumber` values that **must start with `90000`** (OTP inbox narrative)
- sample `familyMembers`

Those UI fields must not be submitted to epos-auth-mock or Fabric. Auth continues
to use `aadhaarRefHash` only. Mock OTP **values** are never stored — only the
demo handset number is shown for the narrative.

## Two FPS dealers and tehsil split

| Shop | Dealer (fictional) | Dealer ID | Block / Tehsil | Location |
| --- | --- | --- | --- | --- |
| `FPS-101` / `FPS/MH/HAV/101` | Suresh Jadhav | `DLR-MH-HAV-101` | Haveli / Haveli | Village Demo-Haveli |
| `FPS-202` / `FPS/MH/MUL/202` | Anita Deshmukh | `DLR-MH-MUL-202` | Mulshi / Mulshi | Village Demo-Mulshi |

MH panel beneficiaries `BEN-DEMO-001..003` → FPS-101; `BEN-DEMO-004..005` → FPS-202.
Keycloak personas: `demo-fps` → FPS-101, `demo-fps-202` → FPS-202.

## epos-auth-mock (Aadhaar-format auth simulation)

- `GET /health`
- `POST /v1/authenticate` (canonical)
- `POST /v1/aadhaar/auth` (demo alias; same handler)
- Auth: `Authorization: Bearer ${PDS_EPOS_AUTH_SERVICE_TOKEN}`
- Env: `PORT` (default 3011), `PDS_EPOS_AUTH_SERVICE_TOKEN`
- Scenario keys: demo `aadhaarRefHash` / `rationCardHash` values
- Reason codes include `AADHAAR_AUTH_SUCCESS`, `AADHAAR_AUTH_FAILED`,
  `AADHAAR_SUSPENDED_REF`, `AADHAAR_DEMOGRAPHIC_MISMATCH`, `SUPERVISOR_EXCEPTION`

API wiring (optional):

- `PDS_EPOS_AUTH_SERVICE_URL`
- `PDS_EPOS_AUTH_SERVICE_TOKEN`
- `PDS_EPOS_AUTH_SERVICE_TIMEOUT_MS`

When unset, FPS auth endpoints keep the previous in-process / client-driven
simulation. When set, the API asks epos-auth-mock for the auth outcome and
persists that result.

## eligibility-mock (ghost / list integrity)

Compose profile `eligibility` (also included in `mocks`).
See `docs/implementation/eligibility-ui-test-guide.md` and
`docs/implementation/mocks-integrity-proof-completeness-plan.md`.

The mock returns a deterministic `integrityScore` (0–100) and
`scoreBreakdown` (ruleId → contribution) over fixture signals. Duplicate
fixtures may share an opaque `linkageDigest` (hash collision narrative — not
“Aadhaar match”). UI and docs must keep `simulationOnly` language.

## Compose profiles

```bash
# Ghost / eligibility screening only
docker compose --profile eligibility up -d --build eligibility-mock

# Aadhaar-format FPS auth mock only
docker compose --profile epos up -d --build epos-auth-mock

# Both mock HTTP services
docker compose --profile mocks up -d --build eligibility-mock epos-auth-mock
```

To point the API at epos-auth-mock in Compose, set:

```bash
PDS_EPOS_AUTH_SERVICE_URL=http://epos-auth-mock:3011
PDS_EPOS_AUTH_SERVICE_TOKEN=<shared-demo-token>
```

## Demo script order

1. Supply chain — custody to FPS (in-app + optional SCM integration fixtures).
2. Card & eligibility — `eligibility-mock` screening / case review.
3. FPS authentication — `epos-auth-mock` Aadhaar-format outcome, then distribution.
4. Trust — dashboard / audit / verify.

## FPS auth success + failure live script

`scripts/live-fps-auth-lifecycle.mjs` (`npm run live:fps-auth`) exercises the
API ↔ epos-auth-mock seam end-to-end:

- mock health + API wiring check (client `SUCCESS` overridden by mock `FAILURE`);
- direct mock reason codes (`AADHAAR_AUTH_SUCCESS`, `AADHAAR_AUTH_FAILED`,
  `AADHAAR_SUSPENDED_REF`, `AADHAAR_DEMOGRAPHIC_MISMATCH`);
- API OTP / biometric success and failure persistence;
- raw Aadhaar rejection and conflicting `authTxnId` reuse;
- distribution blocked after `FAILURE`;
- supervisor-exception auth + distribution with `UNAUTHORIZED_TRANSACTION` alert;
- optional OTP success distribution when FPS-101 Rice stock is available.

```bash
PDS_EPOS_AUTH_SERVICE_TOKEN=local-epos-auth-demo-token \
PDS_EPOS_AUTH_SERVICE_URL=http://epos-auth-mock:3011 \
docker compose --profile epos --profile iam --profile fabric up -d --build epos-auth-mock api

PDS_BENCHMARK_CLIENT_SECRET=... \
PDS_EPOS_AUTH_SERVICE_TOKEN=local-epos-auth-demo-token \
EPOS_AUTH_BASE=http://127.0.0.1:3011 \
npm run live:fps-auth
```

Static gates: `npm run test:fps-auth`.
