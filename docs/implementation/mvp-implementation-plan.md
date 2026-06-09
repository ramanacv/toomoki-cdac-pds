# PDS-Chain MVP Implementation Plan

## Objective

Build a working 2-week MVP of PDS-Chain that demonstrates a complete commodity journey:

```text
Procurement Centre
  -> Miller
  -> State Godown
  -> Block Godown
  -> FPS Allocation
  -> FPS Receipt
  -> Beneficiary Authentication
  -> Entitlement Validation
  -> Distribution
  -> Blockchain Receipt
  -> Audit And Traceability
```

The implementation must follow the existing product and technical docs and preserve the core rule that sensitive beneficiary data stays off-chain.

## Delivery Target

The MVP is complete when a seeded demo can:

- Register and view stakeholders.
- Create one rice lot.
- Dispatch and receive stock across the chain.
- Allocate and receive stock at FPS.
- Simulate beneficiary authentication.
- Validate entitlement and block duplicate claim.
- Record distribution on-chain.
- Show lot trace and distribution verification.
- Raise at least one audit alert for an exception scenario.

## Recommended Repository Structure

Create the implementation using this layout:

```text
apps/
  api/
  web/
blockchain/
  fabric-network/
  chaincode/
    pds-chaincode/
infra/
  docker/
docs/
  implementation/
packages/
  shared-types/
  config/
scripts/
  seed/
  demo/
```

Structure intent:

- `apps/api`: NestJS backend.
- `apps/web`: React + Vite dashboard and workflow UI.
- `blockchain/fabric-network`: Fabric bootstrap artifacts, org config, connection profiles, CA config.
- `blockchain/chaincode/pds-chaincode`: chaincode implementation.
- `infra/docker`: Docker Compose files and local environment wiring.
- `packages/shared-types`: DTOs, enums, event names, and shared validation constants.
- `scripts/seed`: seed data loading.
- `scripts/demo`: scripted happy-path and exception-path demo helpers.

## Technology Decisions To Lock Now

- Blockchain: Hyperledger Fabric 2.5, Fabric CA, CouchDB, single-channel MVP network.
- Chaincode language: TypeScript.
- Backend: NestJS on Node.js.
- Database access: Prisma is the practical choice for MVP speed and schema control.
- Frontend: React + Vite.
- Charts: Recharts.
- Auth: JWT for application users; mock beneficiary authentication only.
- Deployment: Docker Compose.

These decisions should not be reopened during MVP implementation unless there is a blocking issue.

## Workstreams

## 1. Foundation And Environment

Deliverables:

- Monorepo or workspace initialized with `apps`, `packages`, `blockchain`, `infra`, and `scripts`.
- Base `.env.example` for API, DB, JWT, Fabric gateway, and frontend settings.
- Docker Compose file for PostgreSQL, Fabric components, CouchDB, API, and frontend.
- Shared linting and formatting setup.
- Shared TypeScript configuration.

Implementation notes:

- Keep local development deterministic with seeded data and fixed IDs.
- Use request IDs in API logging from the start.
- Do not bring in pilot or production infrastructure concerns now.

Exit criteria:

- `docker compose up` starts PostgreSQL, Fabric dependencies, API, and frontend shell.
- API can connect to PostgreSQL.
- API can load Fabric connection settings.

## 2. Blockchain Network And Chaincode

Deliverables:

- Fabric MVP network with five org identities represented in config:
  - Food Department.
  - Procurement/Miller.
  - Godown/Warehouse.
  - FPS.
  - Auditor.
- Single PDS channel.
- Chaincode package with required assets and transaction functions.
- Chaincode deployment scripts for local MVP environment.

Chaincode scope for MVP:

- `RegisterStakeholder`
- `CreateCommodityLot`
- `DispatchLot`
- `ReceiveLot`
- `AllocateToFPS`
- `RecordFPSReceipt`
- `RecordDistribution`
- `RaiseAuditFlag`
- `ResolveAuditFlag`
- `GetLotHistory`
- `GetDistributionHistory`

Defer these unless needed by implementation:

- `RegisterBeneficiaryHash`
- `CreateMonthlyEntitlement`
- `CheckDuplicateClaim`
- `GetCurrentStock`
- `VerifyDatabaseHash`

Implementation notes:

- Keep beneficiary-sensitive fields hashed before they reach chaincode.
- Use simple asset schemas with stable IDs and timestamps.
- Do not encode operational query complexity into chaincode.
- The source of stock truth for user-facing screens remains PostgreSQL; ledger holds audit proofs and history.

Exit criteria:

- API can submit a test stakeholder registration transaction.
- API can fetch lot history from ledger after lot creation and transfer events.
- Chaincode stores distribution receipts without raw PII.

## 3. Backend API And Domain Logic

Deliverables:

- NestJS application with modules:
  - `auth`
  - `users`
  - `stakeholders`
  - `lots`
  - `transfers`
  - `fps-allocations`
  - `beneficiaries`
  - `entitlements`
  - `distributions`
  - `audit-alerts`
  - `trace`
  - `dashboard`
