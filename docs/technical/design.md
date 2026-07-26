# Technical Design: ViksitPDS

## Design Status

This document describes the implemented controlled-PoC design and clearly marks
the pilot target. The application is a complementary trust layer, not a
replacement for SMART-PDS/RCMS, IAeSCM/state-SCM, or AePDS/ePoS.

The repository-wide operational runtime still uses an in-memory engine with
serialized PostgreSQL snapshots. Snapshot saving and proof-outbox insertion are
separate operations. The row-scoped transactional design below is therefore a
mandatory pilot target, not a completed capability.

## Shared Domain Contracts

Public contracts live in `@pds/shared-types`.

Operational entities include:

- `Stakeholder`, `CommodityLot`, `StockPosition`, `TransferOrder`, and
  `FPSAllocation`;
- mock beneficiary and ration-card references, `MonthlyEntitlement`, and
  `AuthTransaction`;
- `DistributionTransaction`, `AuditAlert`, and proof-status views.

`AuthTransaction` carries `fpsId` and an opaque, server-derived operator
reference. Allocation, movement, authentication, distribution, entitlement
reference, and FPS master response models may carry optional
`SourceProvenance`. Existing non-integrated fixtures remain compatible.

Canonical integration contracts include:

- `SourceEventEnvelope<T>`;
- `SourceProvenance`;
- source system, canonical event type, and source-event processing status;
- source, event, entity, operation, amendment, reversal, and parent references;
- occurrence, device-sync where applicable, ingestion, and processing times.

Provenance exposes only the approved-payload hash and metadata, never the raw
source payload.

## Fixture And Seed Design

Canonical demo data is under `mock/` and loaded through `@pds/fixtures`.

| Location | Responsibility |
|---|---|
| `mock/entities/` | Workspace records, including two FPS identities for isolation |
| `mock/integrations/` | Simulated SMART-PDS/RCMS, SCM, and AePDS/ePoS events |
| `mock/seed/backend.json` | Backend bootstrap records |
| `mock/scenarios/` | Demonstration exceptions and dashboard overrides |
| `packages/fixtures/` | Typed consumers of the canonical JSON |

`npm run fixtures:sql` regenerates `infra/postgres/seed.sql`.
`npm run fixtures:integrations` posts the simulated source events through the
same normalization boundary used by server-to-server integration clients.

Fixtures are demonstrations of a contract seam, not real state-system data or
evidence of an approved integration.

## API Modules

The NestJS API under `apps/api/src/modules/` keeps controllers thin.

| Area | Responsibility |
|---|---|
| `auth` | OIDC/JWT subject parsing and visibly simulated FPS authentication |
| `authorization` | Durable role, organization, geography, stakeholder, FPS/facility, and integration-source assignments |
| Domain modules | Lots, transfers, allocations, stock, entitlements, distributions, trace, audit, and dashboards |
| `integrations` | Validation, canonical hashing, replay, quarantine, correlation, reconciliation, source health, and trace |
| `persistence` | Snapshot persistence today; repositories/atomic command boundary for the pilot target |
| `proofs` and `outbox` | Proof status and asynchronous Fabric submission |
| `fabric` | Privacy-approved proof construction and Fabric Gateway adapter |
| `admin` | Administrative functions without implied operational authority |

Token claims identify the subject but do not replace active database
authorization checks.

## Entry And Identity Journeys

The web application presents module-first entry journeys: Supply chain,
Card & eligibility, FPS authentication, Trust & reconcile, and Platform
Administration. Operators choose a module, then a Keycloak persona that lands
on the matching module home (`/m/...`). Legacy screen routes remain flat
(`/workbench`, `/eligibility`, `/distribution`, and related paths). See
`docs/implementation/three-module-ui-ia.md` and
`docs/implementation/three-module-mock-services.md`.

FPS beneficiary authentication may call an optional `epos-auth-mock` that
simulates Aadhaar/UIDAI-style auth outcomes using opaque `aadhaarRefHash`
references only. Raw Aadhaar numbers, OTP values, and biometrics are prohibited.


For an FPS request:

1. verify the token and active application role;
2. load the active `FAIR_PRICE_SHOP` assignment;
3. derive the effective FPS and opaque operator reference;
4. scope collection and dashboard queries to that FPS;
5. return `404` for an individual resource assigned to another FPS;
6. if a legacy mutation includes `fpsId` or `dealerId`, return `403` unless it
   matches the derived identity;
7. never grant operational authority solely because the subject is a platform
   administrator.

The maintained web client omits caller-controlled `fpsId` and `dealerId`.
`FPS-101` and `FPS-202` fixtures and tests demonstrate isolation.

## Integration Endpoints

Pilot source events use the authenticated `integration-service` role:

- `POST /integrations/smartpds/v1/master-references`;
- `POST /integrations/scm/v1/allocation-events`;
- `POST /integrations/scm/v1/movement-events`;
- `POST /integrations/epos/v1/distribution-events`.

