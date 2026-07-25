# J&K/Maharashtra ePoS–SMART-PDS implementation plan

Last updated: 2026-07-23

ViksitPDS complements SMART-PDS/RCMS, IAeSCM or another state supply-chain system, and AePDS/ePoS. It does not replace those authoritative systems and is not production-ready. This plan is derived from the [J&K and Maharashtra reference analysis](../product/jkmaha-epos-smartpds-reference.md).

Two outcomes are gated independently:

1. A controlled PoC that binds `demo-fps` to `FPS-101`, demonstrates two-shop isolation, labels all local state-system actions as simulations, and shows source provenance separately from Fabric proof state.
2. A Maharashtra-first non-production pilot path using department/NIC-approved contracts, durable database authorization, transactional commands, reconciliation, recovery, and operational monitoring.

The shared row-scoped persistence and outbox work is tracked in [Near-MVP hardening](mvp-hardening-plan.md). No pilot-ready claim is permitted until its transactional-command gate and the external gates below are complete.

## Status and gates

| Phase | Current repository status | Acceptance gate |
|---|---|---|
| 1. Controlled PoC correction | Implemented; automated unit/UI/IAM coverage required on every release | Assigned-shop API isolation, visible simulation language and provenance, two-FPS fixtures, separate operational/proof status |
| 2. Canonical source-event foundation | Implemented for canonical envelopes, privacy validation, replay, quarantine/recovery, PostgreSQL/file demo storage, proof intent, and fixture adapters | Contract/schema tests, recursive privacy tests, identical/conflicting replay tests, missing-parent recovery |
| 3. Pilot-safe persistence and authorization | Database-backed role, FPS, source-contract, and credential checks are implemented; source ingestion atomically stores the event, ledger event, and proof intent. The broader row-scoped command migration remains incomplete | Ingestion, receipt, and distribution must all pass PostgreSQL concurrency and rollback/crash tests before pilot traffic |
| 4. Maharashtra non-production adapter and reconciliation | Endpoint families and provisional fixture contracts implemented; approved mappings and full reconciliation are blocked externally | Maharashtra/NIC-approved fixtures, exception mappings, recovery exercises, per-source operations, privacy/security approval |
| 5. J&K adapter configuration | Deferred behind the canonical Maharashtra path | J&K-approved mappings and contract fixtures using the same state-neutral model |

The current file-backed demo remains single-process. PostgreSQL command paths use row locks and commit business state, events, and proof intent together where implemented, but this does not establish multi-replica or crash-safe production readiness.

## Phase 1 — controlled PoC correction

### Entry journeys and product boundary

- Present Department, Supply-chain Operations, Fair Price Shop Demo, Audit/Management, and Platform Administration entry journeys.
- State that authentication, allocation, movement, and distribution buttons simulate events from authoritative state systems.
- Describe ViksitPDS as a cross-system reconciliation and immutable-proof layer.
- Never describe the fixture adapters as real integrations.

### FPS authorization boundary

- Provision `demo-fps` with `pds_stakeholder_id=FPS-101` and organization `FPS-101`.
- For every FPS operation, require an authenticated `fps` role and validate that its assigned stakeholder exists, is active, and is a `FAIR_PRICE_SHOP`.
- Derive `fpsId` and a privacy-safe opaque operator reference from the verified identity.
- Keep compatibility `fpsId` and `dealerId` inputs optional. Return `403` for a supplied mismatch. Browser requests omit both.
- Filter allocation, receipt, stock, authentication, distribution, dashboard, and distribution-trace access to the assignment.
- Return `404` for another shop’s individual resource to avoid disclosure.
- Keep Department, management, and auditor access explicitly broader and read-only where applicable. `platform-admin` has no operational role.

### FPS workspace

Show the assigned shop, simulated device-mapping status, allocations, stock, pending receipts, recent simulated distributions, reconciliation exceptions, source status, Fabric proof status, and Fabric transaction reference. Do not display Aadhaar, biometric, OTP, mobile, full ration-card, unmasked person/address, or device-credential data.

### PoC acceptance

- `FPS-101` and `FPS-202` fixtures prove list and individual-resource isolation.
- Missing, non-FPS, inactive, and mismatched assignments are rejected.
- The web application cannot submit caller-controlled shop/operator identity.
- Reset/reseed remains mandatory before a controlled demonstration.
- Operational completion and proof completion are reported separately.

## Phase 2 — canonical source-event foundation

### Contracts

Shared contracts include:

