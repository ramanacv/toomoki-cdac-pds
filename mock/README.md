# ViksitPDS Mock Data

Canonical mock and seed data for local development, demos, and tests.

Full documentation: [docs/implementation/mock-data.md](../docs/implementation/mock-data.md)

## Layout

```text
mock/
  entities/          Domain records used by the web workspace fallback
  integrations/      Simulated SMART-PDS/RCMS, SCM, and AePDS/ePoS events
  seed/              Minimal backend bootstrap (API, chaincode, PostgreSQL)
  workspace/         Dashboard aggregates for mock UI mode
  scenarios/         Per-scenario alert and summary overrides
```

## Consumption

| Consumer | Source |
|----------|--------|
| Web UI (`VITE_DATA_SOURCE=mock`) | `entities/`, `workspace/`, `scenarios/` via `@pds/fixtures` |
| API / chaincode seed | `entities/stakeholders.json` + `seed/backend.json` via `@pds/fixtures` |
| PostgreSQL | `infra/postgres/seed.sql` generated from `seed/backend.json` |
| Integration API | `integrations/` posted by `npm run fixtures:integrations` |

Regenerate SQL after changing backend seed:

```bash
npm run fixtures:sql
```

## Switching to live data

Set `VITE_DATA_SOURCE=api` in the web app to fetch only from the REST API.

| Value | Behavior |
|-------|----------|
| `api` | Live API only; errors surface if the API is down |
| `mock` | Fixtures only; no API calls for reads |

There is no automatic fallback in the maintained UI. Integration fixtures are
simulations of approved contract seams, not live state-system data.
