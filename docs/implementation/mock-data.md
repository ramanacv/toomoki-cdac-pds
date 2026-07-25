# Mock Data and Fixtures

ViksitPDS keeps all canonical mock and seed data in the repository `mock/` folder. Application code loads this data through the `@pds/fixtures` package instead of embedding records in source files.

This separation makes it straightforward to:

- Edit demo data without touching business logic.
- Keep API, chaincode, PostgreSQL, and web fallbacks aligned.
- Switch the web UI between live API data and fixtures.

## Layout

```text
mock/
  entities/          Domain records for workspace/demo display (JSON)
  integrations/      Simulated canonical state-system source events
  seed/              Minimal backend bootstrap payload
  scenarios/         Per-scenario dashboard and alert overrides
  workspace/         Dashboard summary aggregates
  README.md          Quick reference for developers

packages/fixtures/   Typed loader (@pds/fixtures)
```

### `mock/entities/`

Workspace entity files used by the web UI in explicit mock mode:

| File | Contents |
|------|----------|
| `stakeholders.json` | Seven demo stakeholders (procurement through auditor) |
| `lots.json` | Commodity lots at various custody stages |
| `transfers.json` | Transfer orders |
| `allocations.json` | FPS allocations |
| `distributions.json` | Distribution receipts |
| `auth-transactions.json` | Simulated authentication records |
| `entitlements.json` | Monthly entitlement balances |

The entity set includes `FPS-101` and `FPS-202`. The second shop exists to make
FPS authorization isolation testable rather than assumed.

### `mock/integrations/`

Privacy-approved fixture envelopes simulate:

- SMART-PDS/RCMS master-reference events;
- state-SCM allocation and movement events;
- AePDS/ePoS distribution events.

They enter through the authenticated integration API and exercise canonical
hashing, provenance, replay/conflict handling, missing-parent quarantine,
reconciliation, and source-to-proof trace. They are not live government data,
approved Maharashtra mappings, or an external integration.

### `mock/seed/backend.json`

Minimal bootstrap payload shared by:

- Chaincode/API `seedDemoData()` (via `@pds/fixtures`)
- PostgreSQL `infra/postgres/seed.sql` (generated)

Contains:

- `initialLots` — starting procurement lots for Rice, Wheat, Dal, Sugar, Cooking Oil, and Kerosene
- `initialEntitlements` — monthly demo ration-card balances for all supported commodities
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
| `apps/web` | Explicit mock data via `api.ts` and re-exports in `demo-model.ts` |
| `apps/web` tests | Fixture-backed demo model assertions |
| integration seed script | Posts `mock/integrations/` through the canonical API seam |

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
Implementation: `apps/web/src/data-source.ts` and `apps/web/src/api.ts`.

Workflow **writes** (dispatch, distribute, authenticate) always go to the API when invoked from the workflow panel, regardless of read mode.

## Backend seed commands

| Command | Purpose |
|---------|---------|
| `npm run seed` | Reset `tmp/` and seed file-based API state |
| `npm run fabric:bootstrap` | Initialize chaincode runtime world state file |
| `npm run fixtures:sql` | Regenerate PostgreSQL seed SQL |
| `npm run fixtures:integrations` | Ingest simulated state-system events through the integration API |
| `npm run demo:happy` | Run API happy-path demo script |
| `npm run demo:exception` | Run API exception-path demo script |

## Editing mock data safely

1. Change JSON under `mock/`.
2. Run `npm run fixtures:sql` if backend seed inputs changed.
3. Run `npm test` to verify fixtures, API, and web tests.
4. Restart or explicitly reset/reseed local data only when that destructive
   lifecycle is authorized. Do not remove a PostgreSQL volume as an ordinary
   fixture-editing step.

When seeding the ledger engine, objects from fixtures are cloned before mutation so repeated demo runs do not corrupt shared JSON module state.

## Switching to live integrations

Mock data is for MVP demos only. Production or pilot integrations should:

1. Set `VITE_DATA_SOURCE=api` for the web UI.
2. Keep browser mock-auth endpoints visibly PoC-only and ingest authoritative
   pilot events from the approved AePDS/ePoS adapter.
3. Feed operational data through integration adapters instead of `mock/entities/`.
4. Keep beneficiary PII off-chain per the core privacy rule in [docs/README.md](../README.md).
