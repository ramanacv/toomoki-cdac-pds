# Mock Data and Fixtures

PDS-Chain keeps all canonical mock and seed data in the repository `mock/` folder. Application code loads this data through the `@pds/fixtures` package instead of embedding records in source files.

This separation makes it straightforward to:

- Edit demo data without touching business logic.
- Keep API, chaincode, PostgreSQL, and web fallbacks aligned.
- Switch the web UI between live API data and fixtures.

## Layout

```text
mock/
  entities/          Domain records for workspace/demo display (JSON)
  seed/              Minimal backend bootstrap payload
  scenarios/         Per-scenario dashboard and alert overrides
  workspace/         Dashboard summary aggregates
  README.md          Quick reference for developers

packages/fixtures/   Typed loader (@pds/fixtures)
```

### `mock/entities/`

Workspace entity files used by the web UI when running in mock or auto-fallback mode:

| File | Contents |
|------|----------|
| `stakeholders.json` | Seven demo stakeholders (procurement through auditor) |
| `lots.json` | Commodity lots at various custody stages |
| `transfers.json` | Transfer orders |
| `allocations.json` | FPS allocations |
| `distributions.json` | Distribution receipts |
| `auth-transactions.json` | Simulated authentication records |
| `entitlements.json` | Monthly entitlement balances |

### `mock/seed/backend.json`

Minimal bootstrap payload shared by:

- Chaincode/API `seedDemoData()` (via `@pds/fixtures`)
- PostgreSQL `infra/postgres/seed.sql` (generated)

Contains:

- `initialLot` — starting rice lot at procurement
- `initialEntitlement` — unrationed monthly balance for the demo ration card
- `rationCard` and `beneficiaryRegistry` — off-chain mock registry rows

Stakeholders for backend seed come from `mock/entities/stakeholders.json`.

### `mock/scenarios/`

Scenario fixtures for the demo UI:

| Scenario | File | Purpose |
|----------|------|---------|
| Happy path | `happy-path.json` | Baseline alerts and copy |
| Short receipt | `short-receipt.json` | Shortage alert and dashboard overrides |
| Duplicate claim | `duplicate-claim.json` | Duplicate-claim alert and dashboard overrides |

### `mock/workspace/`

- `dashboard-summary.json` — default dashboard KPIs for mock workspace mode

## `@pds/fixtures` package

Location: `packages/fixtures`

Exports typed accessors such as:

- `stakeholders`, `lots`, `transfers`, … — entity arrays from `mock/entities/`
- `backendSeed` — backend bootstrap payload
- `getWorkspaceSnapshot(scenario)` — full web workspace bundle
- `getScenarioAlerts(scenario)` — scenario-specific audit alerts
- `getScenarioDashboardSummary(scenario)` — scenario dashboard overrides

Consumers:

| Component | Usage |
|-----------|-------|
| `blockchain/chaincode/pds-chaincode` | `seedDemoData()` loads stakeholders and backend seed |
| `apps/web` | Mock/auto data via `api.ts` and re-exports in `demo-model.ts` |
| `apps/web` tests | Fixture-backed demo model assertions |

UI-only configuration (role profiles, screen labels, workflow step copy) remains in `apps/web/src/demo-model.ts` and is intentionally **not** part of `mock/`.

## PostgreSQL seed generation

`infra/postgres/seed.sql` is generated from mock seed data. Do not edit it by hand.

```bash
npm run fixtures:sql
```

Run this after changing `mock/seed/backend.json` or `mock/entities/stakeholders.json`.

## Web data source modes

The web app reads `VITE_DATA_SOURCE` from the environment (see `.env.example`).

| Value | Behavior |
|-------|----------|
| `api` | Fetch workspace data only from the REST API. No fixture fallback. |
| `mock` | Use `@pds/fixtures` only. No API reads for workspace data. |
| `auto` | Use the API when `/health` succeeds; otherwise use fixtures. **Default.** |

Implementation: `apps/web/src/data-source.ts` and `apps/web/src/api.ts`.

Workflow **writes** (dispatch, distribute, authenticate) always go to the API when invoked from the workflow panel, regardless of read mode.

## Backend seed commands

| Command | Purpose |
|---------|---------|
| `npm run seed` | Reset `tmp/` and seed file-based API state |
| `npm run fabric:bootstrap` | Initialize chaincode runtime world state file |
| `npm run fixtures:sql` | Regenerate PostgreSQL seed SQL |
| `npm run demo:happy` | Run API happy-path demo script |
| `npm run demo:exception` | Run API exception-path demo script |

## Editing mock data safely

1. Change JSON under `mock/`.
2. Run `npm run fixtures:sql` if backend seed inputs changed.
3. Run `npm test` to verify fixtures, API, and web tests.
4. Restart API/containers if PostgreSQL seed should reload (requires fresh DB volume or `docker compose down -v`).

When seeding the ledger engine, objects from fixtures are cloned before mutation so repeated demo runs do not corrupt shared JSON module state.

## Switching to live integrations

Mock data is for MVP demos only. Production or pilot integrations should:

1. Set `VITE_DATA_SOURCE=api` for the web UI.
2. Replace mock auth endpoints with approved identity adapters.
3. Feed operational data through integration adapters instead of `mock/entities/`.
4. Keep beneficiary PII off-chain per the core privacy rule in [docs/README.md](../README.md).
