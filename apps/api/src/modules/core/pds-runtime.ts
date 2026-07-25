/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { dirname, resolve } from 'node:path';
import { PdsLedgerEngine } from '@pds/pds-chaincode';
import type { ChainQueryPort } from '../../infrastructure/chain-query-port.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from '../../infrastructure/ledger-port.js';
import { Pool, PoolClient } from 'pg';
import {
  mapStakeholderRow,
  mapLotRow,
  mapTransferRow,
  mapAllocationRow,
  mapEntitlementRow,
  mapDistributionRow,
  mapAlertRow,
  mapEventRow,
  mapAuthTransactionRow,
  hydratePdsState,
  type PostgresTableRows
} from '../../infrastructure/postgres-snapshot.js';
import {
  type LedgerEvent
} from '@pds/shared-types';
import { assertEligibilityGateOpen } from '../eligibility/eligibility-gate.js';

const asChainQueryPort = (port: PdsLedgerPort): ChainQueryPort | null => {
  const candidate = port as Partial<ChainQueryPort>;
  if (
    typeof candidate.getLotHistory === 'function' &&
    typeof candidate.getDistributionHistory === 'function' &&
    typeof candidate.verifyDatabaseHash === 'function'
  ) {
    return port as unknown as ChainQueryPort;
  }
  return null;
};

/**
 * Async wrapper around the (sync) {@link PdsLedgerEngine} that persists every
 * mutation through {@link PdsLedgerPort}. The ledger port interface is async
 * (T2.2), so every mutating override returns a Promise and callers must await.
 * Bootstrap from persistence is async-only — construct with
 * `{ deferBootstrap: true }` then `await bootstrapFromPersistenceAsync()`.
 */
@Injectable()
export class PdsRuntime extends PdsLedgerEngine {
  private readonly port: PdsLedgerPort;
  private readonly chainQuery: ChainQueryPort | null;
  private readonly seedOnBootstrap: boolean;
  private persistedEventCount = 0;
  private bootstrapped = false;
  private pendingPersist: Promise<void> = Promise.resolve();
  private suppressPersist = false;

  constructor(
    seed = true,
    portOrStatePath: PdsLedgerPort | string = new FilePdsLedgerPort(),
    options?: { deferBootstrap?: boolean }
  ) {
    super(false);
    this.seedOnBootstrap = seed;
    this.port =
      typeof portOrStatePath === 'string'
        ? new FilePdsLedgerPort(
            resolve(portOrStatePath),
            resolve(dirname(portOrStatePath), 'pds-ledger.ndjson')
          )
        : portOrStatePath;
    this.chainQuery = typeof portOrStatePath === 'string' ? null : asChainQueryPort(this.port);
    if (!options?.deferBootstrap) {
      throw new Error('PdsRuntime requires async bootstrap — pass { deferBootstrap: true } and await bootstrapFromPersistenceAsync()');
    }
  }

  protected getDbPool(): Pool | null {
    if (this.suppressPersist) {
      return null;
    }
    if (this.port && typeof (this.port as any).getPool === 'function') {
      return (this.port as any).getPool();
    }
    return null;
  }

  getOperationalPool(): Pool | null {
    return this.getDbPool();
  }

  async bootstrapFromPersistenceAsync(): Promise<void> {
    const pool = this.getDbPool();
    if (pool) {
      const res = await pool.query('SELECT COUNT(*) FROM stakeholders');
      const count = Number(res.rows[0].count);
      if (count === 0 && this.seedOnBootstrap) {
        this.withSuppressedPersist(() => this.seedDemoData());
        await this.persist();
      }
      this.bootstrapped = true;
      return;
    }

    const persisted = await this.port.loadState();
    if (persisted) {
      this.restoreState(persisted);
      this.persistedEventCount = persisted.events.length;
      this.bootstrapped = true;
      return;
    }
    if (this.seedOnBootstrap) {
      this.seedDemoData();
      await this.persist();
    }
    this.bootstrapped = true;
  }

  protected assertBootstrapped(): void {
    if (!this.bootstrapped) {
      throw new Error('PdsRuntime is not initialized yet');
    }
  }

  // ==========================================
  // Query Overrides
  // ==========================================