Operational support endpoints expose event lists, per-source health,
reconciliation, and source-to-operation-to-proof trace. Service accounts are
restricted to configured source systems, endpoint families, event types, and
active credentials.

Ingestion result semantics are:

- `201`: new event accepted and processed;
- `200`: identical replay, with the original result;
- `202`: valid event durably quarantined pending a missing parent;
- `409`: source event ID reused with conflicting approved content;
- validation error: malformed schema or a recursively prohibited field.

## Canonical Ingestion Flow

1. Authenticate the integration-service subject and load its database
   assignments.
2. Validate endpoint family, source system, event type, schema version, and
   credential status.
3. Recursively reject prohibited identity or device-credential fields.
4. Map the configured external shape into a state-neutral canonical payload.
5. Canonicalize the privacy-approved payload and recompute its hash.
6. Resolve `(source_system, source_event_id)`.
7. Return the original result for an identical replay.
8. Record a conflict and audit exception for different approved content.
9. Store a valid missing-parent event as `QUARANTINED`.
10. For a processable event, apply the normalized business operation, record
    reconciliation/domain results, and create proof intent.
11. Correlate quarantined children when their parent arrives.

Amendments and reversals are new linked events; history is never overwritten.

## Operational Command And Proof Flow

The pilot-safe transaction boundary is:

```text
BEGIN
  lock affected rows
  validate idempotency, version, stock, and entitlement
  insert accepted source/domain event
  apply business mutation and workflow history
  insert reconciliation result or exception
  insert Fabric outbox proof intent
COMMIT
```

All steps must use one PostgreSQL client. Quantity changes use row locks,
conditional updates, unique idempotency constraints, and optimistic versions.
Ingestion, FPS receipt, and distribution are the first vertical slices that
must move to this path before pilot traffic.

The controlled-PoC runtime has not completed this migration. It must run one API
replica, be reset/reseeded before demonstration, and must not be used to claim
crash atomicity or concurrent mutation safety.

After PostgreSQL acceptance, the embedded outbox worker asynchronously calls
`RecordLedgerProof`. Operational success is returned independently from proof
status. Fabric commit confirmation changes the proof to `COMMITTED` and records
the real Fabric transaction ID. Retryable failures remain visible; exhausted
failures become `DEAD_LETTER` until an authorized replay.

## Stock And Entitlement Invariants

- Quantities are positive integer kilograms for this cycle.
- A movement cannot exceed the locked source lot's remaining quantity.
- A partial movement creates a child lot with `rootLotId` and `parentLotId`.
- Shortage, damage, rejection, transit loss, and process loss require explicit
  adjustments; an alert never changes quantity.
- Repeated commands and transitions are idempotent.
- Conflicting reuse of an idempotency key is a conflict.
- Stock and entitlement balances may not be double-spent.
- Root-lot conservation follows the equation in the
  [MVP hardening plan](../implementation/mvp-hardening-plan.md).

## Reconciliation Design

The engine compares:

- allocation with dispatch and remaining stock;
- movement with receipt or explicit adjustment;
- FPS opening stock + receipts - distributions - adjustments with closing
  stock.

It tolerates late and out-of-order batches by retaining source occurrence,
device-sync, ingestion, and processing times. Missing-parent age,
reconciliation lag, schema versions, and accepted/duplicate/conflicted/
rejected/quarantined counters are visible per source.

Privacy-safe dead letters retain only data allowed by the same recursive
boundary validation.

## Fabric Proof Design

Every proof includes:

- `eventId` and `operationId`;
- actor and application role;
- submitting organization;
- canonical payload hash and schema version;
- non-sensitive entity identifiers;
- API-generated business timestamp.

Chaincode derives transaction identity and execution time from the Fabric stub.
Identical `eventId` replay succeeds; conflicting content fails. The API never
places raw Aadhaar, biometric, OTP, phone/mobile, ration-card, beneficiary-name,
address, or device-credential material in a proof.

Named chaincode business functions remain compatibility functions.
`RecordLedgerProof` is the maintained API submission boundary.

## User Interface Status Model

The FPS workspace shows:

- assigned shop and simulated device mapping;
- allocation, stock, and pending receipts;
- recent simulated distributions and reconciliation exceptions;
- source system and source-event status;
- operational result and proof status as separate concepts;
- Fabric transaction reference only after a confirmed commit.

Browser authentication and distribution controls are explicitly PoC
simulations. In a pilot, their authoritative events originate in AePDS/ePoS.

## Verification Gates

Controlled-PoC acceptance requires two-FPS isolation, provenance and status UI,
privacy rejection, replay/conflict/quarantine tests, build/typecheck/lint/unit
tests, and demo HTTP tests where loopback is permitted.

Pilot acceptance additionally requires approved Maharashtra contracts,
row-scoped atomic command tests including crashes and simultaneous operations,
backup/restore and recovery exercises, security/privacy review, integration
operations, and a two-peer Fabric regression.
