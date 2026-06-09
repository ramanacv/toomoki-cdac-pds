import { randomUUID } from 'node:crypto';
import {
  AlertType,
  AuthMode,
  AuthResult,
  CommodityLot,
  DashboardSummary,
  DemoSnapshot,
  DistributionTransaction,
  FPSAllocation,
  LedgerEvent,
  LotStatus,
  MonthlyEntitlement,
  AuthTransaction,
  Stakeholder,
  StakeholderStatus,
  StakeholderType,
  TransferOrder,
  TransferStatus,
  AuditAlert,
  hashReference,
  makeTimestamp
} from '@pds/shared-types';

type StockKey = `${string}:${string}`;

export type PdsLedgerState = {
  stakeholders: Stakeholder[];
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  entitlements: MonthlyEntitlement[];
  authTransactions: AuthTransaction[];
  distributions: DistributionTransaction[];
  alerts: AuditAlert[];
  events: LedgerEvent[];
  stock: Array<[StockKey, number]>;
};

const keyFor = (entityId: string, commodity: string): StockKey => `${entityId}:${commodity}`;

const sortByTime = <T>(entries: T[]): T[] =>
  [...entries].sort((a, b) => {
    const left = ((a as { timestamp?: string; createdAt?: string }).timestamp ?? (a as { timestamp?: string; createdAt?: string }).createdAt ?? '');
    const right = ((b as { timestamp?: string; createdAt?: string }).timestamp ?? (b as { timestamp?: string; createdAt?: string }).createdAt ?? '');
    return left.localeCompare(right);
  });

export class PdsLedgerEngine {
  private stakeholders = new Map<string, Stakeholder>();
  private lots = new Map<string, CommodityLot>();
  private transfers = new Map<string, TransferOrder>();
  private allocations = new Map<string, FPSAllocation>();
  private entitlements = new Map<string, MonthlyEntitlement>();
  private authTransactions = new Map<string, AuthTransaction>();
  private distributions = new Map<string, DistributionTransaction>();
  private alerts = new Map<string, AuditAlert>();
  private events: LedgerEvent[] = [];
  private stock = new Map<StockKey, number>();

  constructor(seed = true) {
    if (seed) {
      this.seedDemoData();
    }
  }

  exportState(): PdsLedgerState {
    return {
      stakeholders: [...this.stakeholders.values()],
      lots: [...this.lots.values()],
      transfers: [...this.transfers.values()],
      allocations: [...this.allocations.values()],
      entitlements: [...this.entitlements.values()],
      authTransactions: [...this.authTransactions.values()],
      distributions: [...this.distributions.values()],
      alerts: [...this.alerts.values()],
      events: [...this.events],
      stock: [...this.stock.entries()]
    };
  }

  restoreState(state: PdsLedgerState): void {
    this.stakeholders = new Map(state.stakeholders.map((item) => [item.stakeholderId, item]));
    this.lots = new Map(state.lots.map((item) => [item.lotId, item]));
    this.transfers = new Map(state.transfers.map((item) => [item.transferId, item]));
    this.allocations = new Map(state.allocations.map((item) => [item.allocationId, item]));
    this.entitlements = new Map(state.entitlements.map((item) => [this.entitlementKey(item.rationCardHash, item.commodity, item.month), item]));
    this.authTransactions = new Map(state.authTransactions.map((item) => [item.authTxnId, item]));
    this.distributions = new Map(state.distributions.map((item) => [item.distributionId, item]));
    this.alerts = new Map(state.alerts.map((item) => [item.alertId, item]));
    this.events = [...state.events];
    this.stock = new Map(state.stock);
  }

