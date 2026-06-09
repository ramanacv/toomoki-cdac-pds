import type { AuthTransaction, AuditAlert, DistributionTransaction, FPSAllocation, LedgerEvent, MonthlyEntitlement, Stakeholder, TransferOrder } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';

export type SqlStatement = {
  text: string;
  values: unknown[];
};

export type PostgresTableRows = {
  stakeholders?: Stakeholder[];
  lots?: Array<Record<string, unknown>>;
  transfers?: TransferOrder[];
  allocations?: FPSAllocation[];
  entitlements?: MonthlyEntitlement[];
  authTransactions?: AuthTransaction[];
  distributions?: DistributionTransaction[];
  alerts?: AuditAlert[];
  events?: LedgerEvent[];
};

const json = (value: unknown): unknown => JSON.stringify(value);

export const buildSnapshotWritePlan = (state: PdsLedgerState): SqlStatement[] => {
  const statements: SqlStatement[] = [
    { text: 'BEGIN', values: [] },
    {
      text: 'TRUNCATE stakeholders, commodity_lots, transfer_orders, fps_allocations, monthly_entitlements, auth_transactions, distribution_transactions, audit_alerts, ledger_events, ledger_tx_index RESTART IDENTITY CASCADE',
      values: []
    }
  ];

  for (const stakeholder of state.stakeholders) {
    statements.push({
      text: 'INSERT INTO stakeholders (stakeholder_id, stakeholder_type, name, district, license_no, status) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (stakeholder_id) DO UPDATE SET stakeholder_type = EXCLUDED.stakeholder_type, name = EXCLUDED.name, district = EXCLUDED.district, license_no = EXCLUDED.license_no, status = EXCLUDED.status, updated_at = NOW()',
      values: [stakeholder.stakeholderId, stakeholder.stakeholderType, stakeholder.name, stakeholder.district, stakeholder.licenseNo, stakeholder.status]
    });
  }

  for (const lot of state.lots) {
    statements.push({
      text: 'INSERT INTO commodity_lots (lot_id, commodity, season, quantity_kg, quality_grade, source, current_owner, current_location, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (lot_id) DO UPDATE SET commodity = EXCLUDED.commodity, season = EXCLUDED.season, quantity_kg = EXCLUDED.quantity_kg, quality_grade = EXCLUDED.quality_grade, source = EXCLUDED.source, current_owner = EXCLUDED.current_owner, current_location = EXCLUDED.current_location, status = EXCLUDED.status',
      values: [lot.lotId, lot.commodity, lot.season, lot.quantityKg, lot.qualityGrade, lot.source, lot.currentOwner, lot.currentLocation, lot.status]
    });
  }

  for (const transfer of state.transfers) {
    statements.push({
      text: 'INSERT INTO transfer_orders (transfer_id, lot_id, from_org, to_org, dispatched_qty_kg, received_qty_kg, shortage_qty_kg, vehicle_no, status, dispatch_timestamp, receive_timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (transfer_id) DO UPDATE SET lot_id = EXCLUDED.lot_id, from_org = EXCLUDED.from_org, to_org = EXCLUDED.to_org, dispatched_qty_kg = EXCLUDED.dispatched_qty_kg, received_qty_kg = EXCLUDED.received_qty_kg, shortage_qty_kg = EXCLUDED.shortage_qty_kg, vehicle_no = EXCLUDED.vehicle_no, status = EXCLUDED.status, dispatch_timestamp = EXCLUDED.dispatch_timestamp, receive_timestamp = EXCLUDED.receive_timestamp',
      values: [
        transfer.transferId,
        transfer.lotId,
        transfer.fromOrg,
        transfer.toOrg,
        transfer.dispatchedQtyKg,
        transfer.receivedQtyKg ?? null,
        transfer.shortageQtyKg ?? null,
        transfer.vehicleNo,
        transfer.status,
        transfer.dispatchTimestamp,
        transfer.receiveTimestamp ?? null
      ]
    });
  }

  for (const allocation of state.allocations) {
    statements.push({
      text: 'INSERT INTO fps_allocations (allocation_id, fps_id, commodity, allocated_qty_kg, received_qty_kg, month, source_godown_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (allocation_id) DO UPDATE SET fps_id = EXCLUDED.fps_id, commodity = EXCLUDED.commodity, allocated_qty_kg = EXCLUDED.allocated_qty_kg, received_qty_kg = EXCLUDED.received_qty_kg, month = EXCLUDED.month, source_godown_id = EXCLUDED.source_godown_id, status = EXCLUDED.status',
      values: [
        allocation.allocationId,
        allocation.fpsId,
        allocation.commodity,
        allocation.allocatedQtyKg,
        allocation.receivedQtyKg ?? null,
        allocation.month,
        allocation.sourceGodownId,
        allocation.status
      ]
    });
  }

  for (const entitlement of state.entitlements) {
    statements.push({
      text: 'INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (ration_card_hash, commodity, month) DO UPDATE SET monthly_entitlement_kg = EXCLUDED.monthly_entitlement_kg, already_lifted_kg = EXCLUDED.already_lifted_kg, available_balance_kg = EXCLUDED.available_balance_kg, active = EXCLUDED.active',
      values: [
        entitlement.rationCardHash,
        entitlement.commodity,
        entitlement.month,
        entitlement.monthlyEntitlementKg,
        entitlement.alreadyLiftedKg,
        entitlement.availableBalanceKg,
        entitlement.active
      ]
    });
  }

  for (const authTransaction of state.authTransactions) {
    statements.push({
      text: 'INSERT INTO auth_transactions (auth_txn_id, beneficiary_ref_hash, ration_card_hash, auth_mode, auth_result, auth_txn_ref_hash, approved_by, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (auth_txn_id) DO UPDATE SET beneficiary_ref_hash = EXCLUDED.beneficiary_ref_hash, ration_card_hash = EXCLUDED.ration_card_hash, auth_mode = EXCLUDED.auth_mode, auth_result = EXCLUDED.auth_result, auth_txn_ref_hash = EXCLUDED.auth_txn_ref_hash, approved_by = EXCLUDED.approved_by, timestamp = EXCLUDED.timestamp',
      values: [
        authTransaction.authTxnId,
        authTransaction.beneficiaryRefHash,
        authTransaction.rationCardHash,
        authTransaction.authMode,
        authTransaction.authResult,
        authTransaction.authTxnRefHash,
        authTransaction.approvedBy ?? null,
        authTransaction.timestamp
      ]
    });
  }

  for (const distribution of state.distributions) {
    statements.push({
      text: 'INSERT INTO distribution_transactions (distribution_id, fps_id, ration_card_hash, beneficiary_ref_hash, commodity, delivered_kg, auth_mode, auth_result, auth_txn_ref_hash, dealer_id, ledger_tx_id, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (distribution_id) DO UPDATE SET fps_id = EXCLUDED.fps_id, ration_card_hash = EXCLUDED.ration_card_hash, beneficiary_ref_hash = EXCLUDED.beneficiary_ref_hash, commodity = EXCLUDED.commodity, delivered_kg = EXCLUDED.delivered_kg, auth_mode = EXCLUDED.auth_mode, auth_result = EXCLUDED.auth_result, auth_txn_ref_hash = EXCLUDED.auth_txn_ref_hash, dealer_id = EXCLUDED.dealer_id, ledger_tx_id = EXCLUDED.ledger_tx_id, timestamp = EXCLUDED.timestamp',
      values: [
        distribution.distributionId,
        distribution.fpsId,
        distribution.rationCardHash,
        distribution.beneficiaryRefHash,
        distribution.commodity,
        distribution.deliveredKg,
        distribution.authMode,
        distribution.authResult,
        distribution.authTxnRefHash,
        distribution.dealerId,
        distribution.ledgerTxId ?? null,
        distribution.timestamp
      ]
    });
  }

  for (const alert of state.alerts) {
    statements.push({
      text: 'INSERT INTO audit_alerts (alert_id, alert_type, entity_id, risk_level, message, status, evidence, created_at, resolved_at, resolved_by, resolution_note) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11) ON CONFLICT (alert_id) DO UPDATE SET alert_type = EXCLUDED.alert_type, entity_id = EXCLUDED.entity_id, risk_level = EXCLUDED.risk_level, message = EXCLUDED.message, status = EXCLUDED.status, evidence = EXCLUDED.evidence, created_at = EXCLUDED.created_at, resolved_at = EXCLUDED.resolved_at, resolved_by = EXCLUDED.resolved_by, resolution_note = EXCLUDED.resolution_note',
      values: [
        alert.alertId,
        alert.alertType,
        alert.entityId,
        alert.riskLevel,
        alert.message,
        alert.status,
        json(alert.evidence),
        alert.createdAt,
        alert.resolvedAt ?? null,
        alert.resolvedBy ?? null,
        alert.resolutionNote ?? null
      ]
    });
  }

  for (const event of state.events) {
    statements.push({
      text: 'INSERT INTO ledger_events (ledger_tx_id, entity_type, entity_id, event_type, payload, timestamp) VALUES ($1, $2, $3, $4, $5::jsonb, $6) ON CONFLICT (ledger_tx_id) DO UPDATE SET entity_type = EXCLUDED.entity_type, entity_id = EXCLUDED.entity_id, event_type = EXCLUDED.event_type, payload = EXCLUDED.payload, timestamp = EXCLUDED.timestamp',
      values: [event.ledgerTxId, event.entityType, event.entityId, event.eventType, json(event.payload), event.timestamp]
    });
  }

  for (const indexedLedgerEvent of state.events) {
    statements.push({
      text: 'INSERT INTO ledger_tx_index (entity_type, entity_id, ledger_tx_id) VALUES ($1, $2, $3) ON CONFLICT (entity_type, entity_id) DO UPDATE SET ledger_tx_id = EXCLUDED.ledger_tx_id',
      values: [indexedLedgerEvent.entityType, indexedLedgerEvent.entityId, indexedLedgerEvent.ledgerTxId]
    });
  }

  statements.push({ text: 'COMMIT', values: [] });
  return statements;
};

export const hydratePdsState = (tables: PostgresTableRows): PdsLedgerState => ({
  stakeholders: tables.stakeholders ?? [],
  lots: (tables.lots ?? []).map((row) => row as PdsLedgerState['lots'][number]),
  transfers: tables.transfers ?? [],
  allocations: tables.allocations ?? [],
  entitlements: tables.entitlements ?? [],
  authTransactions: tables.authTransactions ?? [],
  distributions: tables.distributions ?? [],
  alerts: tables.alerts ?? [],
  events: tables.events ?? [],
  stock: []
});
