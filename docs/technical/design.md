# Technical Design: PDS-Chain MVP

## Domain Model

Core entities:

- Stakeholder: participating organization or actor such as procurement centre, miller, godown, FPS, department, or auditor.
- User: authenticated application user mapped to stakeholder and roles.
- CommodityLot: tracked commodity batch with quantity, grade, owner, location, and status.
- StockPosition: current stock balance by stakeholder, commodity, lot, and month where applicable.
- TransferOrder: dispatch and receipt workflow between stakeholders.
- TransferEvent: ledger-recorded dispatch or receipt event.
- FPSAllocation: monthly or periodic allocation from godown to FPS.
- BeneficiaryRegistryMock: MVP mock beneficiary reference data.
- RationCardMock: MVP mock ration card and household entitlement data.
- MonthlyEntitlement: entitlement, lifted quantity, and balance for a ration card hash.
- AuthTransaction: simulated authentication result.
- DistributionTransaction: FPS delivery record.
- LedgerTxIndex: mapping of application records to blockchain transaction IDs.
- AuditAlert: exception raised by rule engine or auditor.

## Mock Data And Fixtures

MVP mock records are not embedded in business logic. They are defined as JSON under `mock/` and loaded through `@pds/fixtures`.

| Location | Role |
|----------|------|
| `mock/entities/` | Workspace entity arrays for web mock/auto mode |
| `mock/seed/backend.json` | Shared backend bootstrap for API, chaincode, and PostgreSQL |
| `mock/scenarios/` | Scenario-specific alerts and dashboard overrides |
| `packages/fixtures/` | Typed exports consumed by web, API seed path, and chaincode |

PostgreSQL seed SQL at `infra/postgres/seed.sql` is generated from the same backend seed payload (`npm run fixtures:sql`).

Beneficiary and ration card mock tables (`beneficiary_registry_mock`, `ration_cards_mock`) are populated from `mock/seed/backend.json`. Operational entitlement rows align with the same ration card hash used across fixtures.

Full editing and switching guidance: [Mock data and fixtures](../implementation/mock-data.md).

## Backend Structure

The NestJS 11 API lives under `apps/api/src/modules/`:

| Module | Responsibility |
|--------|----------------|
| `config` | Env validation (`PDS_LEDGER_MODE`, persistence, Fabric gateway vars) |
| `core` | `PdsLedgerFacade`, bootstrap `OnModuleInit` |
| `ledger` | Ledger port factory; demo vs fabric adapter selection |
| `fabric` | Gateway connection, identity, chaincode client ports |
| Domain modules | Thin controllers per API group (stakeholders, lots, transfers, …) |

**Ledger modes:**

- `PDS_LEDGER_MODE=demo` (default): in-process `PdsChaincodeInvoker` + PostgreSQL snapshots.
- `PDS_LEDGER_MODE=fabric`: `@hyperledger/fabric-gateway` to `pds-chaincode` on `pdschannel`.

Legacy `PDS_LEDGER_BACKEND` values map to these modes for backward compatibility.

## Chaincode Assets

- Stakeholder.
- CommodityLot.
- TransferEvent.
- FPSAllocation.
- EntitlementRecordHash.
- AuthTransactionHash.
- DistributionReceipt.
- AuditAlert.

## Chaincode Functions

- `RegisterStakeholder`.
- `CreateCommodityLot`.
- `DispatchLot`.
- `ReceiveLot`.
- `AllocateToFPS`.
- `RecordFPSReceipt`.
- `RegisterBeneficiaryHash`.
- `CreateMonthlyEntitlement`.
- `RecordDistribution`.
- `CheckDuplicateClaim`.
- `RaiseAuditFlag`.
- `ResolveAuditFlag`.
- `GetLotHistory`.
- `GetDistributionHistory`.
- `GetCurrentStock`.
- `VerifyDatabaseHash`.

## Backend API Groups

### Stakeholders

- `POST /stakeholders`: register stakeholder.
- `GET /stakeholders`: list stakeholders.
- `GET /stakeholders/{stakeholderId}`: get stakeholder.
- `PATCH /stakeholders/{stakeholderId}/status`: activate or deactivate stakeholder.

### Lots

- `POST /lots`: create commodity lot.
- `GET /lots`: list lots.
- `GET /lots/{lotId}`: get current lot state.
- `GET /lots/{lotId}/history`: get ledger-backed lot history.

### Transfers

- `POST /transfers`: dispatch stock.
- `POST /transfers/{transferId}/receive`: confirm receipt.
- `GET /transfers`: list transfers.
- `GET /transfers/{transferId}`: get transfer details.

### FPS Allocations

- `POST /fps-allocations`: create FPS allocation.
- `POST /fps-allocations/{allocationId}/receipt`: confirm FPS receipt.
- `GET /fps-allocations`: list allocations.

### Beneficiaries And Entitlements

- `GET /beneficiaries/{beneficiaryRefHash}`: get masked beneficiary mock record.
- `GET /entitlements/{rationCardHash}`: get monthly entitlement.
- `POST /entitlements/validate`: validate entitlement before distribution.

### Authentication

- `POST /auth/mock-otp`: simulate OTP authentication.
- `POST /auth/simulated-biometric`: simulate biometric authentication.
- `POST /auth/supervisor-exception`: record approved exception flow.

### Distributions