  seedDemoData(): DemoSnapshot {
    if (this.stakeholders.size > 0) {
      return this.snapshot();
    }

    [
      {
        stakeholderId: 'PROC-001',
        stakeholderType: StakeholderType.PROCUREMENT_CENTER,
        name: 'Procurement Centre 01',
        district: 'Demo District',
        licenseNo: 'PROC-LIC-001',
        status: StakeholderStatus.ACTIVE
      },
      {
        stakeholderId: 'MLL-001',
        stakeholderType: StakeholderType.MILLER,
        name: 'Miller 01',
        district: 'Demo District',
        licenseNo: 'MLL-LIC-001',
        status: StakeholderStatus.ACTIVE
      },
      {
        stakeholderId: 'GODOWN-S-001',
        stakeholderType: StakeholderType.STATE_GODOWN,
        name: 'State Godown 01',
        district: 'Demo District',
        licenseNo: 'SG-LIC-001',
        status: StakeholderStatus.ACTIVE
      },
      {
        stakeholderId: 'GODOWN-B-001',
        stakeholderType: StakeholderType.BLOCK_GODOWN,
        name: 'Block Godown 01',
        district: 'Demo District',
        licenseNo: 'BG-LIC-001',
        status: StakeholderStatus.ACTIVE
      },
      {
        stakeholderId: 'FPS-101',
        stakeholderType: StakeholderType.FAIR_PRICE_SHOP,
        name: 'FPS 101',
        district: 'Demo District',
        licenseNo: 'FPS-LIC-101',
        status: StakeholderStatus.ACTIVE
      },
      {
        stakeholderId: 'FOOD-001',
        stakeholderType: StakeholderType.DEPARTMENT,
        name: 'Food Department',
        district: 'Demo District',
        licenseNo: 'FD-LIC-001',
        status: StakeholderStatus.ACTIVE
      },
      {
        stakeholderId: 'AUD-001',
        stakeholderType: StakeholderType.AUDITOR,
        name: 'Auditor 01',
        district: 'Demo District',
        licenseNo: 'AUD-LIC-001',
        status: StakeholderStatus.ACTIVE
      }
    ].forEach((stakeholder) => this.stakeholders.set(stakeholder.stakeholderId, stakeholder));

    const lot = this.createCommodityLot({
      lotId: 'LOT-RICE-2026-001',
      commodity: 'Rice',
      season: 'Kharif 2026',
      quantityKg: 10000,
      qualityGrade: 'A',
      source: 'Procurement Centre 01',
      currentOwner: 'PROC-001',
      currentLocation: 'Procurement Yard'
    });

    this.stock.set(keyFor('PROC-001', 'Rice'), lot.quantityKg);
    this.entitlements.set('demo-ration-card-hash:Rice:2026-06', {
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Rice',
      month: '2026-06',
      monthlyEntitlementKg: 25,
      alreadyLiftedKg: 0,
      availableBalanceKg: 25,
      active: true
    });

    return this.snapshot();
  }

  snapshot(): DemoSnapshot {
    return {
      stakeholders: [...this.stakeholders.values()],
      lots: [...this.lots.values()],
      transfers: [...this.transfers.values()],
      allocations: [...this.allocations.values()],
      entitlements: [...this.entitlements.values()],
      distributions: [...this.distributions.values()],
      alerts: [...this.alerts.values()]
    };
  }

  listStakeholders(): Stakeholder[] {
    return sortByTime([...this.stakeholders.values()]);
  }

  registerStakeholder(stakeholder: Stakeholder): { stakeholder: Stakeholder; ledgerTxId: string } {
    if (this.stakeholders.has(stakeholder.stakeholderId)) {
      throw new Error(`Stakeholder ${stakeholder.stakeholderId} already exists`);
    }
    this.stakeholders.set(stakeholder.stakeholderId, stakeholder);
    const { ledgerTxId } = this.recordEvent('stakeholder', stakeholder.stakeholderId, 'RegisterStakeholder', stakeholder);
    return { stakeholder, ledgerTxId };
  }

  createCommodityLot(input: Omit<CommodityLot, 'status'>): CommodityLot {
    this.assertActiveStakeholder(input.currentOwner);
    const lot: CommodityLot = { ...input, status: LotStatus.CREATED };
    this.lots.set(lot.lotId, lot);
    this.recordEvent('lot', lot.lotId, 'CreateCommodityLot', lot);
    return lot;
  }