- Swagger/OpenAPI.
- JWT login for application roles.
- Fabric gateway integration service.
- PostgreSQL schema and migrations.

Suggested backend layers:

- Controllers: transport and validation only.
- Services: orchestration and business rules.
- Repositories: persistence access.
- Ledger gateway service: all Fabric submission and query logic.
- Audit rules service: creates and resolves alerts.
- Shared DTOs from `packages/shared-types`.

Implementation order:

1. `auth`, `users`, `stakeholders`
2. `lots`
3. `transfers`
4. `fps-allocations`
5. `beneficiaries`, `entitlements`
6. `distributions`
7. `audit-alerts`
8. `trace`
9. `dashboard`

Critical backend rules:

- Block inactive stakeholders and unauthorized roles.
- Reject insufficient stock before ledger submission.
- Update PostgreSQL and ledger in a controlled sequence:
  - Write to PostgreSQL within a transaction.
  - Submit to Fabric.
  - Persist `ledgerTxId` in `ledger_tx_index`.
  - Mark operation failed or compensating state if ledger submission fails.
- Never write raw Aadhaar, OTP, mobile, or biometric data to any ledger payload.

Exit criteria:

- Swagger shows all MVP endpoints.
- Happy-path business workflow works end to end from API.
- Duplicate claim and over-distribution are blocked.

## 4. Database Schema And Seed Data

Deliverables:

- Schema for:
  - `stakeholders`
  - `users`
  - `commodity_lots`
  - `stock_positions`
  - `transfer_orders`
  - `fps_allocations`
  - `beneficiary_registry_mock`
  - `ration_cards_mock`
  - `monthly_entitlements`
  - `auth_transactions`
  - `distribution_transactions`
  - `ledger_tx_index`
  - `audit_alerts`
- Seed scripts for one complete district dataset.

Seed dataset:

- One district.
- One procurement centre.
- One miller.
- One state godown.
- One block godown.
- One FPS.
- One auditor.
- Five mock beneficiaries.
- One active ration card scenario ready for June 2026.
- One rice lot `LOT-RICE-2026-001`.

Implementation notes:

- Seed hashes directly rather than deriving them from real PII.
- Maintain deterministic IDs so demo scripts and UI flows are stable.
- Store current stock by stakeholder and commodity to simplify dashboard queries.

Exit criteria:

- Fresh environment can be seeded with one command.
- Demo accounts and business data are available immediately after bootstrap.

## 5. Authentication And Entitlement Simulation

Deliverables:

- Mock OTP auth endpoint.
- Simulated biometric auth endpoint.
- Supervisor exception endpoint with reason capture.
- Entitlement validation service for monthly balance and duplicate claim prevention.

Implementation notes:

- Beneficiary authentication is an application-level simulation, not a blockchain identity.
- `auth_transactions` should store result, mode, approver if applicable, and hashed reference.
- Duplicate claim prevention should be enforced from `monthly_entitlements` plus recorded distributions.

Exit criteria:

- Failed authentication blocks distribution.
- Supervisor exception is auditable and can allow a controlled distribution.
- Second claim for the same beneficiary-month-commodity is rejected.

## 6. Audit And Reconciliation Engine

Deliverables:

- Rule engine service for MVP alerts.
- Reconciliation endpoint or scheduled job.
- Audit alert list, status updates, and resolution workflow.

Initial rules to implement:

- `SHORT_RECEIPT`
- `DUPLICATE_CLAIM`
- `FPS_OVER_DISTRIBUTION`
- `UNAUTHORIZED_TRANSACTION`
- `DB_LEDGER_MISMATCH`

Second-tier rules if time permits:

- `IN_TRANSIT_DELAY`
- `FPS_CLOSING_STOCK_MISMATCH`
- `DISTRIBUTION_TAMPERED`

Implementation notes:

- Do not try to build ML in the MVP.
- Use evidence fields in each alert so the dashboard can explain why it fired.
- Keep reconciliation callable on demand for demo control.

Exit criteria:

- At least one seeded or scripted scenario reliably generates an alert.
- Alerts can be opened, viewed, and resolved with remarks.

## 7. Frontend MVP

Deliverables:

- Login screen for application roles.
- Dashboard summary page.
- Stakeholder list view.
- Lot list and lot trace view.
- Transfer workflow screens.
- FPS allocation and receipt view.
- Beneficiary distribution screen.
- Audit alert view.
- Verification screen for lot/distribution lookup.

Suggested frontend routing:

- `/login`
- `/dashboard`
- `/stakeholders`
- `/lots`
- `/lots/:lotId`
- `/transfers`
- `/fps-allocations`
- `/distribution`
- `/audit-alerts`
- `/verify`

UI priorities:

