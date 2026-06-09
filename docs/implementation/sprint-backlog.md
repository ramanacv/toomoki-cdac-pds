# PDS-Chain MVP Sprint Backlog

This backlog turns the implementation plan into an execution sequence. The order is intentional: foundation first, then ledger and backend, then UI and demo tooling.

## Sprint 0: Workspace And Tooling

Goal: create the skeleton and local development baseline.

- Create the monorepo folders under `apps`, `blockchain`, `infra`, `packages`, and `scripts`.
- Add root TypeScript, lint, and formatting conventions.
- Add `.env.example` entries for API, database, blockchain, and frontend settings.
- Add Docker Compose wiring for PostgreSQL, Fabric services, and app containers.
- Add shared DTO and enum package for reuse across backend, frontend, and chaincode.

Exit criteria:

- Local workspace boots with placeholder services.
- Developers can see the intended project layout immediately.

## Sprint 1: Data And Ledger Foundation

Goal: make the platform store and verify core PDS records.

- Define PostgreSQL schema for stakeholders, lots, transfers, allocations, beneficiaries, entitlements, distributions, ledger references, and alerts.
- Implement seed scripts for the demo district dataset.
- Stand up the minimal Fabric network for the MVP.
- Implement chaincode asset models for stakeholder, lot, transfer, allocation, receipt, distribution, and alert.
- Wire backend ledger gateway to submit and query Fabric transactions.

Exit criteria:

- Stakeholder registration writes to both PostgreSQL and Fabric.
- Lot creation is traceable through a ledger transaction ID.

## Sprint 2: Workflow Services

Goal: complete the operational flow from procurement to FPS delivery.

- Implement lot creation and custody transfer services.
- Implement FPS allocation and FPS receipt services.
- Implement mock beneficiary authentication and supervisor exception flow.
- Implement monthly entitlement validation and duplicate claim blocking.
- Implement distribution recording and citizen receipt generation.

Exit criteria:

- Seeded happy path can progress from lot creation to beneficiary distribution.
- Duplicate claim and failed authentication are blocked.

## Sprint 3: Audit And Traceability

Goal: make exceptions visible and explainable.

- Implement audit rule engine for shortage, over-distribution, duplicate claim, unauthorized transaction, and DB-ledger mismatch.
- Implement trace APIs for lot and distribution verification.
- Implement alert list, resolution, and reconciliation endpoints.
- Expose audit evidence in a form the UI can display clearly.

Exit criteria:

- At least one exception scenario produces a visible alert and trace result.

## Sprint 4: Frontend And Demo

Goal: provide a usable demo surface.

- Build login and role-based navigation.
- Build dashboard, stakeholder, lot, transfer, allocation, distribution, audit, and verify screens.
- Add chart and table views for stock, alerts, and traceability.
- Add scripted happy-path and exception-path demos.
- Add smoke tests for the end-to-end flow.

Exit criteria:

- A user can run the demo without manually editing the database.
- The core business story is visible end to end in the UI.

## Deferred Work

These items should stay out of the MVP unless the schedule expands:

- Real Aadhaar or UIDAI integration.
- Real SMART-PDS integration.
- Real ePoS integration.
- PFMS or DBT integration.
- IoT-GPS device ingestion.
- AI or ML leakage analytics.
- Offline Android app.
- Kubernetes deployment.
- Production security hardening.