  dispatchLot(input: {
    transferId: string;
    lotId: string;
    fromOrg: string;
    toOrg: string;
    dispatchedQtyKg: number;
    vehicleNo: string;
    dispatchTimestamp?: string;
  }): TransferOrder {
    const lot = this.mustGetLot(input.lotId);
    this.assertActiveStakeholder(input.fromOrg);
    this.assertActiveStakeholder(input.toOrg);
    if (lot.currentOwner !== input.fromOrg) {
      throw new Error(`Lot ${lot.lotId} is owned by ${lot.currentOwner}, not ${input.fromOrg}`);
    }
    this.consumeStock(input.fromOrg, lot.commodity, input.dispatchedQtyKg);

    const transfer: TransferOrder = {
      transferId: input.transferId,
      lotId: input.lotId,
      fromOrg: input.fromOrg,
      toOrg: input.toOrg,
      dispatchedQtyKg: input.dispatchedQtyKg,
      vehicleNo: input.vehicleNo,
      status: TransferStatus.DISPATCHED,
      dispatchTimestamp: input.dispatchTimestamp ?? makeTimestamp()
    };

    this.transfers.set(transfer.transferId, transfer);
    this.lots.set(lot.lotId, { ...lot, status: LotStatus.DISPATCHED, currentOwner: input.toOrg, currentLocation: input.toOrg });
    this.recordEvent('transfer', transfer.transferId, 'DispatchLot', transfer);
    return transfer;
  }

  receiveLot(input: {
    transferId: string;
    receivedQtyKg: number;
    receiveTimestamp?: string;
    remarks?: string;
  }): TransferOrder {
    const transfer = this.mustGetTransfer(input.transferId);
    const lot = this.mustGetLot(transfer.lotId);
    if (transfer.status !== TransferStatus.DISPATCHED) {
      throw new Error(`Transfer ${transfer.transferId} already received`);
    }

    const shortageQtyKg = Math.max(0, transfer.dispatchedQtyKg - input.receivedQtyKg);
    const status = shortageQtyKg > 0 ? TransferStatus.RECEIVED_WITH_SHORTAGE : TransferStatus.RECEIVED;
    const updated: TransferOrder = {
      ...transfer,
      receivedQtyKg: input.receivedQtyKg,
      status,
      receiveTimestamp: input.receiveTimestamp ?? makeTimestamp()
    };
    if (shortageQtyKg > 0) {
      updated.shortageQtyKg = shortageQtyKg;
    }

    this.transfers.set(updated.transferId, updated);
    this.addStock(transfer.toOrg, lot.commodity, input.receivedQtyKg);
    this.lots.set(lot.lotId, { ...lot, status: shortageQtyKg > 0 ? LotStatus.RECEIVED_WITH_SHORTAGE : LotStatus.RECEIVED, currentOwner: transfer.toOrg, currentLocation: transfer.toOrg });
    this.recordEvent('transfer', updated.transferId, 'ReceiveLot', updated);

    if (shortageQtyKg > 0) {
      this.raiseAuditFlag({
        alertType: AlertType.SHORT_RECEIPT,
        entityId: updated.transferId,
        message: `Received ${input.receivedQtyKg}kg against dispatched ${transfer.dispatchedQtyKg}kg`,
        evidence: {
          dispatchedQtyKg: transfer.dispatchedQtyKg,
          receivedQtyKg: input.receivedQtyKg,
          shortageQtyKg
        }
      });
    }

    return updated;
  }

  allocateToFps(input: {
    allocationId: string;
    fpsId: string;
    commodity: string;
    allocatedQtyKg: number;
    month: string;
    sourceGodownId: string;
  }): FPSAllocation {
    this.assertActiveStakeholder(input.fpsId);
    this.assertActiveStakeholder(input.sourceGodownId);
    this.consumeStock(input.sourceGodownId, input.commodity, input.allocatedQtyKg);
    const allocation: FPSAllocation = { ...input, status: 'ALLOCATED' };
    this.allocations.set(allocation.allocationId, allocation);
    this.recordEvent('allocation', allocation.allocationId, 'AllocateToFPS', allocation);
    return allocation;
  }

