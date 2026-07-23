# Product Requirements Document: ViksitPDS MVP

## Product Vision

ViksitPDS provides a blockchain-enabled trust layer for PDS transactions so government departments, FPS dealers, godowns, auditors, and beneficiaries can verify commodity movement and ration delivery events without relying only on mutable operational databases.

## Product Goals

- Demonstrate end-to-end traceability of one commodity lot.
- Record critical PDS transactions on a permissioned blockchain.
- Maintain current workflow and stock state in an operational database.
- Simulate beneficiary authentication and entitlement validation.
- Prevent duplicate or excess distribution.
- Detect audit exceptions through rule-based checks.
- Provide dashboard views for stock, distribution, traceability, and alerts.

## Personas

- Department Admin: manages stakeholders, allocations, and high-level monitoring.
- Procurement User: creates commodity lots and dispatches stock.
- Godown Operator: receives, stores, and dispatches stock.
- FPS Dealer: receives allocated stock and records beneficiary distribution.
- Beneficiary: receives entitled commodity after authentication.
- Auditor: reviews trace history, mismatches, and alerts.
- System Admin: manages users, roles, configuration, and seed data.
- Integration Service: non-interactive client restricted by active database
  assignments to approved source systems, endpoint families, event types, and
  credentials.

## MVP User Journeys

### Stakeholder Onboarding

An admin registers procurement centre, FCI, state godown, issue point, FPS dealer, transporter, DSO, and auditor. Each stakeholder receives an active status and role-appropriate permissions.

### Commodity Lot Creation

A procurement user creates a rice lot with quantity, grade, source, owner, location, and timestamp. The system stores operational state and writes a lot creation proof to the ledger.

### Custody Transfer

A sender creates a dispatch record. The receiver confirms receipt. If received quantity differs from dispatched quantity, the system records the mismatch and creates an audit alert.

### FPS Allocation And Receipt

The department allocates stock to an FPS. The authenticated FPS confirms only
its assigned shop's receipt. FPS stock is increased only after confirmation.

### Beneficiary Distribution

In the controlled PoC, the FPS dealer uses visibly simulated authentication and
distribution actions. The API derives the shop and opaque operator reference
from the authenticated identity. PostgreSQL accepts the operation first and a
privacy-preserving Fabric proof is submitted asynchronously. In a pilot,
AePDS/ePoS remains authoritative and ViksitPDS ingests its approved event.

### State-System Event Ingestion

An integration service submits privacy-approved canonical envelopes for
SMART-PDS/RCMS master references, state-SCM allocations and movements, and
AePDS/ePoS distributions. Matching replay returns the original operation,
conflicting replay returns `409`, and missing dependencies remain durably
`QUARANTINED` until correlation is possible.

### Audit Review

An auditor views lot history, distribution receipts, pending receipts, duplicate claim attempts, shortages, DB-ledger mismatches, and high-risk FPS entries.

## Functional Requirements

### Stakeholder Registry

- Register stakeholders with ID, type, name, location, license/reference number, and status.
- Support stakeholder types for procurement centre, FCI, transporter, state godown, issue point, FPS, DSO, and auditor.
- Block inactive stakeholders from performing transactions.

### Commodity Lot Management

- Create commodity lot with commodity, season, quantity, grade, source, owner, location, and status.
- Track current owner and location.
- Provide lot history from ledger events.
- Reserve split and merge support for future extension unless needed in the demo.

### Custody Transfer

- Create dispatch from one stakeholder to another.
- Confirm receipt by receiver.
- Compare dispatched and received quantities.
- Update stock positions.
- Generate shortage alert when quantities differ.

### FPS Allocation

- Allocate commodity stock from issue point to FPS.
- Prevent allocation above available stock.
- Confirm FPS receipt.
- Track FPS opening, received, distributed, and closing stock.
- Scope FPS lists, individual reads, receipts, authentication, distributions,
  stock, dashboard, and trace access to the active shop assignment.
- Return `404` for an FPS request for another shop's resource and `403` for a
  caller-supplied mutation identity that conflicts with the assignment.

