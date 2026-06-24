# Technical Stack: PDS-Chain MVP

## Stack Decision

The MVP stack is standardized on:

- Hyperledger Fabric 3.1.x for live demo (`PDS_LEDGER_MODE=fabric`); in-process chaincode for default demo mode.
- Node.js 22 and NestJS 11 for backend APIs.
- PostgreSQL for operational state.
- React 19 and Vite 7 for frontend dashboard.
- Docker Compose for local/demo deployment (demo and fabric profiles).

This stack matches the expert proposal and supports a practical 2-week MVP while leaving room for production hardening.

## Blockchain Layer

Selected:

- Hyperledger Fabric 3.1.x (2-org live demo stack).
- In-process chaincode runtime for default demo mode (`PDS_LEDGER_MODE=demo`).
- Fabric CA for identities.
- `@hyperledger/fabric-gateway` for Node.js (fabric mode).
- CouchDB as Fabric world state DB.
- TypeScript chaincode.
- Single main PDS channel (`pdschannel`) for MVP.
- Single-node Raft orderer with channel participation for demo.

Rationale:

- Permissioned participation fits government and PDS governance.
- No cryptocurrency or token is required.
- x.509 identities support accountable institutional actors.
- Endorsement policies support multi-party confirmation.
- Fabric history supports tamper-evident audit trails.

Rejected:

- Public blockchain, because PDS needs permissioned identities, privacy controls, government governance, and no cryptocurrency exposure.
- Stack-neutral design, because MVP implementation needs concrete decisions.

## Backend Layer

Selected:

- Node.js 22.
- NestJS 11 with feature modules under `apps/api/src/modules/`.
- `@hyperledger/fabric-gateway` for fabric ledger mode.
- `pg` PostgreSQL client.
- Hand-rolled OpenAPI at `/openapi.json` and `/docs`.
- JWT-based role login for MVP (guards deferred).

Rationale:

- NestJS provides modular APIs and clean separation between controllers, services, adapters, and domain logic.
- Node.js works well with Fabric Gateway SDK.
- Swagger/OpenAPI supports rapid demo and integration review.
- JWT is sufficient for MVP role login; Keycloak can be introduced later.

## Database Layer

Selected:

- PostgreSQL for operational data.
- CouchDB for Fabric world state.

PostgreSQL stores:

- Users and stakeholders.
- Current stock.
- Workflow statuses.
- Mock beneficiary registry.
- Monthly entitlements.
- Auth transactions.
- Distribution transactions.
- Ledger transaction index.
- Audit alerts.
- Integration logs.

Rationale:

- PostgreSQL is reliable for transactional application state and dashboard queries.
- Fabric ledger should not be used as a general-purpose application database.
- Separation keeps current operational state fast while preserving immutable audit proofs on-chain.

## Frontend Layer

Selected:

- React.
- Vite.
- `@pds/fixtures` for mock workspace data loaded from `mock/`.
- Recharts or Apache ECharts.
- QR code library.

Main views:

- Dashboard summary.
- Supply chain flow.
- Lot trace.
- FPS stock and distribution view.
- Beneficiary authentication log with masked references.
- Audit alert view.
- Proof-of-integrity verification.

Rationale:

- React and Vite support fast MVP development.
- Charting libraries support command-centre style dashboards.
- QR generation supports simple traceability demos.

## Deployment Layer

MVP:

- Docker Compose with demo (default) and `--profile fabric` stacks.
- Fabric 3.1.x network containers (fabric profile).
- Backend API container (NestJS 11).
- PostgreSQL container.
- CouchDB containers (fabric profile).
- Frontend container.
- `.env`-driven configuration: `PDS_LEDGER_MODE`, `VITE_DATA_SOURCE`, gateway vars in `blockchain/fabric-network/fabric-env.example`.

Future production:

- Kubernetes.
- Government cloud, NIC cloud, MeghRaj, or state data centre.
- API gateway.
- Centralized logs and metrics.
- HSM-backed private keys.
- Secret manager or vault.
- Backup, restore, and disaster recovery.

## Authentication And Authorization

MVP:

- JWT login.
- Role-based API guards.
- Mock beneficiary authentication.

Future production:

- Keycloak or government-approved identity provider.
- Integration with approved Aadhaar authentication infrastructure where legally permitted.
- Device-bound FPS dealer identity.
- HSM-backed signing keys.

## Privacy And Security Controls

MVP controls:

- No sensitive beneficiary data on-chain.
- Hash/reference-only ledger records for beneficiary and authentication fields.
- Role-based access control.
- Audit trail for privileged workflows.
- Request IDs and ledger transaction IDs for traceability.

Future controls:

- TLS everywhere.
- Private data collections.
- Multi-node endorsement policies.
- Key rotation.
- HSM integration.
- Security testing and CERT-In aligned review.

## NBF-LITE Position

NBF-LITE exists in the repository and can be referenced as demo or research tooling. It should not be positioned as the primary production architecture. If used during implementation, it should be treated as an accelerator for experimentation, not as the final government-grade deployment baseline.

## Future Roadmap Technologies

- Keycloak for identity and access management.
- Kubernetes for orchestration.
- API gateway for external integrations.
- Event bus for high-volume integration events.
- Offline Android FPS app.
- IoT-GPS oracle integration.
- AI/ML leakage analytics.
- Observability stack for logs, metrics, traces, and alerts.

## Non-Goals For MVP

- Production-grade national-scale deployment.
- Real Aadhaar authentication.
- Real ePoS integration.
- Real SMART-PDS integration.
- Real PFMS/DBT integration.
- Real IoT-GPS hardware ingestion.
- AI/ML model training.
- Offline mobile sync.
- HSM-backed production key management.
