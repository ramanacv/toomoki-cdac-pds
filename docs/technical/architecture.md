# Technical Architecture: PDS-Chain MVP

## Architecture Summary

PDS-Chain is a permissioned blockchain trust layer backed by an operational database and business API. PostgreSQL stores current workflow state and dashboard-optimized data. Hyperledger Fabric stores immutable transaction proofs, custody history, distribution receipts, and audit evidence.

The MVP runs with mock data and simulated integrations. It is designed so real SMART-PDS, state PDS, ePoS, and authentication integrations can be added later through adapters.

## System Context

```text
Demo Data / Future SMART-PDS / Future ePoS / Future State PDS
        |
        v
Integration Adapter Layer
        |
        v
Backend Business API
        |
        +--> PostgreSQL Operational Database
        |
        +--> Hyperledger Fabric Ledger + CouchDB World State
        |
        v
Audit And Anomaly Engine
        |
        v
Dashboard And Traceability UI
```

## Architecture Layers

### External And Demo Data Sources

For MVP, data is seeded or submitted through mock APIs and JSON fixtures. Canonical demo records live in `mock/` and are loaded through `@pds/fixtures`. Future integrations may consume CSV, batch files, REST APIs, event streams, or approved government system feeds.

Potential future sources:

- SMART-PDS.
- State PDS systems.
- ePoS devices.
- Procurement platforms.
- Godown/warehouse systems.
- Approved Aadhaar authentication infrastructure.
- IoT-GPS devices.

### Integration Adapter Layer

The adapter layer normalizes input from demo data, CSV imports, batch feeds, and future APIs into internal commands. This prevents business logic from depending directly on external system formats.

MVP adapters:

- Fixture/seed data adapter (`mock/` + `@pds/fixtures` for API, chaincode, PostgreSQL, and web fallback).
- Mock SMART-PDS adapter.
- Mock beneficiary authentication adapter.

Future adapters:

- State PDS API adapter.
- ePoS transaction adapter.
- Aadhaar/authentication reference adapter.
- IoT-GPS oracle adapter.

### Backend Business API

The backend (NestJS 11, modular structure under `apps/api/src/modules/`) owns validation, workflow orchestration, role checks, database writes, ledger submission, and audit trigger calls.

Ledger modes:

- **Demo** (`PDS_LEDGER_MODE=demo`): in-process `PdsChaincodeInvoker` — default for stakeholder demos without Fabric containers.
- **Fabric** (`PDS_LEDGER_MODE=fabric`): `@hyperledger/fabric-gateway` client submitting to `pds-chaincode` on channel `pdschannel`.

API groups:

- Stakeholders.
- Lots.
- Transfers.
- FPS allocations.
- Beneficiaries.
- Authentication.
- Entitlements.
- Distributions.
- Traceability.
- Audit alerts.
- Dashboard.

### PostgreSQL Operational Database

PostgreSQL stores:

- Current stock positions.
- Stakeholder and user records.
- Workflow state.
- Mock beneficiary registry.
- Monthly entitlements.
- Distribution transactions.
- Ledger transaction index.
- Audit alerts.
- Integration logs.

PostgreSQL is optimized for application queries and dashboard views. It is not treated as the immutable source of truth for critical audit facts.

### Hyperledger Fabric Ledger

Fabric stores immutable proofs and state transitions for critical PDS events:

- Stakeholder registration proof.
- Commodity lot creation.
- Dispatch and receipt events.
- FPS allocation and receipt.
- Privacy-preserving entitlement and authentication references.
- Distribution receipts.
- Audit alert creation and resolution.

Fabric provides tamper-evident history and cross-organization trust. It does not store raw beneficiary identity or biometric data.

### CouchDB World State

CouchDB is used as Fabric world state DB for rich queries over current ledger asset state. Historical truth remains in Fabric transaction history.

### Audit And Anomaly Engine

The MVP audit engine is rule-based. It compares operational database state with ledger proofs and evaluates business rules.

MVP rules:

