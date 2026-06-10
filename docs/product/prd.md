# Product Requirements Document: PDS-Chain MVP

## Product Vision

PDS-Chain provides a blockchain-enabled trust layer for PDS transactions so government departments, FPS dealers, godowns, auditors, and beneficiaries can verify commodity movement and ration delivery events without relying only on mutable operational databases.

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

## MVP User Journeys

### Stakeholder Onboarding

An admin registers procurement centre, miller, godowns, FPS dealer, and auditor. Each stakeholder receives an active status and role-appropriate permissions.

### Commodity Lot Creation

A procurement user creates a rice lot with quantity, grade, source, owner, location, and timestamp. The system stores operational state and writes a lot creation proof to the ledger.

### Custody Transfer

A sender creates a dispatch record. The receiver confirms receipt. If received quantity differs from dispatched quantity, the system records the mismatch and creates an audit alert.

### FPS Allocation And Receipt

The department allocates stock to an FPS. The FPS confirms receipt. FPS stock is increased only after receipt confirmation.

### Beneficiary Distribution

The FPS dealer selects a mock beneficiary, completes simulated authentication, validates monthly entitlement, records delivery, reduces FPS stock, and writes a privacy-preserving distribution receipt to the blockchain.

### Audit Review

An auditor views lot history, distribution receipts, pending receipts, duplicate claim attempts, shortages, DB-ledger mismatches, and high-risk FPS entries.

## Functional Requirements

### Stakeholder Registry

- Register stakeholders with ID, type, name, location, license/reference number, and status.
- Support stakeholder types for procurement centre, miller, transporter, godown, FPS, department, and auditor.
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

- Allocate commodity stock from block godown to FPS.
- Prevent allocation above available stock.
- Confirm FPS receipt.
- Track FPS opening, received, distributed, and closing stock.

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
- Write privacy-preserving receipt to ledger.
- Generate citizen receipt text and verification ID.

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
- Keep business APIs integration-ready for future SMART-PDS/state system adapters.
- Store operational state in PostgreSQL and immutable audit records in Fabric.

## Acceptance Criteria

- A seeded demo can execute the full rice journey from procurement to delivery.
- Every lot, transfer, FPS allocation, FPS receipt, distribution, and audit alert has a ledger transaction ID where applicable.
- Duplicate beneficiary monthly claim is rejected.
- Failed authentication blocks distribution unless supervisor exception is used.
- Short receipt creates an audit alert.
- Tampered operational quantity can be detected through ledger reconciliation.
- Dashboard can display stock, distributions, alerts, and traceability.
- Blockchain payloads contain only hashes/references for beneficiary identity and authentication.

## Roadmap

- Phase 1: 2-week MVP with mock data and simulated integrations.
- Phase 2: District pilot with CSV, batch, or API integration from state systems.
- Phase 3: SMART-PDS, ePoS, and approved authentication integration.
- Phase 4: Offline FPS mobile app, IoT-GPS oracle, AI/ML leakage analytics, production hardening, and government cloud deployment.
