# Near-MVP hardening implementation tracker

Last updated: 2026-07-11

PostgreSQL is authoritative for operational state. Fabric receives immutable `LedgerProof` records asynchronously and never decides whether an operational command is valid.

## Status and gates

| Phase | Status | Acceptance gate | Dependencies / remaining blockers |
|---|---|---|---|
| 0. Baseline | In progress | Build, typecheck, lint, unit and demo HTTP tests green; live Fabric opt-in | HTTP tests require a host that permits loopback listeners. Remove tracked journal mutation. |
| 1. Proof boundary | In progress | Canonical proofs, duplicate safety, two-peer deterministic endorsement, end-to-end IDs | Schema, canonical hash, privacy validation, committed tx ID and idempotent chaincode are implemented. Live two-peer validation remains. |
| 2. Transactional commands | Blocked for release | Row-scoped commands and business event/outbox insert share one DB transaction; independent worker; concurrency/crash tests | Current snapshot engine and full-state writes must be replaced. Initial worker claim/retry/dead-letter schema is present but the poller is still embedded. |
| 3. Child-lot conservation | Blocked for release | All movement/receipt/transformation scenarios reconcile | Shared types and tables are present. Command implementation, projections, reset seed, and reconciliation service remain. |
| 4. Versioned workflow | Blocked for release | Durable role-controlled idempotent transitions | Shared types and tables are present. Templates, guards, services and controller routing remain. |
| 5. API/UI/operations | Blocked for release | Proof lag/failure visible; exception path and rebuild verified | Add mutation envelope/header handling, status/retry APIs, UI, metrics and deployment checks. |

## Dependency order

1. Finish Phase 0 without discarding the existing `feature/fabric-hardening` edits.
2. Complete live Phase 1 validation before removing compatibility transactions.
3. Build a PostgreSQL unit-of-work and row repositories; then move one mutation vertical at a time.
4. Implement movement/lineage commands before workflow guards depend on quantity availability.
5. Add API envelopes and UI after operation/proof query models stabilize.

## Release policy

Critical and high findings are release blockers. A phase marked “in progress” or “blocked for release” is not near-MVP complete. Medium production concerns may be deferred only when recorded in `production-readiness-todos.md` with rationale.

## Verification commands

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run test:demo-http
PDS_E2E_FABRIC=true npm run regression:fabric
```
