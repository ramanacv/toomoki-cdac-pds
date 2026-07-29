# Audit Logging: POC Requirement Assessment

Scope: answer whether the POC requirement "there must be audit logs" is satisfied by the current codebase, identify which audit mechanisms exist, and list gaps against a strict "who did what, when, and is it tamper-evident and reviewable" reading of the requirement.

Assessed on 2026-07-29 from the current working tree.

## Summary verdict

The system has substantial audit capability — an append-only domain event log, tamper-evident Fabric proofs, provenance/trace APIs, an audit-alert workflow, and structured per-request logging with authenticated identity. For a demo/POC claim of "audit logs exist", this is defensible.

However, the trails are not yet joined into a single "who did what" record: Fabric proofs carry a hardcoded system actor instead of the authenticated user, the `workflow_transitions` audit table is schema-only, and the request log that does carry real user identity is stdout-only and not persisted or queryable.

## What exists (evidence)

### 1. Append-only domain event log

- `LedgerEvent` (`packages/shared-types/src/index.ts`, ~line 582): `ledgerTxId`, `entityType`, `entityId`, `eventType`, `payload`, `timestamp`.
- Persisted in PostgreSQL `ledger_events` (`infra/postgres/schema.sql`, ~line 473) with indexes on entity, event type, and timestamp.
- Exposed via `GET /ledger-events` (`apps/api/src/modules/transfers/transfers.controller.ts`), restricted to operational roles.
- Ledger digest verification via `POST /trace/verify` (`apps/api/src/modules/trace/trace.controller.ts`) compares a client-supplied digest against a hash of the full event stream.

### 2. Immutable Fabric proofs (tamper evidence)

- Every domain event is inserted into the `ledger_outbox` in the same operation as the snapshot save (`apps/api/src/modules/core/pds-runtime.ts`, ~line 748) and asynchronously submitted as a `RecordLedgerProof` transaction.
- Proof envelope (`apps/api/src/modules/fabric/ledger-proof.ts`) includes `eventId`, `operationId`, actor, payload hash, schema version, entity identifiers, and business timestamp, with recursive privacy validation (no Aadhaar, OTP, phone, raw card numbers).
- Proof status and analytics are queryable: `GET /ledger-proofs/:eventId`, `GET /ledger-proofs/:eventId/detail`, `GET /ledger-proofs/analytics` (`apps/api/src/modules/proofs/proofs.controller.ts`), with detail access limited to `auditor`, `management`, `platform-admin`.

### 3. Provenance / trace APIs

- `GET /trace/lots/:lotId` and `GET /trace/distributions/:distributionId` reconstruct custody and distribution history from chain queries (`apps/api/src/modules/trace/trace.controller.ts`), with FPS scoping on distribution reads.

### 4. Audit-alert workflow

- Auditor-scoped module (`apps/api/src/modules/audit/audit.controller.ts`): `GET /audit-alerts`, `POST /audit-alerts/reconcile`, `POST /audit-alerts/:alertId/resolve` with `resolvedBy` and `resolutionNote`. Shortage detection (e.g. `SHORT_RECEIPT`) is covered by `apps/api/test/audit.module.spec.ts`.

### 5. Structured HTTP request log with identity

- `PdsLoggingInterceptor` (`apps/api/src/infrastructure/logging.interceptor.ts`) emits one JSON line per request: `requestId`, control/data plane, method, path, status code, duration, outcome, and the authenticated `subject`, `roles`, `organizationId`, `stakeholderId`, `mspId`.

### 6. Business-level actor fields in event payloads

- Key mutations record a named actor in the domain payload: `authorizedBy` (movement authorization, card transfer), `approvedBy` (manual auth exception, entitlement rule), `resolvedBy` (grievance, audit alert) — see `blockchain/chaincode/pds-chaincode/src/index.ts`.

## Gaps against a strict audit-log requirement

| # | Gap | Evidence | Impact |
|---|-----|----------|--------|
| 1 | Fabric proof actor is hardcoded as `subject: 'pds-api'`, `applicationRole: 'SYSTEM'` | `apps/api/src/modules/fabric/fabric-gateway.client.ts` (~line 99) | The tamper-evident trail proves *what* happened but not *which authenticated user* did it, despite AGENTS.md requiring a traceable actor and application role on every proof. |
| 2 | `workflow_transitions` table (with `actor_subject`, `actor_role`, `idempotency_key`, `occurred_at`) exists in schema only | `infra/postgres/schema.sql` (~line 517); no reference anywhere in `apps/api/src` | The intended per-transition audit record is not written or queryable. Schema presence is not implementation. |
| 3 | The one log that carries real authenticated identity (request log) is stdout-only | `logging.interceptor.ts` uses Nest `Logger`; no persistence or query endpoint | Not durable or reviewable by an auditor without external log collection; lost on restart. |
| 4 | Actor fields in domain payloads (`authorizedBy`, `approvedBy`, `resolvedBy`) are client-supplied request-body values | e.g. `TransferAuthorizeDto`, `ResolveAuditAlertDto` | They are not server-bound to the authenticated JWT subject, so the domain event log's "who" is asserted, not verified. |
| 5 | No single auditor-facing audit-log query API | `GET /ledger-events` returns raw events without authenticated-actor identity; request logs are separate | An auditor cannot answer "show me everything user X did" from one place. |

## Recommended next actions

1. Propagate the authenticated identity (`request.user.subject`, role, organization) from the controllers into event creation and the proof actor envelope, replacing the hardcoded `SYSTEM` actor for user-initiated operations (keep `SYSTEM` for genuine system operations like reset).
2. Implement `workflow_transitions` writes inside the same PostgreSQL transaction as the business mutation, per the transactional-command hardening plan (`docs/implementation/mvp-hardening-plan.md`).
3. Server-side, override or validate `authorizedBy` / `approvedBy` / `resolvedBy` against the authenticated stakeholder rather than trusting the request body.
4. If the POC acceptance requires a reviewable access log, persist the structured request log (PostgreSQL table or shipped log file) and expose an auditor-scoped query endpoint; otherwise document stdout collection as the demo mechanism.
5. When demonstrating, present the pairing explicitly: PostgreSQL `ledger_events` as the operational audit log and Fabric `RecordLedgerProof` entries as the tamper-evident counterpart, verified via `/trace/verify` and `/ledger-proofs/*`.