- Build task-oriented screens, not a polished portal.
- Optimize for demo clarity over completeness.
- Use masked identifiers consistently in all beneficiary-facing or audit-facing screens.
- Make ledger transaction ID visible where useful for proof and traceability.

Exit criteria:

- A user can complete the happy path from UI with seeded data.
- An auditor can inspect trace history and alerts from UI.

## 8. Demo Automation

Deliverables:

- Seed script.
- Happy-path demo script.
- Exception-path demo script for shortage or duplicate claim.
- Simple reset script for local reruns.

Recommended demo flows:

- Happy path:
  - create lot
  - dispatch and receive across chain
  - allocate to FPS
  - receive at FPS
  - authenticate beneficiary
  - validate entitlement
  - distribute and show ledger receipt
- Exception path:
  - receive less than dispatched quantity
  - show generated alert
  - attempt duplicate distribution
  - show rejection or alert

Exit criteria:

- Demo can be replayed without manual DB edits.
- Environment reset is predictable.

## Build Sequence

Implement in this order:

1. Repository skeleton and local tooling.
2. PostgreSQL schema and seed data.
3. Fabric local network and chaincode skeleton.
4. NestJS app bootstrapping with auth and stakeholder module.
5. Lot and transfer flows.
6. FPS allocation and receipt flows.
7. Authentication simulation and entitlement validation.
8. Distribution flow and ledger receipt.
9. Audit engine and reconciliation.
10. Frontend workflow screens.
11. Demo scripts and final polish.

This order keeps backend and ledger foundations ahead of UI and avoids rework.

## Suggested 2-Week Execution Schedule

### Days 1-2

- Set up repo structure.
- Bootstrap API, web, DB, Docker Compose.
- Define shared enums and DTOs.
- Create DB schema and seed mechanism.

### Days 3-4

- Stand up Fabric local network.
- Implement chaincode asset models and basic transactions.
- Integrate backend with Fabric gateway.

### Days 5-6

- Implement stakeholders, lots, transfers, and stock updates.
- Implement lot history and ledger transaction indexing.

### Days 7-8

- Implement FPS allocation, FPS receipt, beneficiary mocks, and entitlement validation.

### Days 9-10

- Implement distribution flow, citizen receipt, duplicate claim block, and audit alerts.

### Days 11-12

- Implement dashboard, traceability views, and alert management UI.

### Days 13-14

- Add demo scripts, reconciliation endpoint, smoke tests, and final end-to-end verification.

## Acceptance Gates

## Gate 1: Platform Ready

- Services start locally.
- DB migration and seed scripts work.
- API and frontend boot.
- Fabric network is reachable.

## Gate 2: Supply Chain Ready

- Stakeholders can be registered.
- Lot creation works.
- Transfer dispatch and receipt work.
- Lot history is visible from ledger.

## Gate 3: FPS And Beneficiary Ready

- FPS allocation and receipt work.
- Beneficiary authentication simulation works.
- Entitlement validation works.
- Distribution writes receipt to ledger.

## Gate 4: Audit Ready

- At least one alert rule is demonstrated.
- Distribution trace and verification work.
- Dashboard shows stock, alerts, and trace counts.

## Testing Plan

Automated tests:

- Unit tests for entitlement validation, stock checks, duplicate claim prevention, and alert rule evaluation.
- Integration tests for API modules using seeded PostgreSQL state.
- Ledger integration smoke tests for lot creation, transfer, and distribution receipt.

Manual end-to-end scenarios:

- Happy path full rice journey.
- Short receipt during transfer.
- FPS over-distribution attempt.
- Failed auth followed by supervisor exception.
- Duplicate beneficiary claim in same month.
- Verification of lot and distribution receipt.

## Risks And Controls

- Fabric setup complexity: keep network minimal and avoid early multi-channel or private data collection design.
- Transaction consistency across DB and ledger: persist operation status and `ledgerTxId` explicitly; do not rely on hidden side effects.
- Scope creep: do not add real Aadhaar, real ePoS, offline mobile, PFMS, or AI/ML work to the MVP.
- UI sprawl: implement only the screens needed to support the demo and audit story.

## Deferred Until After MVP

- Real SMART-PDS integration.
- Real ePoS integration.
- Real Aadhaar/UIDAI integration.
- IoT-GPS oracle.
- Offline Android FPS app.
- AI/ML anomaly engine.
- Keycloak.
- Kubernetes deployment.
- HSM-backed production key management.

## First Coding Sprint Recommendation

Start with these concrete tasks:

1. Create repo skeleton under `apps`, `blockchain`, `infra`, `packages`, and `scripts`.
2. Bootstrap NestJS API and React app.
3. Add Docker Compose with PostgreSQL and placeholder API/web services.
4. Define shared enums for roles, stakeholder types, lot status, transfer status, auth mode, auth result, and alert type.
5. Create PostgreSQL schema and seed scripts.
6. Implement stakeholder registration end to end, including first ledger write.

This sprint gives the project a real foundation and validates the DB plus ledger integration early.