  recordFpsReceipt(input: { allocationId: string; receivedQtyKg: number; receiveTimestamp?: string }): FPSAllocation {
    const allocation = this.mustGetAllocation(input.allocationId);
    if (allocation.status !== 'ALLOCATED') {
      throw new Error(`Allocation ${allocation.allocationId} already received`);
    }

    const updated: FPSAllocation = { ...allocation, receivedQtyKg: input.receivedQtyKg, status: 'RECEIVED' };
    this.allocations.set(updated.allocationId, updated);
    this.addStock(updated.fpsId, updated.commodity, input.receivedQtyKg);
    this.recordEvent('allocation', updated.allocationId, 'RecordFPSReceipt', updated);
    return updated;
  }

  simulateAuthentication(input: {
    authTxnId: string;
    beneficiaryRefHash: string;
    rationCardHash: string;
    authMode: AuthMode;
    authResult: AuthResult;
    approvedBy?: string;
  }): AuthTransaction {
    const authTxnRefHash = hashReference(`${input.authTxnId}:${input.beneficiaryRefHash}:${input.authResult}`);
    const authTransaction: AuthTransaction = input.approvedBy
      ? {
          ...input,
          authTxnRefHash,
          approvedBy: input.approvedBy,
          timestamp: makeTimestamp()
        }
      : {
          ...input,
          authTxnRefHash,
          timestamp: makeTimestamp()
        };
    this.authTransactions.set(input.authTxnId, authTransaction);
    this.recordEvent('auth', input.authTxnId, 'AuthTransaction', authTransaction);
    return authTransaction;
  }

  createOrUpdateEntitlement(input: MonthlyEntitlement): MonthlyEntitlement {
    this.entitlements.set(this.entitlementKey(input.rationCardHash, input.commodity, input.month), input);
    return input;
  }

  validateEntitlement(input: {
    rationCardHash: string;
    commodity: string;
    month: string;
    requestedQtyKg: number;
  }): MonthlyEntitlement {
    const entitlement = this.mustGetEntitlement(input.rationCardHash, input.commodity, input.month);
    if (!entitlement.active) {
      throw new Error(`Ration card ${input.rationCardHash} is inactive`);
    }
    if (entitlement.availableBalanceKg < input.requestedQtyKg) {
      throw new Error(`Requested quantity exceeds balance for ${input.rationCardHash}`);
    }
    return entitlement;
  }

  recordDistribution(input: {
    distributionId: string;
    fpsId: string;
    rationCardHash: string;
    beneficiaryRefHash: string;
    commodity: string;
    deliveredKg: number;
    authMode: AuthMode;
    authResult: AuthResult;
    authTxnRefHash: string;
    dealerId: string;
    timestamp?: string;
  }): DistributionTransaction {
    if (input.authResult === AuthResult.FAILURE) {
      throw new Error('Distribution cannot proceed after failed authentication');
    }
    const entitlement = this.mustGetEntitlement(input.rationCardHash, input.commodity, this.currentMonth());
    this.validateEntitlement({
      rationCardHash: input.rationCardHash,
      commodity: input.commodity,
      month: entitlement.month,
      requestedQtyKg: input.deliveredKg
    });
    this.consumeStock(input.fpsId, input.commodity, input.deliveredKg);
    entitlement.alreadyLiftedKg += input.deliveredKg;
    entitlement.availableBalanceKg -= input.deliveredKg;

    const distribution: DistributionTransaction = {
      ...input,
      timestamp: input.timestamp ?? makeTimestamp()
    };
    this.distributions.set(distribution.distributionId, distribution);
    const { ledgerTxId } = this.recordEvent('distribution', distribution.distributionId, 'RecordDistribution', distribution);
    distribution.ledgerTxId = ledgerTxId;
    this.distributions.set(distribution.distributionId, distribution);
    return distribution;
  }

  getLotHistory(lotId: string): LedgerEvent[] {
    return this.events.filter((event) => (event.entityType === 'lot' && event.entityId === lotId) || event.payload?.lotId === lotId);
  }