### Beneficiary Authentication Simulator

- Support mock OTP success/failure.
- Support simulated biometric success/failure.
- Support supervisor-approved offline exception flow.
- Store authentication result and reference hash.
- Do not store raw OTP, biometric, Aadhaar, or mobile number on-chain.

### Entitlement Validation

- Verify ration card status.
- Verify monthly entitlement.
- Check already lifted quantity.
- Prevent duplicate or excess lifting.
- Confirm FPS stock availability.

### FPS Distribution

- Record delivered commodity and quantity.
- Reduce FPS stock.
- Update monthly lifted quantity.
- Enqueue a privacy-preserving receipt proof without blocking the accepted
  PostgreSQL operation on Fabric availability.
- Generate citizen receipt text and verification ID.

### Canonical Integration Events

- Accept versioned `SourceEventEnvelope` records only from `integration-service`.
- Recompute a canonical approved-payload hash at the API boundary.
- Recursively reject prohibited identity, authentication, and credential fields.
- Persist unique `(source_system, source_event_id)` events and attempt outcomes.
- Support identical replay, conflicting replay, missing-parent quarantine,
  recovery, amendments, and reversals.
- Expose per-source health, reconciliation, and source-to-operation-to-proof
  tracing without returning raw source payloads.

### Audit And Anomaly Rules

- Detect DB-ledger quantity mismatch.
- Detect received quantity less than dispatched quantity.
- Detect FPS over-distribution.
- Detect duplicate monthly claim.
- Detect long-pending in-transit stock.
- Detect unauthorized actor attempts.
- Detect FPS closing stock mismatch.
- Detect altered distribution record after blockchain commit.

### Traceability And QR Verification

- Generate verification ID for lot and distribution transactions.
- Return full lot journey and current status.
- Return blockchain verification status.
- Return tamper or mismatch status.

### Dashboard

- Show total stock tracked.
- Show active lots.
- Show FPS allocation status.
- Show beneficiary distributions completed.
- Show pending receipts.
- Show shortage and duplicate-claim alerts.
- Show DB-ledger mismatch alerts.
- Show high-risk FPS list.

## Non-Functional Requirements

- Use permissioned blockchain with known participating organizations.
- Keep sensitive beneficiary data off-chain.
- Use role-based access control.
- Provide OpenAPI/Swagger documentation.
- Run MVP with Docker Compose.
- Support seeded demo data from canonical JSON fixtures (`mock/` via `@pds/fixtures`).
- Keep the canonical domain state-neutral; provisional Maharashtra fixture
  adapters must not be presented as real state integrations.
- Store operational state in PostgreSQL and immutable audit records in Fabric.
- Keep operational acceptance and Fabric proof completion separate and visible.

## Acceptance Criteria

- A seeded demo can execute the full rice journey from procurement to delivery.
- Every accepted proof-bearing operation has a traceable operation/event ID and
  queryable outbox state; `COMMITTED` additionally carries the real Fabric
  transaction ID.
- Duplicate beneficiary monthly claim is rejected.
- Failed authentication blocks distribution unless supervisor exception is used.
- Short receipt creates an audit alert.
- Tampered operational quantity can be detected through ledger reconciliation.
- Dashboard can display stock, distributions, alerts, and traceability.
- Blockchain payloads contain only hashes/references for beneficiary identity and authentication.
- `demo-fps` is restricted to `FPS-101`, and automated tests demonstrate
  isolation from `FPS-202`.
- Integration fixtures demonstrate `201`, identical replay `200`, quarantine
  `202`, conflict `409`, privacy rejection, reconciliation, and proof tracing.

## Roadmap

- Phase 1: 2-week MVP with mock data and simulated integrations.
- Phase 2: Controlled PoC with fixture-backed canonical adapters and assigned
  FPS scoping.
- Phase 3: Maharashtra-first non-production adapter validation using
  department/NIC-approved contracts and transactional hardening gates.
- Phase 4: Offline FPS mobile app, IoT-GPS oracle, AI/ML leakage analytics, production hardening, and government cloud deployment.
