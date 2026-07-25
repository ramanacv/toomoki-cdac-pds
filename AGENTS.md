# AGENTS.md

This file defines repository-wide guidance for coding agents and automated contributors. More specific `AGENTS.md` files, if added below a subdirectory, override this file for that subtree.

## Project purpose

ViksitPDS is a demonstration and near-MVP trust layer for India's Public Distribution System. It combines a NestJS operational API, PostgreSQL, a React UI, and a two-organization Hyperledger Fabric network.

The system complements SMART-PDS, state PDS, ePoS, procurement, logistics, and authentication systems. Do not describe it as replacing those systems or as production-ready.

## Repository map

- `apps/api`: NestJS REST API and persistence/Fabric adapters.
- `apps/web`: React 19 and Vite dashboard.
- `packages/shared-types`: shared domain types, enums, constants, and API contracts.
- `packages/fixtures`: typed access to canonical demo fixtures.
- `blockchain/chaincode/pds-chaincode`: TypeScript Fabric contracts and the legacy in-memory domain engine.
- `blockchain/fabric-network`: two-organization local Fabric network, crypto/config generation, and deployment scripts.
- `infra/postgres`: PostgreSQL schema and generated seed data.
- `mock`: canonical demo records and scenarios.
- `scripts`: reset, seed, smoke, regression, and live lifecycle tooling.
- `docs/implementation`: maintained implementation status and deferred work.
- `docs/product`: product behavior and demo assumptions.

## Architectural rules

1. PostgreSQL is authoritative for operational workflow state.
2. Fabric stores immutable, non-sensitive proofs asynchronously. It must not re-execute API business commands.
3. `RecordLedgerProof` is the API's Fabric submission boundary. Named chaincode business transactions are compatibility functions, not new API integration points.
4. Fabric proof delay or failure must not roll back a valid PostgreSQL operation; it must remain visible and retryable.
5. Every proof must carry traceable `eventId`, `operationId`, actor, application role, submitting organization, payload hash, schema version, entity identifiers, and API-generated business timestamp.
6. Chaincode writes must be deterministic. Derive transaction IDs and execution timestamps from `ctx.stub.getTxID()` and `ctx.stub.getTxTimestamp()`. Do not use `randomUUID()`, `Date.now()`, `new Date()` as an execution clock, random values, process state, network calls, or filesystem state in endorsed logic.
7. Identical proof replay must succeed; conflicting content for an existing `eventId` must fail.
8. Any Fabric endorsement policy or discovery change must be tested against both Food and Godown peers.

## Privacy and security

Never put raw beneficiary identity or authentication material into Fabric proofs, logs, fixtures intended for proofs, or error messages. Prohibited data includes:

- Aadhaar numbers or images.
- Biometrics.
- OTP values.
- Mobile or phone numbers.
- Full ration-card numbers/values.
- Unmasked beneficiary names or addresses.

Use approved hashes and opaque references such as `rationCardHash`, `beneficiaryRefHash`, and transaction-reference hashes. Preserve the recursive proof-payload privacy validation in `apps/api/src/modules/fabric/ledger-proof.ts` and chaincode.

Do not commit `.env`, private keys, generated secrets, local evidence, database dumps, or journal output.

## Current persistence limitation

The PostgreSQL runtime still uses the in-memory engine and serialized full-state snapshot persistence. Operational snapshot saving and outbox insertion are separate operations. Therefore:

- Treat this as controlled-demo behavior, not crash-safe or multi-replica persistence.
- Run exactly one API replica for the demo.
- Do not claim concurrent mutation safety.
- Reset and deterministically reseed before demonstrations.
- Verify that all outbox rows commit after a lifecycle run.
- Do not mark transactional-command hardening complete until row-scoped command services commit business changes, workflow history, events, and the outbox record on one PostgreSQL client inside one `BEGIN`/`COMMIT` transaction.

When implementing the replacement, keep controllers thin. Put transaction orchestration in command services and SQL access in repositories. Use `SELECT ... FOR UPDATE`, conditional balance updates, unique idempotency keys, and optimistic `version` checks where appropriate. Runtime `TRUNCATE` is forbidden outside explicit reset/import/test tooling.

See:

- `docs/product/assumptions-for-demo.md`
- `docs/implementation/mvp-hardening-plan.md`
- `docs/implementation/production-readiness-todos.md`

## Outbox worker

The current Fabric proof worker is a PostgreSQL outbox poller, not BullMQ. It is embedded in the API for the controlled demo and uses `FOR UPDATE SKIP LOCKED`, bounded exponential retry, real Fabric transaction IDs, and terminal dead-letter handling.

Preserve these state meanings:

- `PENDING`: ready or scheduled for submission.
- `SUBMITTING`: claimed by one worker.
- `COMMITTED`: confirmed by Fabric, with `fabric_tx_id` recorded.
- `FAILED`: retryable failure with `next_attempt_at` and error details.
- `DEAD_LETTER`: retry limit exhausted; requires an explicit manual retry.

Do not acknowledge a proof as committed before Fabric commit status succeeds. A future standalone worker should continue using PostgreSQL as the durable queue unless a documented architecture decision replaces it.

## Domain invariants

- Quantities are positive integer kilograms for this cycle. Reject fractional, zero where a movement is required, and negative quantities.
- A movement may not exceed the locked source lot's remaining quantity.
- Partial movements create child lots with explicit `rootLotId` and `parentLotId` lineage.
- Shortage, damage, rejection, transit loss, and process loss require explicit quantity adjustments. Alerts alone must not remove quantity.
- Repeated commands and transitions must be idempotent. Conflicting reuse of an idempotency key must return a conflict.
- Stock and entitlement balances must never be double-spent under concurrent commands.
- Preserve the root-lot conservation equation documented in the hardening plan.