  getLot(lotId: string): CommodityLot {
    return this.mustGetLot(lotId);
  }

  getDistributionHistory(distributionId: string): LedgerEvent[] {
    return this.events.filter((event) => event.entityId === distributionId || event.payload?.distributionId === distributionId);
  }

  getTransfer(transferId: string): TransferOrder {
    return this.mustGetTransfer(transferId);
  }

  getAllocation(allocationId: string): FPSAllocation {
    return this.mustGetAllocation(allocationId);
  }

  getAuthTransaction(authTxnId: string): AuthTransaction {
    const authTransaction = this.authTransactions.get(authTxnId);
    if (!authTransaction) {
      throw new Error(`Auth transaction ${authTxnId} not found`);
    }
    return authTransaction;
  }

  listEntitlements(): MonthlyEntitlement[] {
    return [...this.entitlements.values()].sort((left, right) =>
      `${left.month}:${left.rationCardHash}:${left.commodity}`.localeCompare(`${right.month}:${right.rationCardHash}:${right.commodity}`)
    );
  }

  getTraceForLot(lotId: string) {
    const lot = this.mustGetLot(lotId);
    return {
      lot,
      history: this.getLotHistory(lotId),
      stockKg: this.stock.get(keyFor(lot.currentOwner, lot.commodity)) ?? 0
    };
  }

  listLots(): CommodityLot[] {
    return [...this.lots.values()].sort((left, right) => left.lotId.localeCompare(right.lotId));
  }

  listTransfers(): TransferOrder[] {
    return [...this.transfers.values()].sort((left, right) => left.dispatchTimestamp.localeCompare(right.dispatchTimestamp));
  }

  listAllocations(): FPSAllocation[] {
    return [...this.allocations.values()].sort((left, right) =>
      `${left.month}:${left.allocationId}`.localeCompare(`${right.month}:${right.allocationId}`)
    );
  }