- DB quantity does not match ledger quantity.
- Received quantity is less than dispatched quantity.
- FPS distributes more than available stock.
- Duplicate monthly claim.
- Stock remains in transit beyond threshold.
- Unauthorized actor attempts transaction.
- FPS closing stock mismatch.
- Distribution record altered after blockchain commit.

### Dashboard And Traceability UI

The UI provides:

- Stock flow view.
- Lot trace view.
- FPS dashboard.
- Beneficiary distribution log with masked identifiers.
- Audit alert view.
- Proof-of-integrity verification.

The web app supports explicit data modes through `VITE_DATA_SOURCE`:

- `api` — live REST API only.
- `mock` — fixture workspace from `mock/` via `@pds/fixtures`.
- `auto` — API when online, fixtures when offline (default).

UI role/screen configuration stays in application source; domain mock records stay in `mock/`. See [Mock data and fixtures](../implementation/mock-data.md).

## Blockchain Network Design

MVP network (implemented):

- **Demo mode:** in-process chaincode runtime; no Fabric containers required.
- **Fabric mode:** Hyperledger Fabric **3.1.x** 2-org demo (Food Department + Godown).
- Channel: `pdschannel`; chaincode: `pds-chaincode`.
- Single-node Raft orderer with channel participation (no system channel).
- Fabric CA for identities; CouchDB world state on peers.

Documented consortium (5 orgs in `network-manifest.json`):

- Org1: Food and Civil Supplies Department.
- Org2: Procurement/Miller.
- Org3: Godown/Warehouse.
- Org4: Fair Price Shop.
- Org5: Auditor/Inspection Authority.

Production hardening may deploy all five orgs with multi-node Raft, multiple peers per organization, private data collections, HSM-backed keys, and separate channels by state/district or data-sharing boundary.

## On-Chain Versus Off-Chain Boundary

On-chain:

- Commodity lot IDs and metadata needed for audit.
- Custody transfer events.
- FPS allocation and receipt proofs.
- Distribution receipt with masked/hash references.
- Audit alert and resolution proofs.
- Hashes of sensitive or operational records where reconciliation is needed.

Off-chain:

- Raw beneficiary identity data.
- Aadhaar number.
- Biometric templates or samples.
- OTP values.
- Mobile numbers.
- Full ration card number.
- Dashboard query models.
- Integration payload logs that contain sensitive data.

## Security And Privacy Model

- Use x.509 identities for blockchain participants.
- Use role-based access control in backend APIs.
- Keep all sensitive beneficiary data off-chain.
- Store hashes and references in ledger records.
- Use TLS for service communication where applicable.
- Maintain audit logs for privileged operations.
- Use environment-based secrets for MVP; use vault/HSM-backed key management in production.

## Integration Modes

Demo mode:

- Mock data and simulated APIs.
- In-process chaincode ledger (`PDS_LEDGER_MODE=demo`).
- Suitable for 2-week MVP demonstration without Fabric infrastructure.

Fabric demo mode:

- Live 2-org Fabric stack via `docker compose --profile fabric`.
- Gateway-backed API (`PDS_LEDGER_MODE=fabric`).
- Bootstrap: `blockchain/fabric-network/scripts/bootstrap-network.sh`.

Pilot mode:

- District/state PDS data through CSV, API, or batch feeds.
- Controlled onboarding of real stakeholders and limited transaction volume.

Production mode:

- Approved integration with SMART-PDS, ePoS, authentication infrastructure, state systems, and government cloud deployment.

## Deployment Model

MVP:

- Docker Compose with **demo** (default) and **fabric** profiles.
- Fabric 3.1.x network containers (fabric profile): orderer, 2 peers, CouchDB, CAs.
- Backend API container (NestJS 11) joins `pds-fabric` network in fabric profile.
- PostgreSQL container.
- Frontend container.

Future production:

- Kubernetes.
- Government cloud or state data centre.
- API gateway.
- Observability stack.
- HSM or managed key storage.
- Disaster recovery and backup policy.