- `POST /distributions`: record FPS distribution.
- `GET /distributions/{distributionId}`: get distribution.
- `GET /distributions/{distributionId}/receipt`: get masked citizen receipt.

### Trace

- `GET /trace/lots/{lotId}`: verify lot trace.
- `GET /trace/distributions/{distributionId}`: verify distribution receipt.

### Audit

- `GET /audit-alerts`: list alerts.
- `POST /audit-alerts/reconcile`: run reconciliation rules.
- `POST /audit-alerts/{alertId}/resolve`: resolve alert.

### Dashboard

- `GET /dashboard/summary`: stock, lots, distributions, and alerts summary.
- `GET /dashboard/fps-risk`: high-risk FPS list.
- `GET /dashboard/pending-receipts`: pending receipt list.

## PostgreSQL Tables

- `stakeholders`.
- `users`.
- `commodity_lots`.
- `stock_positions`.
- `transfer_orders`.
- `fps_allocations`.
- `beneficiary_registry_mock`.
- `ration_cards_mock`.
- `monthly_entitlements`.
- `auth_transactions`.
- `distribution_transactions`.
- `ledger_tx_index`.
- `audit_alerts`.
- `smartpds_integration_logs`.

## Event Flow

### Lot Creation

1. API validates request and role.
2. PostgreSQL transaction creates lot and initial stock position.
3. Backend submits `CreateCommodityLot` to Fabric.
4. Backend stores `ledgerTxId` in `ledger_tx_index`.
5. API returns lot state and ledger reference.

### Custody Transfer

1. Sender dispatches stock.
2. Backend validates sender stock.
3. Backend updates transfer status and reserves or reduces sender stock.
4. Backend submits `DispatchLot`.
5. Receiver confirms receipt.
6. Backend updates receiver stock.
7. Backend submits `ReceiveLot`.
8. If received quantity is lower, backend creates `SHORT_RECEIPT` audit alert and submits `RaiseAuditFlag`.

### Distribution

1. FPS dealer initiates mock authentication.
2. Backend records auth result.
3. Backend validates entitlement and FPS stock.
4. Backend records distribution and updates lifted quantity.
5. Backend reduces FPS stock.
6. Backend submits `RecordDistribution`.
7. API returns masked receipt and verification ID.

### Reconciliation

1. Audit engine reads operational records.
2. Audit engine reads ledger transaction references and current ledger state.
3. Rules compare quantities, statuses, and hashes.
4. Mismatches create audit alerts.
5. Alerts are visible in dashboard and trace views.

## Role Model

- System Admin: users, roles, configuration, seed data.
- Department Admin: stakeholders, lots, allocations, oversight, alert resolution.
- Procurement User: lot creation and dispatch from procurement centre.
- Godown Operator: stock receipt and dispatch.
- FPS Dealer: FPS receipt, authentication initiation, entitlement validation, distribution.
- Auditor: trace viewing, alert review, alert creation, alert resolution workflow.

## Audit Rules

- `DB_LEDGER_MISMATCH`: operational DB quantity or hash differs from ledger proof.
- `SHORT_RECEIPT`: received quantity is lower than dispatched quantity.
- `FPS_OVER_DISTRIBUTION`: distribution exceeds FPS stock.
- `DUPLICATE_CLAIM`: beneficiary attempts to lift same monthly entitlement twice.
- `IN_TRANSIT_DELAY`: stock remains in transit beyond configured threshold.
- `UNAUTHORIZED_TRANSACTION`: actor attempts restricted transaction.
- `FPS_CLOSING_STOCK_MISMATCH`: calculated closing stock differs from recorded stock.
- `DISTRIBUTION_TAMPERED`: distribution record hash differs from ledger proof.

## Error Handling

- Reject invalid or unauthorized role.
- Reject inactive stakeholder.
- Reject insufficient stock.
- Reject duplicate claim.
- Reject inactive ration card.
- Reject failed authentication unless supervisor exception exists.
- Reject invalid quantity.
- Create audit alert for quantity mismatch instead of silently correcting it.
- Return consistent API errors with request ID and error code.

## Demo Seed Data

Canonical records are defined in `mock/` and loaded through `@pds/fixtures`. Key identifiers:

- One district demo set with seven stakeholders (procurement through auditor).
- One ration card hash: `demo-ration-card-hash`.
- One beneficiary ref hash: `beneficiary-hash` (canonical across backend seed and workspace entities).
- One rice lot: `LOT-RICE-2026-001`.
- Workspace allocations: `ALLOC-2026-001`, `ALLOC-2026-002`.
- One successful distribution: `DIST-2026-001`.

Backend bootstrap uses `mock/seed/backend.json`. Richer workspace/demo state uses `mock/entities/` and `mock/scenarios/`. See [Mock data and fixtures](../implementation/mock-data.md).

## Data Privacy Design

Ledger distribution receipt fields should use:

- `distributionId`.
- `fpsId`.
- `rationCardHash`.
- `beneficiaryRefHash`.
- `commodity`.
- `deliveredKg`.
- `authMode`.
- `authResult`.
- `authTxnRefHash`.
- `dealerId`.
- `timestamp`.

Ledger distribution receipt fields must not include:

- Aadhaar number.
- Biometric data.
- OTP.
- Mobile number.
- Full ration card number.
- Full beneficiary name unless explicitly approved for a non-sensitive demo dataset.