- `SourceEventEnvelope<T>`
- `SourceProvenance`
- `SourceSystem`
- `CanonicalSourceEventType`
- `SourceEventStatus`

Provenance records the source system and event ID, contract version, occurrence and ingestion time, canonical approved-payload hash, operation ID, and operational status. Allocation, movement, authentication, distribution, and entitlement response models accept optional provenance without exposing raw source payloads.

### Ingestion semantics

- Canonicalize and hash only the approved payload.
- Recursively reject prohibited fields before persistence, logging, dead-letter handling, or proof construction.
- Uniquely key events by `(source_system, source_event_id)`.
- Return the original operation for an identical replay.
- Return `409` and create privacy-safe audit evidence for conflicting content.
- Persist valid events with missing parents as `QUARANTINED`; correlate them after the parent arrives.
- Link amendments and reversals rather than overwriting history.
- Store occurrence, optional device-sync, ingestion, and processing times separately.

### Fixture adapters

`mock/integrations/maharashtra-sandbox-events.json` represents provisional SMART-PDS/RCMS, state-SCM, and AePDS/ePoS events. `npm run fixtures:integrations` submits them through the authenticated endpoints. They are test fixtures, not evidence of a state integration.

## Phase 3 — pilot-safe persistence and IAM

The schema provides durable subject, role, organization/geography/stakeholder/FPS/facility, source-contract, and credential assignments. Before pilot traffic:

- make those tables—not token claims—the runtime authorization authority;
- restrict `integration-service` accounts by active credential, source system, endpoint family, and event type;
- commit accepted source event, normalized mutation, reconciliation/domain event, and Fabric outbox record on one PostgreSQL client and transaction;
- use row locks, conditional balance updates, unique idempotency constraints, and optimistic versions;
- complete simultaneous ingestion, FPS receipt, distribution, and outbox-worker tests;
- complete rollback/crash tests proving no committed business mutation loses proof intent.

Fabric remains asynchronous. Proof delay or retryable failure must never roll back a valid operational event.

## Phase 4 — Maharashtra non-production adapter and reconciliation

The provisional endpoint surface is:

- `POST /integrations/smartpds/v1/master-references`
- `POST /integrations/scm/v1/allocation-events`
- `POST /integrations/scm/v1/movement-events`
- `POST /integrations/epos/v1/distribution-events`
- `GET /integrations/events/{sourceSystem}/{sourceEventId}/trace`

Responses are `201` for new acceptance, `200` for identical replay, `202` for durable quarantine, `409` for conflicting replay, and validation errors for malformed or prohibited content.

Maharashtra identifiers, commodity codes, portability flags, and exception meanings belong in adapter configuration. The normalized domain remains state-neutral.

Reconciliation must cover:

- allocation versus dispatch and remaining stock;
- movement versus receipt or explicit quantity adjustment;
- FPS opening stock plus receipts minus distributions/adjustments versus closing stock;
- late/out-of-order events and missing-parent recovery;
- linked amendments and reversals.

Alerts never change quantity. Shortage, damage, rejection, transit loss, and process loss require explicit adjustments.

Operational monitoring must expose per-source last success, accepted/duplicate/conflicted/rejected/quarantined counts, reconciliation lag, unresolved-parent age, schema-version drift, privacy-safe dead letters, authorized replay, and source-to-operation-to-Fabric tracing.

## Test and release gates

Every behavioral change updates tests. The maintained checks are:

```sh
npm run build
npm run typecheck
npm run lint
npm test
npm run test:demo-http
npm run test:iam
npm run test:lifecycle
```

IAM checks validate realm JSON, shop claims, integration-service roles/claims, and bootstrap idempotency. Lifecycle checks validate assigned-shop receipt/auth/distribution behavior and report all outbox states.

Before a controlled demonstration, an explicitly authorized reset/reseed lifecycle must end with every outbox row `COMMITTED`. Before any pilot release, also require:

- Maharashtra department/NIC-approved contracts and fixtures;
- privacy and security review;
- backup/restore and recovery exercises;
- concurrency and crash-atomicity evidence;
- a two-peer Fabric regression using Food and Godown peers;
- no unresolved critical/high gate in [Near-MVP hardening](mvp-hardening-plan.md).

## Assumptions

- Maharashtra is the first external non-production target.
- J&K later uses the same canonical model through separate configuration and mappings.
- Public evidence does not establish private API fields, approvals, or full role matrices; provisional mappings must not be presented as approved contracts.
- SMART-PDS/RCMS, IAeSCM/state SCM, and AePDS/ePoS remain authoritative for their workflows.