## Development commands

Run commands from the repository root. Use Node.js 22 and `npm ci` for a clean dependency install.

Primary release checks:

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run test:demo-http
```

Useful focused checks:

```sh
npm run test --workspace=@pds/api
npm run test --workspace=@pds/web
npm run test --workspace=@pds/pds-chaincode
npm run test --workspace=@pds/shared-types
```

Fabric integration is opt-in and requires the local network:

```sh
PDS_E2E_FABRIC=true npm run regression:fabric
```

The full reset lifecycle is:

```sh
PDS_DEV_AUTH_TOKEN=dev-mvp-token \
PDS_ADMIN_TOKEN=admin-mvp-token \
node scripts/live-lifecycle.mjs
```

It mutates local demo data. Do not run it unless reset/reseed was requested or clearly authorized.

## Local Fabric operations

The maintained local network currently uses explicit `hyperledger/fabric-*:2.5.15` images, two peers, CouchDB, and channel `pdschannel`.

Full development reset/bootstrap is destructive to in-container Fabric ledger state:

```sh
blockchain/fabric-network/scripts/bootstrap-fabric-full.sh
```

Never run it as an ordinary test or without explicit authorization to reset the local Fabric network.

For chaincode upgrades:

- Never reuse an already committed sequence for changed code.
- Package and install the identical artifact on both peers.
- Approve with both organizations.
- Check commit readiness before commit.
- Verify the committed definition and run a two-peer regression afterward.
- Use the exact deployed MSP ID `GodownWarehouseMSP`, not `GodownMSP`.
- Preserve gossip external endpoints and cross-peer bootstrap settings; the Food gateway must be able to discover a Godown endorser.

Example development upgrade after sequence 1:

```sh
CC_VERSION=1.1 \
CC_SEQUENCE=2 \
CC_SIGNATURE_POLICY="AND('FoodAndCivilSuppliesMSP.peer','GodownWarehouseMSP.peer')" \
blockchain/fabric-network/scripts/deploy-chaincode.sh
```

Choose a new version and sequence based on the currently committed definition; do not copy these numbers blindly.

## Database changes

- Make schema changes additive and rerunnable with `IF NOT EXISTS` where PostgreSQL supports it.
- Do not edit `infra/postgres/seed.sql` manually when it is generated from fixtures; update canonical mock data and run `npm run fixtures:sql`.
- Use explicit constraints, foreign keys, unique idempotency keys, and indexes matching query/lock patterns.
- Schema presence is not implementation completion. Add repository/service behavior and concurrency tests for new tables or columns.
- Do not truncate or rewrite local/pilot data unless the user explicitly requests a reset.

## Testing expectations

Add or update tests with every behavioral change. In particular:

- Chaincode tests must stub composite-key iteration, transaction IDs, and transaction timestamps.
- Determinism tests should exercise both peers where possible.
- Proof tests must cover identical replay, conflicting replay, invalid hashes, and nested sensitive fields.
- Persistence tests must use temporary paths and must not mutate tracked `journal.ndjson` files.
- Concurrency-sensitive commands require simultaneous request/worker tests, not only sequential unit tests.
- Live tests must report outbox state. A successful operational lifecycle is not a full success while proofs remain pending or failed.

If the execution environment forbids loopback listeners, report HTTP E2E tests as environment-blocked; do not misrepresent them as application failures or successes.

## Code style and change discipline

- TypeScript is ESM; preserve `.js` suffixes in relative TypeScript imports where the project already uses them.
- Avoid `any`; prefer explicit domain types, `unknown`, and validation at boundaries.
- Keep controllers thin and domain behavior out of React components.
- Put shared public contracts in `@pds/shared-types`.
- Keep infrastructure dependencies out of domain modules where practical.
- Preserve existing user changes in a dirty worktree. Do not reset, discard, or commit unrelated files.
- Do not commit generated journals, `/tmp` evidence, `.env`, Fabric crypto, channel artifacts, chaincode packages, or unrelated analysis documents.
- Update maintained documentation when behavior, acceptance status, demo assumptions, or deferred production work changes.

## Analysis and research artifacts

When the user asks for analysis, research, a gap assessment, an audit, a review, a comparison, or similar investigative work, always write the substantive findings to a Markdown document under `docs/` in addition to summarizing the outcome in the response.

- Choose the most relevant existing `docs/` subdirectory; use `docs/implementation/` when no more specific location applies.
- Use a descriptive, kebab-case filename and include the analysis scope, evidence, findings, risks or gaps, and recommended next actions.
- Update an existing maintained document instead of creating a duplicate when it already covers the requested subject.
- Keep temporary evidence and generated raw output out of `docs/`; include only curated findings suitable for the repository.
- Do not skip the document merely because the user requested only an explanation or report. Skip it only when the user explicitly says not to create or modify files.

## Completion and reporting

Lead with verified outcomes. State which commands ran and distinguish:

- unit/build verification;
- HTTP/demo verification;
- live Fabric verification;
- operational completion versus proof completion.

Do not call the near-MVP complete while a critical/high gate in `docs/implementation/mvp-hardening-plan.md` remains incomplete. Do not describe a single-replica lifecycle pass as evidence of crash atomicity, concurrent command safety, or production readiness.
