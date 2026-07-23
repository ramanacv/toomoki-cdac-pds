# Eligibility Feature Testing Gap Analysis

## Executive finding

The eligibility schema changes were present in commit `2418eaa`, but the
upgrade path for an existing PostgreSQL volume was not exercised. The failure
was therefore not an omitted table definition; it was an omitted deployment
and migration verification step.

The recorded build, typecheck, lint, unit, and in-process HTTP results can still
be valid within their stated scopes. Describing the feature as "thoroughly
tested" without qualifying those scopes is inaccurate because the deployed
API, PostgreSQL, external mock service, and web application were not proven
together on the retained local database.

## What happened

Commit `2418eaa` added the eligibility and beneficiary-registry table
definitions to `infra/postgres/schema.sql`.

The Compose PostgreSQL service mounts that file at:

```text
/docker-entrypoint-initdb.d/01-schema.sql
```

The official PostgreSQL container runs files in that directory only while
initializing an empty data directory. The local `postgres_data` volume already
contained a database, so rebuilding or restarting the container did not apply
the new definitions.

The IAM bootstrap script now applies `infra/postgres/schema.sql` explicitly,
but the eligibility feature's documented local start command only runs:

```sh
docker compose --profile eligibility up -d --build eligibility-mock api web
```

It does not invoke the IAM bootstrap or another schema migration command.
Consequently, the API loaded the new repository against the old database and
failed during module initialization when it queried `eligibility_cases`.

## What the recorded verification actually covered

The feature commit records these results:

- build passed;
- typecheck passed;
- lint passed;
- 345 workspace tests passed;
- 9 demo HTTP tests passed;
- existing containers and Fabric state were inspected read-only.

These checks provide meaningful evidence for compilation, static typing, code
style, isolated behavior, and several HTTP contracts. They do not establish a
successful deployed eligibility workflow.

### Eligibility API HTTP tests

`apps/api/test/e2e/eligibility-api.e2e.spec.ts`:

- sets `PDS_PERSISTENCE_BACKEND=file`;
- replaces the external screening adapter with a test double;
- initializes Nest in process and uses Supertest;
- does not start the Docker API;
- does not connect to PostgreSQL;
- does not call the deployed `eligibility-mock`.

This verifies controllers, authorization, validation, and workflow behavior,
but not the deployed integration.

### PostgreSQL behavior tests

`apps/api/test/eligibility-postgres-atomicity.spec.ts` injects a fake pool and
records SQL calls. It usefully checks intended `BEGIN`, `COMMIT`, `ROLLBACK`,
locking, and statement composition, but PostgreSQL never parses or executes the
SQL.

`apps/api/test/schema.spec.ts` reads `schema.sql` as text and checks for table,
index, constraint, and column strings. Its own header notes that a real
PostgreSQL integration test is a follow-up.

These tests prove that expected SQL text exists and that repository code emits
the intended statements. They do not prove that an existing database has been
migrated or that the resulting schema is executable.

### Web UI tests

`apps/web/test/eligibility-review.test.tsx` mocks every API function used by
the Eligibility review screen. It verifies rendering, state-specific controls,
failure messages, and role restrictions, but not browser-to-API connectivity.

### External mock tests

The eligibility mock tests exercise its deterministic screening engine and HTTP
handler boundary. They do not run the ViksitPDS API, PostgreSQL, or web
application alongside it.

### Read-only container inspection

Inspecting containers that predated the feature could establish the health of
the pre-existing stack and Fabric network. It could not establish that the new
API image starts with the new schema or that the new eligibility workflow
operates end to end.

## Missing acceptance gate

No recorded gate performed all of the following together:

1. retain an already initialized PostgreSQL volume;
2. apply an explicit, rerunnable schema upgrade;
3. start the rebuilt `eligibility-mock`, API, and web services;
4. wait for all service health checks;
5. exercise the browser or live HTTP eligibility workflow;
6. verify eligibility rows and final outbox state in PostgreSQL.

The first live rebuild against the retained database was therefore the first
test capable of exposing this particular failure.

## Assessment of the phrase "thoroughly tested"

A defensible statement would have been:

> Build, typecheck, lint, unit/component tests, mocked in-process HTTP tests,
> and UI tests passed. Deployed PostgreSQL migration, Compose startup, live
> browser flow, and external-service integration were not verified.

An unqualified statement that the whole feature was thoroughly tested
overstates the evidence. Passing many tests is not equivalent to covering all
important system boundaries; the missing deployment test was a release-blocking
gap.

## Recommended corrective actions

1. Introduce an explicit, versioned migration command rather than relying on
   `/docker-entrypoint-initdb.d` for upgrades.
2. Make API startup fail with a concise schema-version diagnostic, not a raw
   missing-relation failure during repository hydration.
3. Add a PostgreSQL integration test that applies the schema to both:
   - an empty database;
   - a database initialized from the previous revision.
4. Add a Compose eligibility smoke test that requires the mock, API, and web
   health checks to pass.
5. Add a live HTTP test using PostgreSQL and the actual eligibility mock rather
   than the file backend and a stub adapter.
6. Add a browser smoke test for Control Office screening and a read-only
   Management/Auditor view.
7. Require verification reports to distinguish:
   - unit/component verification;
   - in-process HTTP verification;
   - real PostgreSQL verification;
   - deployed Compose verification;
   - browser verification;
   - live Fabric proof completion.

## Implemented immediate correction

The local Compose stack now includes a one-shot `schema-migrate` service. It:

- waits for PostgreSQL health;
- runs the rerunnable `infra/postgres/schema.sql` with `ON_ERROR_STOP`;
- wraps the schema application in one transaction;
- is a required successful dependency of the API.

This closes the retained-volume startup failure for the controlled local demo
and prevents the API from starting after a failed or partial schema
application. A versioned migration framework and upgrade-from-previous-version
integration test remain the stronger long-term solution.

## Pre-fix evidence

On 2026-07-23 at approximately 19:17 IST:

- branch: `feature/ghost-beneficiary-eligibility`;
- `eligibility-mock`: healthy, HTTP 200 on port 3010;
- API: exited with code 1;
- API error: PostgreSQL `42P01`, missing `eligibility_cases`;
- web: created but not started because API health never succeeded;
- ports 3000 and 4173: not reachable;
- read-only catalog lookup: expected new tables were absent.

## Post-fix verification

On 2026-07-23 at approximately 19:24 IST:

- the new `schema-migrate` service applied the schema transactionally and
  exited with code 0;
- the same migration ran a second time during normal Compose startup and again
  exited with code 0, demonstrating rerunnable behavior on the retained volume;
- all five eligibility and beneficiary-registry tables were present;
- API health returned HTTP 200 on port 3000;
- eligibility-mock health returned HTTP 200 on port 3010;
- the `/eligibility` web route returned HTTP 200 on port 4173;
- the API container reached the mock service over the Compose network;
- 36 focused API schema, repository, client, and service tests passed;
- 18 focused web eligibility and application-shell tests passed;
- all 12 eligibility-mock tests passed;
- `docker compose config --quiet` and `git diff --check` passed.

No database reset, truncation, or reseed was performed.