  listAuthTransactions(): AuthTransaction[] {
    return [...this.authTransactions.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  listDistributions(): DistributionTransaction[] {
    return [...this.distributions.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  getDistributionReceipt(distributionId: string) {
    const distribution = this.distributions.get(distributionId);
    if (!distribution) {
      throw new Error(`Distribution ${distributionId} not found`);
    }
    return distribution;
  }

  getAlerts(): AuditAlert[] {
    return sortByTime([...this.alerts.values()]);
  }

  getEntitlement(rationCardHash: string, commodity: string, month: string): MonthlyEntitlement {
    return this.mustGetEntitlement(rationCardHash, commodity, month);
  }

  reconcileAlerts(): AuditAlert[] {
    for (const distribution of this.distributions.values()) {
      const expected = this.mustGetEntitlement(distribution.rationCardHash, distribution.commodity, this.currentMonth());
      if (distribution.deliveredKg > expected.monthlyEntitlementKg) {
        this.raiseAuditFlag({
          alertType: AlertType.DUPLICATE_CLAIM,
          entityId: distribution.distributionId,
          message: 'Distribution exceeds monthly entitlement',
          evidence: {
            deliveredKg: distribution.deliveredKg,
            monthlyEntitlementKg: expected.monthlyEntitlementKg
          }
        });
      }
    }
    return this.getAlerts();
  }

  resolveAuditAlert(input: { alertId: string; resolvedBy: string; resolutionNote: string }): AuditAlert {
    const alert = this.alerts.get(input.alertId);
    if (!alert) {
      throw new Error(`Alert ${input.alertId} not found`);
    }
    const resolved: AuditAlert = {
      ...alert,
      status: 'RESOLVED',
      resolvedAt: makeTimestamp(),
      resolvedBy: input.resolvedBy,
      resolutionNote: input.resolutionNote
    };
    this.alerts.set(resolved.alertId, resolved);
    this.recordEvent('audit', resolved.alertId, 'ResolveAuditFlag', resolved);
    return resolved;
  }

  getDashboardSummary(): DashboardSummary {
    return {
      trackedStockKg: [...this.stock.values()].reduce((total, qty) => total + qty, 0),
      activeLots: [...this.lots.values()].filter((lot) => lot.status === LotStatus.CREATED || lot.status === LotStatus.DISPATCHED).length,
      completedDistributions: this.distributions.size,
      pendingReceipts: [...this.allocations.values()].filter((allocation) => allocation.status === 'ALLOCATED').length + [...this.transfers.values()].filter((transfer) => transfer.status === TransferStatus.DISPATCHED).length,
      openAlerts: [...this.alerts.values()].filter((alert) => alert.status !== 'RESOLVED').length,
      highRiskFps: [...new Set([...this.alerts.values()].filter((alert) => alert.riskLevel === 'HIGH').map((alert) => alert.entityId))]
    };
  }

  raiseAuditFlag(input: {
    alertType: AlertType;
    entityId: string;
    message: string;
    evidence: Record<string, string | number | boolean>;
  }): AuditAlert {
    const alert: AuditAlert = {
      alertId: `ALERT-${randomUUID()}`,
      alertType: input.alertType,
      entityId: input.entityId,
      riskLevel: input.alertType === AlertType.DB_LEDGER_MISMATCH || input.alertType === AlertType.UNAUTHORIZED_TRANSACTION ? 'HIGH' : 'MEDIUM',
      message: input.message,
      status: 'OPEN',
      evidence: input.evidence,
      createdAt: makeTimestamp()
    };
    this.alerts.set(alert.alertId, alert);
    this.recordEvent('audit', alert.alertId, 'RaiseAuditFlag', alert);
    return alert;
  }

  private recordEvent(
    entityType: LedgerEvent['entityType'],
    entityId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): { ledgerTxId: string; event: LedgerEvent } {
    const ledgerTxId = `TX-${randomUUID()}`;
    const event: LedgerEvent = {
      ledgerTxId,
      entityType,
      entityId,
      eventType,
      payload,
      timestamp: makeTimestamp()
    };
    this.events.push(event);
    return { ledgerTxId, event };
  }

  private mustGetLot(lotId: string): CommodityLot {
    const lot = this.lots.get(lotId);
    if (!lot) {
      throw new Error(`Lot ${lotId} not found`);
    }
    return lot;
  }

  private mustGetTransfer(transferId: string): TransferOrder {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      throw new Error(`Transfer ${transferId} not found`);
    }
    return transfer;
  }

  private mustGetAllocation(allocationId: string): FPSAllocation {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      throw new Error(`Allocation ${allocationId} not found`);
    }
    return allocation;
  }

  private mustGetEntitlement(rationCardHash: string, commodity: string, month: string): MonthlyEntitlement {
    const entitlement = this.entitlements.get(this.entitlementKey(rationCardHash, commodity, month));
    if (!entitlement) {
      throw new Error(`Entitlement not found for ${rationCardHash}`);
    }
    return entitlement;
  }

  private entitlementKey(rationCardHash: string, commodity: string, month: string): string {
    return `${rationCardHash}:${commodity}:${month}`;
  }

  private assertActiveStakeholder(stakeholderId: string): void {
    const stakeholder = this.stakeholders.get(stakeholderId);
    if (!stakeholder) {
      throw new Error(`Stakeholder ${stakeholderId} not found`);
    }
    if (stakeholder.status !== StakeholderStatus.ACTIVE) {
      throw new Error(`Stakeholder ${stakeholderId} is inactive`);
    }
  }

  private consumeStock(entityId: string, commodity: string, qty: number): void {
    const current = this.stock.get(keyFor(entityId, commodity)) ?? 0;
    if (current < qty) {
      throw new Error(`Insufficient stock for ${entityId} ${commodity}`);
    }
    this.stock.set(keyFor(entityId, commodity), current - qty);
  }

  private addStock(entityId: string, commodity: string, qty: number): void {
    const current = this.stock.get(keyFor(entityId, commodity)) ?? 0;
    this.stock.set(keyFor(entityId, commodity), current + qty);
  }

  private currentMonth(): string {
    return '2026-06';
  }
}

export const createDemoLedgerEngine = (): PdsLedgerEngine => new PdsLedgerEngine(true);