  override listStakeholders(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM stakeholders ORDER BY stakeholder_id').then(res => res.rows.map(mapStakeholderRow));
    }
    return super.listStakeholders();
  }

  getStakeholder(stakeholderId: string): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM stakeholders WHERE stakeholder_id = $1', [stakeholderId]).then(res => {
        if (res.rows.length === 0) {
          throw new Error(`Stakeholder ${stakeholderId} not found`);
        }
        return mapStakeholderRow(res.rows[0]);
      });
    }
    const list = this.listStakeholders();
    const stakeholder = list.find((s: any) => s.stakeholderId === stakeholderId);
    if (!stakeholder) {
      throw new Error(`Stakeholder ${stakeholderId} not found`);
    }
    return stakeholder;
  }

  override listLots(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM commodity_lots ORDER BY lot_id').then(res => res.rows.map(mapLotRow));
    }
    return super.listLots();
  }

  override getLot(lotId: string): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM commodity_lots WHERE lot_id = $1', [lotId]).then(res => {
        if (res.rows.length === 0) {
          throw new Error(`Lot ${lotId} not found`);
        }
        return mapLotRow(res.rows[0]);
      });
    }
    return super.getLot(lotId);
  }

  override listTransfers(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM transfer_orders ORDER BY dispatch_timestamp').then(res => res.rows.map(row => mapTransferRow(row)));
    }
    return super.listTransfers();
  }

  override getTransfer(transferId: string): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM transfer_orders WHERE transfer_id = $1', [transferId]).then(res => {
        if (res.rows.length === 0) {
          throw new Error(`Transfer order ${transferId} not found`);
        }
        return mapTransferRow(res.rows[0]);
      });
    }
    return super.getTransfer(transferId);
  }

  override listAllocations(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM fps_allocations ORDER BY month, allocation_id').then(res => res.rows.map(mapAllocationRow));
    }
    return super.listAllocations();
  }

  override getAllocation(allocationId: string): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM fps_allocations WHERE allocation_id = $1', [allocationId]).then(res => {
        if (res.rows.length === 0) {
          throw new Error(`Allocation ${allocationId} not found`);
        }
        return mapAllocationRow(res.rows[0]);
      });
    }
    return super.getAllocation(allocationId);
  }

  override listEntitlements(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM monthly_entitlements ORDER BY month, ration_card_hash, commodity').then(res => res.rows.map(mapEntitlementRow));
    }
    return super.listEntitlements();
  }

  override getEntitlement(rationCardHash: string, commodity: string, month: string): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM monthly_entitlements WHERE ration_card_hash = $1 AND commodity = $2 AND month = $3', [rationCardHash, commodity, month]).then(res => {
        if (res.rows.length === 0) {
          throw new Error(`Entitlement not found for ${rationCardHash} ${commodity} ${month}`);
        }
        return mapEntitlementRow(res.rows[0]);
      });
    }
    return super.getEntitlement(rationCardHash, commodity, month);
  }

  override listDistributions(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM distribution_transactions ORDER BY timestamp').then(res => res.rows.map(row => mapDistributionRow(row)));
    }
    return super.listDistributions();
  }

  override getDistributionReceipt(distributionId: string): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM distribution_transactions WHERE distribution_id = $1', [distributionId]).then(res => {
        if (res.rows.length === 0) {
          throw new Error(`Distribution ${distributionId} not found`);
        }
        return mapDistributionRow(res.rows[0]);
      });
    }
    return super.getDistributionReceipt(distributionId);
  }

  override listLedgerEvents(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM ledger_events ORDER BY timestamp').then(res => res.rows.map(row => mapEventRow(row)));
    }
    return super.listLedgerEvents();
  }

  override getAlerts(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM audit_alerts ORDER BY created_at').then(res => res.rows.map(row => mapAlertRow(row)));
    }
    return super.getAlerts();
  }

  override listAuthTransactions(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM auth_transactions ORDER BY timestamp').then(res => res.rows.map(row => mapAuthTransactionRow(row)));
    }
    return super.listAuthTransactions();
  }

  listStockPositions(): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query(
        'SELECT stakeholder_id, commodity, quantity_kg FROM stock_positions ORDER BY stakeholder_id, commodity'
      ).then(res => res.rows.map(row => ({
        entityId: String(row.stakeholder_id),
        commodity: String(row.commodity),
        quantityKg: Number(row.quantity_kg)
      })));
    }
    return this.exportState().stock.map(([key, quantityKg]) => {
      const separatorIndex = key.lastIndexOf(':');
      return { entityId: key.slice(0, separatorIndex), commodity: key.slice(separatorIndex + 1), quantityKg };
    });
  }

  override getDashboardSummary(): any {
    const pool = this.getDbPool();
    if (!pool) return super.getDashboardSummary();
    return Promise.all([
      pool.query('SELECT COALESCE(SUM(quantity_kg), 0)::bigint AS value FROM stock_positions'),
      pool.query("SELECT COUNT(*)::int AS value FROM commodity_lots WHERE status IN ('CREATED', 'DISPATCHED')"),
      pool.query('SELECT COUNT(*)::int AS value FROM distribution_transactions'),
      pool.query("SELECT COUNT(*)::int AS value FROM transfer_orders WHERE status = 'DISPATCHED'"),
      pool.query("SELECT COUNT(*)::int AS value FROM fps_allocations WHERE status = 'ALLOCATED'"),
      pool.query("SELECT COUNT(*)::int AS value FROM audit_alerts WHERE status <> 'RESOLVED'"),
      pool.query("SELECT DISTINCT entity_id FROM audit_alerts WHERE risk_level = 'HIGH' ORDER BY entity_id")
    ]).then(([stock, lots, distributions, transfers, allocations, alerts, highRisk]) => {
      const pendingTransferReceipts = Number(transfers.rows[0]?.value ?? 0);
      const pendingFpsAllocations = Number(allocations.rows[0]?.value ?? 0);
      return {
        trackedStockKg: Number(stock.rows[0]?.value ?? 0),
        activeLots: Number(lots.rows[0]?.value ?? 0),
        completedDistributions: Number(distributions.rows[0]?.value ?? 0),
        pendingTransferReceipts,
        pendingFpsAllocations,
        pendingReceipts: pendingTransferReceipts + pendingFpsAllocations,
        openAlerts: Number(alerts.rows[0]?.value ?? 0),
        highRiskFps: highRisk.rows.map(row => String(row.entity_id))
      };
    });
  }

  override getAuthTransaction(authTxnId: string): any {
    const pool = this.getDbPool();
    if (pool) {
      return pool.query('SELECT * FROM auth_transactions WHERE auth_txn_id = $1', [authTxnId]).then(res => {
        if (res.rows.length === 0) {
          throw new Error(`Auth transaction ${authTxnId} not found`);
        }
        return mapAuthTransactionRow(res.rows[0]);
      });
    }
    return super.getAuthTransaction(authTxnId);
  }

  // ==========================================
  // Transaction Mutation Helper Methods
  // ==========================================

  private async executeMutationTx<T>(
    pool: Pool,
    loadFn: (client: PoolClient) => Promise<PostgresTableRows>,
    runFn: (engine: PdsLedgerEngine) => T
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rows = await loadFn(client);
      const partialState = hydratePdsState(rows);
      const engine = new PdsLedgerEngine(false);
      engine.restoreState(partialState);
      const result = runFn(engine);
      const updatedState = engine.exportState();
      const newEvents = updatedState.events;
      await this.saveStateChanges(client, updatedState, newEvents);
      await client.query('COMMIT');
      return this.attachLedgerEventId(result, newEvents.at(-1)?.ledgerTxId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private attachLedgerEventId<T>(result: T, ledgerTxId?: string): T {
    if (!ledgerTxId || result === null || typeof result !== 'object' || Array.isArray(result)) return result;
    const object = result as Record<string, unknown>;
    if (object.ledgerTxId) return result;
    return { ...object, ledgerTxId } as T;
  }

  private attachLatestInMemoryEventId<T>(result: T): T {
    if (result !== null && typeof result === 'object' && (result as Record<string, unknown>).ledgerTxId) return result;
    return this.attachLedgerEventId(result, this.exportState().events.at(-1)?.ledgerTxId);
  }

  private async saveStateChanges(client: PoolClient, state: any, newEvents: LedgerEvent[]): Promise<void> {
    for (const stakeholder of state.stakeholders) {
      await client.query(
        `INSERT INTO stakeholders (stakeholder_id, stakeholder_type, name, district, license_no, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (stakeholder_id) DO UPDATE SET
           stakeholder_type = EXCLUDED.stakeholder_type,
           name = EXCLUDED.name,
           district = EXCLUDED.district,
           license_no = EXCLUDED.license_no,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [stakeholder.stakeholderId, stakeholder.stakeholderType, stakeholder.name, stakeholder.district, stakeholder.licenseNo, stakeholder.status]
      );
    }

    for (const lot of state.lots) {
      await client.query(
        `INSERT INTO commodity_lots (lot_id, commodity, season, quantity_kg, quality_grade, source, current_owner, current_location, status, root_lot_id, parent_lot_id, original_quantity_kg, remaining_quantity_kg, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, 0))
         ON CONFLICT (lot_id) DO UPDATE SET
           commodity = EXCLUDED.commodity,
           season = EXCLUDED.season,
           quantity_kg = EXCLUDED.quantity_kg,
           quality_grade = EXCLUDED.quality_grade,
           source = EXCLUDED.source,
           current_owner = EXCLUDED.current_owner,
           current_location = EXCLUDED.current_location,
           status = EXCLUDED.status,
           root_lot_id = EXCLUDED.root_lot_id,
           parent_lot_id = EXCLUDED.parent_lot_id,
           original_quantity_kg = EXCLUDED.original_quantity_kg,
           remaining_quantity_kg = EXCLUDED.remaining_quantity_kg,
           version = COALESCE(commodity_lots.version, 0) + 1`,
        [
          lot.lotId, lot.commodity, lot.season, lot.quantityKg, lot.qualityGrade, lot.source,
          lot.currentOwner, lot.currentLocation, lot.status, lot.rootLotId || null, lot.parentLotId || null,
          lot.originalQuantityKg ?? null, lot.remainingQuantityKg ?? null, lot.version ?? null
        ]
      );
    }

    for (const transfer of state.transfers) {
      await client.query(
        `INSERT INTO transfer_orders (transfer_id, lot_id, from_org, to_org, dispatched_qty_kg, received_qty_kg, shortage_qty_kg, vehicle_no, status, dispatch_timestamp, receive_timestamp, stage, ro_ref, authorized_by, authorized_at, approval_status, transporter_id, transporter_name, transformed_from_lot_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (transfer_id) DO UPDATE SET
           lot_id = EXCLUDED.lot_id,
           from_org = EXCLUDED.from_org,
           to_org = EXCLUDED.to_org,
           dispatched_qty_kg = EXCLUDED.dispatched_qty_kg,
           received_qty_kg = EXCLUDED.received_qty_kg,
           shortage_qty_kg = EXCLUDED.shortage_qty_kg,
           vehicle_no = EXCLUDED.vehicle_no,
           status = EXCLUDED.status,
           dispatch_timestamp = EXCLUDED.dispatch_timestamp,
           receive_timestamp = EXCLUDED.receive_timestamp,
           stage = EXCLUDED.stage,
           ro_ref = EXCLUDED.ro_ref,
           authorized_by = EXCLUDED.authorized_by,
           authorized_at = EXCLUDED.authorized_at,
           approval_status = EXCLUDED.approval_status,
           transporter_id = EXCLUDED.transporter_id,
           transporter_name = EXCLUDED.transporter_name,
           transformed_from_lot_id = EXCLUDED.transformed_from_lot_id`,
        [
          transfer.transferId, transfer.lotId, transfer.fromOrg, transfer.toOrg,
          transfer.dispatchedQtyKg, transfer.receivedQtyKg ?? null, transfer.shortageQtyKg ?? null,
          transfer.vehicleNo, transfer.status, transfer.dispatchTimestamp, transfer.receiveTimestamp ?? null,
          transfer.stage ?? null, transfer.roRef ?? null, transfer.authorizedBy ?? null,
          transfer.authorizedAt ?? null, transfer.approvalStatus ?? null,
          transfer.transporterId, transfer.transporterName, transfer.transformedFromLotId ?? null
        ]
      );
    }

    for (const allocation of state.allocations) {
      await client.query(
        `INSERT INTO fps_allocations (allocation_id, fps_id, commodity, allocated_qty_kg, received_qty_kg, shortage_qty_kg, month, source_godown_id, status, transporter_id, transporter_name, vehicle_no, dispatch_timestamp, receive_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (allocation_id) DO UPDATE SET
           fps_id = EXCLUDED.fps_id,
           commodity = EXCLUDED.commodity,
           allocated_qty_kg = EXCLUDED.allocated_qty_kg,
           received_qty_kg = EXCLUDED.received_qty_kg,
           shortage_qty_kg = EXCLUDED.shortage_qty_kg,
           month = EXCLUDED.month,
           source_godown_id = EXCLUDED.source_godown_id,
           status = EXCLUDED.status,
           transporter_id = EXCLUDED.transporter_id,
           transporter_name = EXCLUDED.transporter_name,
           vehicle_no = EXCLUDED.vehicle_no,
           dispatch_timestamp = EXCLUDED.dispatch_timestamp,
           receive_timestamp = EXCLUDED.receive_timestamp`,
        [
          allocation.allocationId, allocation.fpsId, allocation.commodity, allocation.allocatedQtyKg,
          allocation.receivedQtyKg ?? null, allocation.shortageQtyKg ?? null, allocation.month,
          allocation.sourceGodownId, allocation.status, allocation.transporterId, allocation.transporterName,
          allocation.vehicleNo, allocation.dispatchTimestamp, allocation.receiveTimestamp ?? null
        ]
      );
    }

    for (const entitlement of state.entitlements) {
      await client.query(
        `INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
         ON CONFLICT (ration_card_hash, commodity, month) DO UPDATE SET
           monthly_entitlement_kg = EXCLUDED.monthly_entitlement_kg,
           already_lifted_kg = EXCLUDED.already_lifted_kg,
           available_balance_kg = EXCLUDED.available_balance_kg,
           active = EXCLUDED.active,
           version = monthly_entitlements.version + 1`,
        [
          entitlement.rationCardHash, entitlement.commodity, entitlement.month,
          entitlement.monthlyEntitlementKg, entitlement.alreadyLiftedKg, entitlement.availableBalanceKg,
          entitlement.active
        ]
      );
    }

    for (const authTransaction of state.authTransactions) {
      await client.query(
        `INSERT INTO auth_transactions (auth_txn_id, fps_id, operator_ref, beneficiary_ref_hash, ration_card_hash, auth_mode, auth_result, auth_txn_ref_hash, approved_by, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (auth_txn_id) DO NOTHING`,
        [
          authTransaction.authTxnId, authTransaction.fpsId ?? null, authTransaction.operatorRef ?? null,
          authTransaction.beneficiaryRefHash, authTransaction.rationCardHash,
          authTransaction.authMode, authTransaction.authResult, authTransaction.authTxnRefHash,
          authTransaction.approvedBy ?? null, authTransaction.timestamp
        ]
      );
    }

    for (const distribution of state.distributions) {
      await client.query(
        `INSERT INTO distribution_transactions (distribution_id, fps_id, ration_card_hash, beneficiary_ref_hash, commodity, delivered_kg, auth_mode, auth_result, auth_txn_ref_hash, dealer_id, ledger_tx_id, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (distribution_id) DO NOTHING`,
        [
          distribution.distributionId, distribution.fpsId, distribution.rationCardHash,
          distribution.beneficiaryRefHash, distribution.commodity, distribution.deliveredKg,
          distribution.authMode, distribution.authResult, distribution.authTxnRefHash,
          distribution.dealerId, distribution.ledgerTxId ?? null, distribution.timestamp
        ]
      );
    }

    for (const [stockKey, quantityKg] of state.stock) {
      const separatorIndex = stockKey.lastIndexOf(':');
      const stakeholderId = stockKey.slice(0, separatorIndex);
      const commodity = stockKey.slice(separatorIndex + 1);
      const updated = await client.query(
        `UPDATE stock_positions
         SET quantity_kg = $3, version = version + 1, updated_at = NOW()
         WHERE stakeholder_id = $1 AND commodity = $2 AND lot_id IS NULL AND month IS NULL`,
        [stakeholderId, commodity, quantityKg]
      );
      if (updated.rowCount === 0) {
        await client.query(
          `INSERT INTO stock_positions (stakeholder_id, commodity, quantity_kg, lot_id, month, version)
           VALUES ($1, $2, $3, NULL, NULL, 1)`,
          [stakeholderId, commodity, quantityKg]
        );
      }
    }

    for (const alert of state.alerts) {
      await client.query(
        `INSERT INTO audit_alerts (alert_id, alert_type, entity_id, risk_level, message, status, evidence, created_at, resolved_at, resolved_by, resolution_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
         ON CONFLICT (alert_id) DO UPDATE SET
           alert_type = EXCLUDED.alert_type,
           entity_id = EXCLUDED.entity_id,
           risk_level = EXCLUDED.risk_level,
           message = EXCLUDED.message,
           status = EXCLUDED.status,
           evidence = EXCLUDED.evidence,
           created_at = EXCLUDED.created_at,
           resolved_at = EXCLUDED.resolved_at,
           resolved_by = EXCLUDED.resolved_by,
           resolution_note = EXCLUDED.resolution_note`,
        [
          alert.alertId, alert.alertType, alert.entityId, alert.riskLevel, alert.message, alert.status,
          JSON.stringify(alert.evidence), alert.createdAt, alert.resolvedAt ?? null, alert.resolvedBy ?? null,
          alert.resolutionNote ?? null
        ]
      );
    }

    for (const event of newEvents) {
      await client.query(
        `INSERT INTO ledger_events (ledger_tx_id, entity_type, entity_id, event_type, payload, timestamp)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (ledger_tx_id) DO NOTHING`,
        [event.ledgerTxId, event.entityType, event.entityId, event.eventType, JSON.stringify(event.payload), event.timestamp]
      );

      await client.query(
        `INSERT INTO ledger_tx_index (entity_type, entity_id, ledger_tx_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET ledger_tx_id = EXCLUDED.ledger_tx_id`,
        [event.entityType, event.entityId, event.ledgerTxId]
      );

      await client.query(
        `INSERT INTO ledger_outbox (event_id, operation_id, idempotency_key, schema_version, event_payload, status)
         VALUES ($1, $1, $1, 1, $2::jsonb, 'PENDING')
         ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
        [event.ledgerTxId, JSON.stringify(event)]
      );
    }
  }

  // ==========================================
  // Mutating Overrides
  // ==========================================

  override registerStakeholder(...args: Parameters<PdsLedgerEngine['registerStakeholder']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.registerStakeholder(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const res = await client.query('SELECT * FROM stakeholders WHERE stakeholder_id = $1 FOR UPDATE', [input.stakeholderId]);
        return { stakeholders: res.rows.map(mapStakeholderRow) };
      },
      (engine) => engine.registerStakeholder(input)
    ) as any;
  }

  override createCommodityLot(...args: Parameters<PdsLedgerEngine['createCommodityLot']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.createCommodityLot(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const [lotRes, stakeholderRes, stockRes] = await Promise.all([
          client.query('SELECT * FROM commodity_lots WHERE lot_id = $1 FOR UPDATE', [input.lotId]),
          client.query('SELECT * FROM stakeholders WHERE stakeholder_id = $1 FOR UPDATE', [input.currentOwner]),
          client.query(
            'SELECT * FROM stock_positions WHERE stakeholder_id = $1 AND commodity = $2 AND lot_id IS NULL AND month IS NULL FOR UPDATE',
            [input.currentOwner, input.commodity]
          )
        ]);
        return {
          lots: lotRes.rows.map(mapLotRow),
          stakeholders: stakeholderRes.rows.map(mapStakeholderRow),
          stock: stockRes.rows.map(r => [`${r.stakeholder_id}:${r.commodity}`, Number(r.quantity_kg)] as const)
        };
      },
      (engine) => engine.createCommodityLot(input)
    ) as any;
  }

  override dispatchLot(...args: Parameters<PdsLedgerEngine['dispatchLot']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.dispatchLot(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const lotResQuery = await client.query('SELECT commodity FROM commodity_lots WHERE lot_id = $1', [input.lotId]);
        const commodity = lotResQuery.rows[0]?.commodity || '';

        const [lotRes, stakeholderRes, stockRes, transferRes, authorizationEventRes] = await Promise.all([
          client.query('SELECT * FROM commodity_lots WHERE lot_id = $1 FOR UPDATE', [input.lotId]),
          client.query('SELECT * FROM stakeholders WHERE stakeholder_id IN ($1, $2) FOR UPDATE', [input.fromOrg, input.toOrg]),
          client.query(
            'SELECT * FROM stock_positions WHERE stakeholder_id = $1 AND commodity = $2 AND lot_id IS NULL AND month IS NULL FOR UPDATE',
            [input.fromOrg, commodity]
          ),
          client.query('SELECT * FROM transfer_orders WHERE transfer_id = $1 FOR UPDATE', [input.transferId]),
          client.query(
            "SELECT * FROM ledger_events WHERE entity_id = $1 AND event_type = 'AuthorizeMovement' ORDER BY timestamp FOR UPDATE",
            [input.transferId]
          )
        ]);
        return {
          lots: lotRes.rows.map(mapLotRow),
          stakeholders: stakeholderRes.rows.map(mapStakeholderRow),
          stock: stockRes.rows.map(r => [`${r.stakeholder_id}:${r.commodity}`, Number(r.quantity_kg)] as const),
          transfers: transferRes.rows.map(r => mapTransferRow(r)),
          events: authorizationEventRes.rows.map(r => mapEventRow(r))
        };
      },
      (engine) => engine.dispatchLot(input)
    ) as any;
  }

  override authorizeMovement(...args: Parameters<PdsLedgerEngine['authorizeMovement']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.authorizeMovement(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const [transferRes, approverRes] = await Promise.all([
          client.query('SELECT * FROM transfer_orders WHERE transfer_id = $1 FOR UPDATE', [input.transferId]),
          client.query('SELECT * FROM stakeholders WHERE stakeholder_id = $1 FOR UPDATE', [input.authorizedBy])
        ]);
        return {
          transfers: transferRes.rows.map(r => mapTransferRow(r)),
          stakeholders: approverRes.rows.map(mapStakeholderRow)
        };
      },
      (engine) => engine.authorizeMovement(input)
    ) as any;
  }

  override receiveLot(...args: Parameters<PdsLedgerEngine['receiveLot']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.receiveLot(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const transferQuery = await client.query('SELECT lot_id, to_org FROM transfer_orders WHERE transfer_id = $1', [input.transferId]);
        const transferData = transferQuery.rows[0];
        const lotId = transferData?.lot_id || '';
        const toOrg = transferData?.to_org || '';

        const lotQuery = await client.query('SELECT commodity FROM commodity_lots WHERE lot_id = $1', [lotId]);
        const commodity = lotQuery.rows[0]?.commodity || '';

        const [transferRes, lotRes, stockRes] = await Promise.all([
          client.query('SELECT * FROM transfer_orders WHERE transfer_id = $1 FOR UPDATE', [input.transferId]),
          client.query('SELECT * FROM commodity_lots WHERE lot_id = $1 FOR UPDATE', [lotId]),
          client.query(
            'SELECT * FROM stock_positions WHERE stakeholder_id = $1 AND commodity = $2 AND lot_id IS NULL AND month IS NULL FOR UPDATE',
            [toOrg, commodity]
          )
        ]);

        return {
          transfers: transferRes.rows.map(r => mapTransferRow(r)),
          lots: lotRes.rows.map(mapLotRow),
          stock: stockRes.rows.map(r => [`${r.stakeholder_id}:${r.commodity}`, Number(r.quantity_kg)] as const)
        };
      },
      (engine) => engine.receiveLot(input)
    ) as any;
  }

  override allocateToFps(...args: Parameters<PdsLedgerEngine['allocateToFps']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.allocateToFps(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const [godownRes, fpsRes, stockRes, allocationRes] = await Promise.all([
          client.query('SELECT * FROM stakeholders WHERE stakeholder_id = $1 FOR UPDATE', [input.sourceGodownId]),
          client.query('SELECT * FROM stakeholders WHERE stakeholder_id = $1 FOR UPDATE', [input.fpsId]),
          client.query(
            'SELECT * FROM stock_positions WHERE stakeholder_id = $1 AND commodity = $2 AND lot_id IS NULL AND month IS NULL FOR UPDATE',
            [input.sourceGodownId, input.commodity]
          ),
          client.query('SELECT * FROM fps_allocations WHERE allocation_id = $1 FOR UPDATE', [input.allocationId])
        ]);
        return {
          stakeholders: [...godownRes.rows, ...fpsRes.rows].map(mapStakeholderRow),
          stock: stockRes.rows.map(r => [`${r.stakeholder_id}:${r.commodity}`, Number(r.quantity_kg)] as const),
          allocations: allocationRes.rows.map(mapAllocationRow)
        };
      },
      (engine) => engine.allocateToFps(input)
    ) as any;
  }

  override recordFpsReceipt(...args: Parameters<PdsLedgerEngine['recordFpsReceipt']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.recordFpsReceipt(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const allocQuery = await client.query('SELECT fps_id, commodity FROM fps_allocations WHERE allocation_id = $1', [input.allocationId]);
        const allocData = allocQuery.rows[0];
        const fpsId = allocData?.fps_id || '';
        const commodity = allocData?.commodity || '';

        const [allocationRes, stockRes] = await Promise.all([
          client.query('SELECT * FROM fps_allocations WHERE allocation_id = $1 FOR UPDATE', [input.allocationId]),
          client.query(
            'SELECT * FROM stock_positions WHERE stakeholder_id = $1 AND commodity = $2 AND lot_id IS NULL AND month IS NULL FOR UPDATE',
            [fpsId, commodity]
          )
        ]);
        return {
          allocations: allocationRes.rows.map(mapAllocationRow),
          stock: stockRes.rows.map(r => [`${r.stakeholder_id}:${r.commodity}`, Number(r.quantity_kg)] as const)
        };
      },
      (engine) => engine.recordFpsReceipt(input)
    ) as any;
  }

  override simulateAuthentication(...args: Parameters<PdsLedgerEngine['simulateAuthentication']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.simulateAuthentication(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const authRes = await client.query('SELECT * FROM auth_transactions WHERE auth_txn_id = $1 FOR UPDATE', [input.authTxnId]);
        return {
          authTransactions: authRes.rows.map(r => mapAuthTransactionRow(r))
        };
      },
      (engine) => engine.simulateAuthentication(input)
    ) as any;
  }

  override createOrUpdateEntitlement(...args: Parameters<PdsLedgerEngine['createOrUpdateEntitlement']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.createOrUpdateEntitlement(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const entitlementRes = await client.query(
          'SELECT * FROM monthly_entitlements WHERE ration_card_hash = $1 AND commodity = $2 AND month = $3 FOR UPDATE',
          [input.rationCardHash, input.commodity, input.month]
        );
        return {
          entitlements: entitlementRes.rows.map(mapEntitlementRow)
        };
      },
      (engine) => engine.createOrUpdateEntitlement(input)
    ) as any;
  }

  override validateEntitlement(...args: Parameters<PdsLedgerEngine['validateEntitlement']>) {
    assertEligibilityGateOpen(args[0].rationCardHash);
    return super.validateEntitlement(...args);
  }

  override recordDistribution(...args: Parameters<PdsLedgerEngine['recordDistribution']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.recordDistribution(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const month = (input.timestamp || new Date().toISOString()).slice(0, 7);
        const [distRes, entitlementRes, stockRes] = await Promise.all([
          client.query('SELECT * FROM distribution_transactions WHERE distribution_id = $1 FOR UPDATE', [input.distributionId]),
          client.query(
            'SELECT * FROM monthly_entitlements WHERE ration_card_hash = $1 AND commodity = $2 AND month = $3 FOR UPDATE',
            [input.rationCardHash, input.commodity, month]
          ),
          client.query(
            'SELECT * FROM stock_positions WHERE stakeholder_id = $1 AND commodity = $2 AND lot_id IS NULL AND month IS NULL FOR UPDATE',
            [input.fpsId, input.commodity]
          )
        ]);
        return {
          distributions: distRes.rows.map(r => mapDistributionRow(r)),
          entitlements: entitlementRes.rows.map(mapEntitlementRow),
          stock: stockRes.rows.map(r => [`${r.stakeholder_id}:${r.commodity}`, Number(r.quantity_kg)] as const)
        };
      },
      (engine) => engine.recordDistribution(input)
    ) as any;
  }

  override reconcileAlerts(...args: Parameters<PdsLedgerEngine['reconcileAlerts']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.reconcileAlerts(...args);
      this.persistAfterMutation();
      return result;
    }
    return this.executeMutationTx(
      pool,
      async (client) => {
        const [distRes, entitlementRes, alertRes] = await Promise.all([
          client.query('SELECT * FROM distribution_transactions'),
          client.query('SELECT * FROM monthly_entitlements'),
          client.query('SELECT * FROM audit_alerts FOR UPDATE')
        ]);
        return {
          distributions: distRes.rows.map(r => mapDistributionRow(r)),
          entitlements: entitlementRes.rows.map(mapEntitlementRow),
          alerts: alertRes.rows.map(r => mapAlertRow(r))
        };
      },
      (engine) => engine.reconcileAlerts()
    ) as any;
  }

  override resolveAuditAlert(...args: Parameters<PdsLedgerEngine['resolveAuditAlert']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.resolveAuditAlert(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (client) => {
        const alertRes = await client.query('SELECT * FROM audit_alerts WHERE alert_id = $1 FOR UPDATE', [input.alertId]);
        return {
          alerts: alertRes.rows.map(r => mapAlertRow(r))
        };
      },
      (engine) => engine.resolveAuditAlert(input)
    ) as any;
  }

  override raiseAuditFlag(...args: Parameters<PdsLedgerEngine['raiseAuditFlag']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = super.raiseAuditFlag(...args);
      this.persistAfterMutation();
      return result;
    }
    const input = args[0];
    return this.executeMutationTx(
      pool,
      async (_client) => {
        return {};
      },
      (engine) => engine.raiseAuditFlag(input)
    ) as any;
  }

  override resetTransactionalData(...args: Parameters<PdsLedgerEngine['resetTransactionalData']>) {
    const pool = this.getDbPool();
    if (!pool) {
      const result = this.withSuppressedPersist(() => super.resetTransactionalData(...args));
      this.persistedEventCount = 0;
      this.persistAfterMutation();
      return result;
    }
    return (async () => {
      const client = await pool.connect();
      let stakeholders: any[] = [];
      try {
        await client.query('BEGIN');
        await client.query(
          'TRUNCATE integration_event_attempts, integration_events, commodity_lots, stock_positions, transfer_orders, fps_allocations, monthly_entitlements, auth_transactions, distribution_transactions, audit_alerts, ledger_events, ledger_tx_index RESTART IDENTITY CASCADE'
        );
        const stakeholdersRes = await client.query('SELECT * FROM stakeholders');
        stakeholders = stakeholdersRes.rows.map(row => mapStakeholderRow(row));
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      this.restoreState({
        stakeholders,
        lots: [],
        transfers: [],
        allocations: [],
        entitlements: [],
        authTransactions: [],
        distributions: [],
        alerts: [],
        events: [],
        stock: [],
        rationCards: [],
        grievances: [],
        entitlementRules: []
      } as any);
      const result = this.withSuppressedPersist(() => super.resetTransactionalData(...args));
      this.persistedEventCount = 0;
      this.persistAfterMutation();
      return result;
    })() as any;
  }

  // ==========================================
  // Persisted Wrappers (Compatibility)
  // ==========================================

  async registerStakeholderPersisted(...args: Parameters<PdsLedgerEngine['registerStakeholder']>) {
    const result = await this.registerStakeholder(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async createCommodityLotPersisted(...args: Parameters<PdsLedgerEngine['createCommodityLot']>) {
    const result = await this.createCommodityLot(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async dispatchLotPersisted(...args: Parameters<PdsLedgerEngine['dispatchLot']>) {
    const result = await this.dispatchLot(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async authorizeMovementPersisted(...args: Parameters<PdsLedgerEngine['authorizeMovement']>) {
    const result = await this.authorizeMovement(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async receiveLotPersisted(...args: Parameters<PdsLedgerEngine['receiveLot']>) {
    const result = await this.receiveLot(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async allocateToFpsPersisted(...args: Parameters<PdsLedgerEngine['allocateToFps']>) {
    const result = await this.allocateToFps(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async recordFpsReceiptPersisted(...args: Parameters<PdsLedgerEngine['recordFpsReceipt']>) {
    const result = await this.recordFpsReceipt(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async simulateAuthenticationPersisted(...args: Parameters<PdsLedgerEngine['simulateAuthentication']>) {
    const result = await this.simulateAuthentication(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async createOrUpdateEntitlementPersisted(...args: Parameters<PdsLedgerEngine['createOrUpdateEntitlement']>) {
    const result = await this.createOrUpdateEntitlement(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async recordDistributionPersisted(...args: Parameters<PdsLedgerEngine['recordDistribution']>) {
    const result = await this.recordDistribution(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async reconcileAlertsPersisted(...args: Parameters<PdsLedgerEngine['reconcileAlerts']>) {
    const result = await this.reconcileAlerts(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async resolveAuditAlertPersisted(...args: Parameters<PdsLedgerEngine['resolveAuditAlert']>) {
    const result = await this.resolveAuditAlert(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async raiseAuditFlagPersisted(...args: Parameters<PdsLedgerEngine['raiseAuditFlag']>) {
    const result = await this.raiseAuditFlag(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  async resetTransactionalDataPersisted(...args: Parameters<PdsLedgerEngine['resetTransactionalData']>) {
    const result = await this.resetTransactionalData(...args);
    await this.flushPersist();
    return this.attachLatestInMemoryEventId(result);
  }

  override getLotHistory(lotId: string) {
    return this.chainQuery?.getLotHistory(lotId) ?? super.getLotHistory(lotId);
  }

  override getTraceForLot(lotId: string) {
    const trace = super.getTraceForLot(lotId);
    if (!this.chainQuery) {
      return trace;
    }
    return {
      ...trace,
      history: this.chainQuery.getLotHistory(lotId),
      verificationSource: 'chaincode'
    };
  }

  async getTraceForLotFromChain(lotId: string) {
    const trace = super.getTraceForLot(lotId);
    if (!this.chainQuery) {
      return trace;
    }
    return {
      ...trace,
      history: await this.chainQuery.getLotHistory(lotId),
      verificationSource: 'chaincode'
    };
  }

  getDistributionHistoryFromChain(distributionId: string) {
    return this.chainQuery?.getDistributionHistory(distributionId) ?? this.getDistributionHistory(distributionId);
  }

  async getDistributionHistoryFromChainAsync(distributionId: string) {
    return this.chainQuery
      ? await this.chainQuery.getDistributionHistory(distributionId)
      : this.getDistributionHistory(distributionId);
  }

  verifyLedgerDigest(digest: string) {
    return this.chainQuery?.verifyDatabaseHash(digest) ?? { match: false, ledgerDigest: '' };
  }

  /**
   * Persist the current state + newly appended events. The engine mutation has
   * already happened in-memory; the async write is chained onto any in-flight
   * persist so writes are ordered. Callers that need to observe the persisted
   * file (e.g. tests) must `await runtime.flushPersist()`.
   */
  protected persist(): Promise<void> {
    const state = this.exportState();
    const newEvents = state.events.slice(this.persistedEventCount);
    this.persistedEventCount = state.events.length;
    this.pendingPersist = this.pendingPersist
      .catch(() => undefined)
      .then(() => this.port.saveState(state))
      .then(() => this.port.appendEvents(newEvents));
    return this.pendingPersist;
  }

  private persistAfterMutation(): void {
    if (!this.suppressPersist) {
      void this.persist().catch(() => undefined);
    }
  }

  private withSuppressedPersist<T>(callback: () => T): T {
    const previous = this.suppressPersist;
    this.suppressPersist = true;
    try {
      return callback();
    } finally {
      this.suppressPersist = previous;
    }
  }

  /** Await any in-flight persist so tests can assert on persisted files. */
  async flushPersist(): Promise<void> {
    await this.pendingPersist;
  }
}
