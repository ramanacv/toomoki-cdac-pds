import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  AlertType,
  AuthMode,
  AuthResult,
  CommodityLot,
  DashboardSummary,
  DemoSnapshot,
  DistributionTransaction,
  EntitlementRule,
  EntitlementRuleStatus,
  FPSAllocation,
  Grievance,
  GrievanceStatus,
  GrievanceType,
  LedgerEvent,
  LotStatus,
  MonthlyEntitlement,
  AuthTransaction,
  RationCard,
  RationCardStatus,
  RationCardType,
  Stakeholder,
  StakeholderStatus,
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
  rationCards: RationCard[];
  grievances: Grievance[];
  entitlementRules: EntitlementRule[];
};

const keyFor = (entityId: string, commodity: string): StockKey => `${entityId}:${commodity}`;

const sortByTime = <T>(entries: T[]): T[] =>
  [...entries].sort((a, b) => {
    const left = ((a as { timestamp?: string; createdAt?: string }).timestamp ?? (a as { timestamp?: string; createdAt?: string }).createdAt ?? '');
    const right = ((b as { timestamp?: string; createdAt?: string }).timestamp ?? (b as { timestamp?: string; createdAt?: string }).createdAt ?? '');
    return left.localeCompare(right);
  });

/**
 * Ledger event types accepted via RecordLedgerProof / applyLedgerEvent replay.
 * Arbitrary/unknown event types are rejected (T1.4) so a malicious or buggy
 * producer cannot project arbitrary state onto the ledger.
 */
const ALLOWED_LEDGER_EVENT_TYPES = new Set([
  'RegisterStakeholder',
  'CreateCommodityLot',
  'DispatchLot',
  'ReceiveLot',
  'AllocateToFPS',
  'RecordFPSReceipt',
  'AuthTransaction',
  'CreateMonthlyEntitlement',
  'RecordDistribution',
  'RaiseAuditFlag',
  'ResolveAuditFlag',
  'IssueRationCard',
  'ActivateRationCard',
  'SuspendRationCard',
  'TransferRationCard',
  'FileGrievance',
  'AcknowledgeGrievance',
  'ResolveGrievance',
  'EscalateOverdueGrievances',
  'ProposeEntitlementRule',
  'ApproveEntitlementRule',
  'RolloverUnclaimedQuota'
]);

const assertAllowedLedgerEventType = (eventType: string): void => {
  if (!ALLOWED_LEDGER_EVENT_TYPES.has(eventType)) {
    throw new Error(`Unsupported ledger event type: ${eventType}`);
  }
};

/**
 * PII fields that must never be persisted on the ledger (T6.4). Raw ration card
 * numbers, Aadhaar, mobile numbers and OTPs are prohibited; only hashed
 * references (rationCardHash / beneficiaryRefHash) are allowed.
 */
const PII_DENYLIST = ['aadhaar', 'mobile', 'otp', 'rationCard', 'rationCardNumber', 'phone'];

const assertNoPiiInPayload = (payload: Record<string, unknown>): void => {
  for (const field of PII_DENYLIST) {
    if (field in payload) {
      throw new Error(`Payload contains prohibited PII field: ${field}`);
    }
  }
};

/**
 * Validate that a hash reference looks like a hash rather than a raw identifier
 * (T6.4). Real hashes (hex/base58 digests) and the demo placeholders
 * (`demo-ration-card-hash`, `beneficiary-hash`) are accepted; raw numeric
 * identifiers (Aadhaar, phone, ration card numbers) are rejected.
 *
 * Note: this is a format sanity check, NOT a cryptographic guarantee. The demo
 * fixtures use human-readable placeholder strings; in production these fields
 * must hold SHA-256 (or stronger) digests of the underlying identifiers.
 */
const RAW_NUMERIC_ID = /^\d{8,16}$/;
const validateHashFormat = (value: string, field: string): void => {
  if (typeof value !== 'string' || value.length < 8) {
    throw new Error(`${field} must be a hash of at least 8 characters, not a raw identifier`);
  }
  if (/\s/.test(value)) {
    throw new Error(`${field} must not contain whitespace`);
  }
  if (RAW_NUMERIC_ID.test(value)) {
    throw new Error(`${field} looks like a raw numeric identifier (Aadhaar/phone/card), not a hash`);
  }
};

/** Derive a `YYYY-MM` month string from an ISO timestamp. */
const monthFromTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

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
  private rationCards = new Map<string, RationCard>();
  private grievances = new Map<string, Grievance>();
  private entitlementRules = new Map<string, EntitlementRule>();

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
      stock: [...this.stock.entries()],
      rationCards: [...this.rationCards.values()],
      grievances: [...this.grievances.values()],
      entitlementRules: [...this.entitlementRules.values()]
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
    this.rationCards = new Map((state.rationCards ?? []).map((item) => [item.rationCardHash, item]));
    this.grievances = new Map((state.grievances ?? []).map((item) => [item.grievanceId, item]));
    this.entitlementRules = new Map((state.entitlementRules ?? []).map((item) => [item.ruleId, item]));
  }

  seedDemoData(): DemoSnapshot {
    if (this.stakeholders.size > 0) {
      return this.snapshot();
    }

    // Lazy-load demo fixtures so the Fabric runtime path (which never seeds)
    // does not require @pds/fixtures at module load — keeps the chaincode
    // bundle lean (T6.5) and avoids a hard dep on the fixtures package.
    const require = createRequire(import.meta.url);
    const { backendSeed, stakeholders: fixtureStakeholders } = require('@pds/fixtures') as typeof import('@pds/fixtures');

    fixtureStakeholders.forEach((stakeholder) =>
      this.stakeholders.set(stakeholder.stakeholderId, { ...stakeholder })
    );

    this.createCommodityLot({ ...backendSeed.initialLot });
    this.createOrUpdateEntitlement({ ...backendSeed.initialEntitlement });

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
      alerts: [...this.alerts.values()],
      rationCards: [...this.rationCards.values()],
      grievances: [...this.grievances.values()],
      entitlementRules: [...this.entitlementRules.values()]
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
    if (this.lots.has(input.lotId)) {
      throw new Error(`Lot ${input.lotId} already exists`);
    }
    const lot: CommodityLot = { ...input, status: LotStatus.CREATED };
    this.lots.set(lot.lotId, lot);
    // Open the stock position for the originating owner so getCurrentStock is correct
    // immediately after creation (previously stock only came from seed).
    this.addStock(lot.currentOwner, lot.commodity, lot.quantityKg);
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
    if (this.transfers.has(input.transferId)) {
      throw new Error(`Transfer ${input.transferId} already exists`);
    }
    const lot = this.mustGetLot(input.lotId);
    this.assertActiveStakeholder(input.fromOrg);
    this.assertActiveStakeholder(input.toOrg);
    if (lot.status === LotStatus.DISPATCHED) {
      throw new Error(`Lot ${lot.lotId} is already in transit (DISPATCHED); cannot re-dispatch until received`);
    }
    if (lot.currentOwner !== input.fromOrg) {
      throw new Error(`Lot ${lot.lotId} is owned by ${lot.currentOwner}, not ${input.fromOrg}`);
    }
    if (input.dispatchedQtyKg <= 0) {
      throw new Error('dispatchedQtyKg must be positive');
    }
    // Validate against the stock currently held by the sender for this lot's commodity.
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
    // In-transit model: ownership does NOT transfer at dispatch. The lot moves to
    // DISPATCHED (in transit) with currentOwner still being the sender until receipt.
    // currentLocation reflects the destination so the in-transit leg is traceable.
    this.lots.set(lot.lotId, { ...lot, status: LotStatus.DISPATCHED, currentLocation: input.toOrg });
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
    if (this.allocations.has(input.allocationId)) {
      throw new Error(`Allocation ${input.allocationId} already exists`);
    }
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
    if (this.authTransactions.has(input.authTxnId)) {
      throw new Error(`Auth transaction ${input.authTxnId} already exists`);
    }
    validateHashFormat(input.beneficiaryRefHash, 'beneficiaryRefHash');
    validateHashFormat(input.rationCardHash, 'rationCardHash');
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
    validateHashFormat(input.rationCardHash, 'rationCardHash');
    // If the entitlement has a category and an active rule exists, validate the quantity.
    if (input.category) {
      const activeRule = [...this.entitlementRules.values()].find(
        (r) => r.status === EntitlementRuleStatus.ACTIVE && r.category === input.category && r.commodity === input.commodity
      );
      if (activeRule && input.monthlyEntitlementKg > activeRule.monthlyKg) {
        throw new Error(
          `Entitlement of ${input.monthlyEntitlementKg}kg exceeds active rule cap of ${activeRule.monthlyKg}kg for ${input.category}/${input.commodity}`
        );
      }
    }
    const key = this.entitlementKey(input.rationCardHash, input.commodity, input.month);
    const isUpdate = this.entitlements.has(key);
    this.entitlements.set(key, input);
    if (!isUpdate) {
      // Emit a ledger event only on create to keep the entitlement auditable without
      // double-counting updates (each create gets one EntitlementCreated event).
      this.recordEvent('distribution', input.rationCardHash, 'CreateMonthlyEntitlement', input);
    }
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
    if (this.distributions.has(input.distributionId)) {
      throw new Error(`Distribution ${input.distributionId} already exists`);
    }
    if (input.authResult === AuthResult.FAILURE) {
      throw new Error('Distribution cannot proceed after failed authentication');
    }
    validateHashFormat(input.rationCardHash, 'rationCardHash');
    validateHashFormat(input.beneficiaryRefHash, 'beneficiaryRefHash');
    // If a ration card lifecycle record exists for this hash, it must be ACTIVE.
    const rationCard = this.rationCards.get(input.rationCardHash);
    if (rationCard && rationCard.status !== RationCardStatus.ACTIVE) {
      throw new Error(`Ration card ${input.rationCardHash} is not active (status: ${rationCard.status})`);
    }
    // Derive the entitlement month from the distribution timestamp instead of a
    // hardcoded value so the engine is date-correct across months.
    const effectiveTimestamp = input.timestamp ?? makeTimestamp();
    const month = monthFromTimestamp(effectiveTimestamp);
    const entitlement = this.mustGetEntitlement(input.rationCardHash, input.commodity, month);
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
      timestamp: effectiveTimestamp
    };
    this.distributions.set(distribution.distributionId, distribution);
    const { ledgerTxId } = this.recordEvent('distribution', distribution.distributionId, 'RecordDistribution', distribution);
    distribution.ledgerTxId = ledgerTxId;
    this.distributions.set(distribution.distributionId, distribution);
    return distribution;
  }

  // ── Ration Card Lifecycle ────────────────────────────────────────────────

  issueRationCard(input: {
    rationCardHash: string;
    cardType: RationCardType;
    assignedFpsId: string;
    issuedAt?: string;
  }): RationCard {
    validateHashFormat(input.rationCardHash, 'rationCardHash');
    if (this.rationCards.has(input.rationCardHash)) {
      throw new Error(`Ration card ${input.rationCardHash} already exists`);
    }
    const card: RationCard = {
      rationCardHash: input.rationCardHash,
      cardType: input.cardType,
      assignedFpsId: input.assignedFpsId,
      issuedAt: input.issuedAt ?? makeTimestamp(),
      status: RationCardStatus.ISSUED,
      transferHistory: []
    };
    this.rationCards.set(card.rationCardHash, card);
    this.recordEvent('rationcard', card.rationCardHash, 'IssueRationCard', card as unknown as Record<string, unknown>);
    return card;
  }

  activateRationCard(input: { rationCardHash: string }): RationCard {
    const card = this.mustGetRationCard(input.rationCardHash);
    if (card.status === RationCardStatus.ACTIVE) {
      return card;
    }
    if (card.status === RationCardStatus.CANCELLED) {
      throw new Error(`Ration card ${input.rationCardHash} is cancelled and cannot be reactivated`);
    }
    const updated: RationCard = { ...card, status: RationCardStatus.ACTIVE };
    this.rationCards.set(updated.rationCardHash, updated);
    this.recordEvent('rationcard', updated.rationCardHash, 'ActivateRationCard', updated as unknown as Record<string, unknown>);
    return updated;
  }

  suspendRationCard(input: { rationCardHash: string; suspendReason: string; suspendedAt?: string }): RationCard {
    const card = this.mustGetRationCard(input.rationCardHash);
    if (card.status === RationCardStatus.CANCELLED) {
      throw new Error(`Ration card ${input.rationCardHash} is cancelled`);
    }
    const updated: RationCard = {
      ...card,
      status: RationCardStatus.SUSPENDED,
      suspendedAt: input.suspendedAt ?? makeTimestamp(),
      suspendReason: input.suspendReason
    };
    this.rationCards.set(updated.rationCardHash, updated);
    this.raiseAuditFlag({
      alertType: AlertType.UNAUTHORIZED_TRANSACTION,
      entityId: updated.rationCardHash,
      message: `Ration card suspended: ${input.suspendReason}`,
      evidence: { rationCardHash: updated.rationCardHash, suspendReason: input.suspendReason }
    });
    this.recordEvent('rationcard', updated.rationCardHash, 'SuspendRationCard', updated as unknown as Record<string, unknown>);
    return updated;
  }

  transferRationCard(input: {
    rationCardHash: string;
    toFpsId: string;
    authorizedBy: string;
    transferredAt?: string;
  }): RationCard {
    const card = this.mustGetRationCard(input.rationCardHash);
    if (card.status !== RationCardStatus.ACTIVE) {
      throw new Error(`Ration card ${input.rationCardHash} must be ACTIVE to transfer (current: ${card.status})`);
    }
    this.assertActiveStakeholder(input.toFpsId);
    const transferEntry = { fromFps: card.assignedFpsId, toFps: input.toFpsId, at: input.transferredAt ?? makeTimestamp(), authorizedBy: input.authorizedBy };
    const updated: RationCard = {
      ...card,
      assignedFpsId: input.toFpsId,
      transferHistory: [...card.transferHistory, transferEntry]
    };
    this.rationCards.set(updated.rationCardHash, updated);
    this.recordEvent('rationcard', updated.rationCardHash, 'TransferRationCard', updated as unknown as Record<string, unknown>);
    return updated;
  }

  getRationCardHistory(rationCardHash: string): LedgerEvent[] {
    return this.events.filter((e) => e.entityType === 'rationcard' && e.entityId === rationCardHash);
  }

  listRationCards(): RationCard[] {
    return [...this.rationCards.values()];
  }

  // ── Grievance Tokens ────────────────────────────────────────────────────

  fileGrievance(input: {
    grievanceId: string;
    rationCardHash: string;
    fpsId: string;
    grievanceType: GrievanceType;
    description: string;
    filedAt?: string;
  }): Grievance {
    if (this.grievances.has(input.grievanceId)) {
      throw new Error(`Grievance ${input.grievanceId} already exists`);
    }
    if (input.description.length > 500) {
      throw new Error('Grievance description must not exceed 500 characters');
    }
    validateHashFormat(input.rationCardHash, 'rationCardHash');
    const filedAt = input.filedAt ?? makeTimestamp();
    const slaDeadlineAt = new Date(new Date(filedAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const grievance: Grievance = {
      grievanceId: input.grievanceId,
      rationCardHash: input.rationCardHash,
      fpsId: input.fpsId,
      grievanceType: input.grievanceType,
      description: input.description,
      status: GrievanceStatus.OPEN,
      filedAt,
      slaDeadlineAt
    };
    this.grievances.set(grievance.grievanceId, grievance);
    this.recordEvent('grievance', grievance.grievanceId, 'FileGrievance', grievance as unknown as Record<string, unknown>);
    return grievance;
  }

  acknowledgeGrievance(input: { grievanceId: string; acknowledgedAt?: string }): Grievance {
    const grievance = this.mustGetGrievance(input.grievanceId);
    if (grievance.status !== GrievanceStatus.OPEN) {
      throw new Error(`Grievance ${input.grievanceId} is not OPEN (current: ${grievance.status})`);
    }
    const updated: Grievance = { ...grievance, status: GrievanceStatus.ACKNOWLEDGED, acknowledgedAt: input.acknowledgedAt ?? makeTimestamp() };
    this.grievances.set(updated.grievanceId, updated);
    this.recordEvent('grievance', updated.grievanceId, 'AcknowledgeGrievance', updated as unknown as Record<string, unknown>);
    return updated;
  }

  resolveGrievance(input: { grievanceId: string; resolvedBy: string; resolutionNote: string; resolvedAt?: string }): Grievance {
    const grievance = this.mustGetGrievance(input.grievanceId);
    if (grievance.status === GrievanceStatus.RESOLVED) {
      throw new Error(`Grievance ${input.grievanceId} is already resolved`);
    }
    const updated: Grievance = {
      ...grievance,
      status: GrievanceStatus.RESOLVED,
      resolvedAt: input.resolvedAt ?? makeTimestamp(),
      resolvedBy: input.resolvedBy,
      resolutionNote: input.resolutionNote
    };
    this.grievances.set(updated.grievanceId, updated);
    this.recordEvent('grievance', updated.grievanceId, 'ResolveGrievance', updated as unknown as Record<string, unknown>);
    return updated;
  }

  escalateOverdueGrievances(input: { currentTimestamp?: string }): { escalated: Grievance[]; alerts: AuditAlert[] } {
    const now = input.currentTimestamp ?? makeTimestamp();
    const escalated: Grievance[] = [];
    const newAlerts: AuditAlert[] = [];
    for (const grievance of this.grievances.values()) {
      if (grievance.status !== GrievanceStatus.OPEN && grievance.status !== GrievanceStatus.ACKNOWLEDGED) {
        continue;
      }
      if (now >= grievance.slaDeadlineAt) {
        const updated: Grievance = { ...grievance, status: GrievanceStatus.ESCALATED, escalatedAt: now };
        this.grievances.set(updated.grievanceId, updated);
        escalated.push(updated);
        const alert = this.raiseAuditFlag({
          alertType: AlertType.GRIEVANCE_SLA_BREACH,
          entityId: grievance.grievanceId,
          message: `Grievance ${grievance.grievanceId} breached 7-day SLA`,
          evidence: { fpsId: grievance.fpsId, filedAt: grievance.filedAt, slaDeadlineAt: grievance.slaDeadlineAt }
        });
        newAlerts.push(alert);
      }
    }
    if (escalated.length > 0) {
      this.recordEvent('grievance', 'batch', 'EscalateOverdueGrievances', { escalated: escalated.map((g) => g.grievanceId), escalatedAt: now } as unknown as Record<string, unknown>);
    }
    return { escalated, alerts: newAlerts };
  }

  listGrievances(): Grievance[] {
    return [...this.grievances.values()].sort((a, b) => a.filedAt.localeCompare(b.filedAt));
  }

  // ── Entitlement Rules Engine ────────────────────────────────────────────

  proposeEntitlementRule(input: {
    ruleId: string;
    category: RationCardType;
    commodity: string;
    monthlyKg: number;
    effectiveFrom: string;
    proposedBy: string;
  }): EntitlementRule {
    if (this.entitlementRules.has(input.ruleId)) {
      throw new Error(`Entitlement rule ${input.ruleId} already exists`);
    }
    if (input.monthlyKg <= 0) {
      throw new Error('monthlyKg must be positive');
    }
    const rule: EntitlementRule = { ...input, status: EntitlementRuleStatus.PENDING_APPROVAL };
    this.entitlementRules.set(rule.ruleId, rule);
    this.recordEvent('entitlementrule', rule.ruleId, 'ProposeEntitlementRule', rule as unknown as Record<string, unknown>);
    return rule;
  }

  approveEntitlementRule(input: { ruleId: string; approvedBy: string }): EntitlementRule {
    const rule = this.mustGetEntitlementRule(input.ruleId);
    if (rule.status !== EntitlementRuleStatus.PENDING_APPROVAL) {
      throw new Error(`Rule ${input.ruleId} is not pending approval (current: ${rule.status})`);
    }
    // Supersede any active rule for same category+commodity
    for (const existing of this.entitlementRules.values()) {
      if (existing.status === EntitlementRuleStatus.ACTIVE && existing.category === rule.category && existing.commodity === rule.commodity) {
        this.entitlementRules.set(existing.ruleId, { ...existing, status: EntitlementRuleStatus.SUPERSEDED, effectiveTo: rule.effectiveFrom });
      }
    }
    const approved: EntitlementRule = { ...rule, status: EntitlementRuleStatus.ACTIVE, approvedBy: input.approvedBy };
    this.entitlementRules.set(approved.ruleId, approved);
    this.recordEvent('entitlementrule', approved.ruleId, 'ApproveEntitlementRule', approved as unknown as Record<string, unknown>);
    return approved;
  }

  getActiveEntitlementRules(): EntitlementRule[] {
    return [...this.entitlementRules.values()].filter((r) => r.status === EntitlementRuleStatus.ACTIVE);
  }

  // ── Quota Rollover ──────────────────────────────────────────────────────

  rolloverUnclaimedQuota(input: {
    fromMonth: string;
    toMonth: string;
    commodity: string;
    rolloverPct: number;
  }): { rolledOver: number; beneficiariesAffected: number } {
    if (input.rolloverPct < 0 || input.rolloverPct > 100) {
      throw new Error('rolloverPct must be between 0 and 100');
    }
    let rolledOver = 0;
    let beneficiariesAffected = 0;
    for (const entitlement of this.entitlements.values()) {
      if (entitlement.month !== input.fromMonth || entitlement.commodity !== input.commodity) {
        continue;
      }
      const unclaimedKg = entitlement.availableBalanceKg;
      if (unclaimedKg <= 0) continue;
      const carryKg = Math.floor(unclaimedKg * input.rolloverPct / 100);
      if (carryKg === 0) continue;
      const toKey = this.entitlementKey(entitlement.rationCardHash, input.commodity, input.toMonth);
      const existing = this.entitlements.get(toKey);
      if (existing) {
        const updated: MonthlyEntitlement = {
          ...existing,
          monthlyEntitlementKg: existing.monthlyEntitlementKg + carryKg,
          availableBalanceKg: existing.availableBalanceKg + carryKg
        };
        this.entitlements.set(toKey, updated);
      } else {
        const newEnt: MonthlyEntitlement = {
          rationCardHash: entitlement.rationCardHash,
          commodity: input.commodity,
          month: input.toMonth,
          monthlyEntitlementKg: carryKg,
          alreadyLiftedKg: 0,
          availableBalanceKg: carryKg,
          active: true,
          category: entitlement.category
        };
        this.entitlements.set(toKey, newEnt);
      }
      rolledOver += carryKg;
      beneficiariesAffected++;
    }
    this.recordEvent('distribution', 'batch', 'RolloverUnclaimedQuota', {
      fromMonth: input.fromMonth,
      toMonth: input.toMonth,
      commodity: input.commodity,
      rolloverPct: input.rolloverPct,
      rolledOverKg: rolledOver,
      beneficiariesAffected
    });
    return { rolledOver, beneficiariesAffected };
  }

  applyLedgerEvent(event: LedgerEvent): { ledgerTxId: string } {
    if (this.events.some((item) => item.ledgerTxId === event.ledgerTxId)) {
      return { ledgerTxId: event.ledgerTxId };
    }
    assertAllowedLedgerEventType(event.eventType);
    assertNoPiiInPayload(event.payload);
    this.events.push(event);
    this.projectEventToState(event);
    return { ledgerTxId: event.ledgerTxId };
  }

  getLedgerDigest(): string {
    return hashReference(JSON.stringify(this.events));
  }

  verifyDatabaseHash(input: { digest: string }): { match: boolean; ledgerDigest: string } {
    const ledgerDigest = this.getLedgerDigest();
    return { match: ledgerDigest === input.digest, ledgerDigest };
  }

  checkDuplicateClaim(input: {
    rationCardHash: string;
    commodity: string;
    month: string;
    requestedQtyKg: number;
  }): { allowed: boolean; availableBalanceKg: number } {
    const entitlement = this.mustGetEntitlement(input.rationCardHash, input.commodity, input.month);
    return {
      allowed: entitlement.availableBalanceKg >= input.requestedQtyKg,
      availableBalanceKg: entitlement.availableBalanceKg
    };
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
      const expected = this.mustGetEntitlement(
        distribution.rationCardHash,
        distribution.commodity,
        monthFromTimestamp(distribution.timestamp)
      );
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

  /** Test-only helper to seed a stock position without driving the full flow. */
  addStockForTest(entityId: string, commodity: string, qty: number): void {
    this.addStock(entityId, commodity, qty);
  }

  private currentMonth(): string {
    return monthFromTimestamp(makeTimestamp());
  }

  private projectEventToState(event: LedgerEvent): void {
    const payload = event.payload;
    switch (event.eventType) {
      case 'RegisterStakeholder':
        this.stakeholders.set(String(payload.stakeholderId), payload as unknown as Stakeholder);
        break;
      case 'CreateCommodityLot': {
        const lot = payload as unknown as CommodityLot;
        this.lots.set(lot.lotId, lot);
        this.stock.set(keyFor(lot.currentOwner, lot.commodity), lot.quantityKg);
        break;
      }
      case 'DispatchLot': {
        const transfer = payload as unknown as TransferOrder;
        this.transfers.set(transfer.transferId, transfer);
        break;
      }
      case 'ReceiveLot': {
        const transfer = payload as unknown as TransferOrder;
        this.transfers.set(transfer.transferId, transfer);
        break;
      }
      case 'AllocateToFPS': {
        const allocation = payload as unknown as FPSAllocation;
        this.allocations.set(allocation.allocationId, allocation);
        break;
      }
      case 'RecordFPSReceipt': {
        const allocation = payload as unknown as FPSAllocation;
        this.allocations.set(allocation.allocationId, allocation);
        break;
      }
      case 'AuthTransaction': {
        const auth = payload as unknown as AuthTransaction;
        this.authTransactions.set(auth.authTxnId, auth);
        break;
      }
      case 'CreateMonthlyEntitlement': {
        const entitlement = payload as unknown as MonthlyEntitlement;
        this.entitlements.set(this.entitlementKey(entitlement.rationCardHash, entitlement.commodity, entitlement.month), entitlement);
        break;
      }
      case 'RecordDistribution': {
        const distribution = payload as unknown as DistributionTransaction;
        this.distributions.set(distribution.distributionId, distribution);
        break;
      }
      case 'RaiseAuditFlag':
      case 'ResolveAuditFlag': {
        const alert = payload as unknown as AuditAlert;
        this.alerts.set(alert.alertId, alert);
        break;
      }
      case 'IssueRationCard':
      case 'ActivateRationCard':
      case 'SuspendRationCard':
      case 'TransferRationCard': {
        const card = payload as unknown as RationCard;
        this.rationCards.set(card.rationCardHash, card);
        break;
      }
      case 'FileGrievance':
      case 'AcknowledgeGrievance':
      case 'ResolveGrievance':
      case 'EscalateOverdueGrievances': {
        // Batch escalation stores a summary, not individual grievances — skip projection.
        if (payload.grievanceId) {
          const grievance = payload as unknown as Grievance;
          this.grievances.set(grievance.grievanceId, grievance);
        }
        break;
      }
      case 'ProposeEntitlementRule':
      case 'ApproveEntitlementRule': {
        const rule = payload as unknown as EntitlementRule;
        this.entitlementRules.set(rule.ruleId, rule);
        break;
      }
      case 'RolloverUnclaimedQuota':
        // Rollover updates multiple entitlements; projection not applicable for replay.
        break;
      default:
        // applyLedgerEvent pre-validates against the allowlist, so reaching here
        // means an internal inconsistency — fail loudly rather than silently drop.
        throw new Error(`Cannot project unknown ledger event type: ${event.eventType}`);
    }
  }

  private mustGetRationCard(rationCardHash: string): RationCard {
    const card = this.rationCards.get(rationCardHash);
    if (!card) throw new Error(`Ration card ${rationCardHash} not found`);
    return card;
  }

  private mustGetGrievance(grievanceId: string): Grievance {
    const grievance = this.grievances.get(grievanceId);
    if (!grievance) throw new Error(`Grievance ${grievanceId} not found`);
    return grievance;
  }

  private mustGetEntitlementRule(ruleId: string): EntitlementRule {
    const rule = this.entitlementRules.get(ruleId);
    if (!rule) throw new Error(`Entitlement rule ${ruleId} not found`);
    return rule;
  }
}

export const createDemoLedgerEngine = (): PdsLedgerEngine => new PdsLedgerEngine(true);

export { PdsChaincodeInvoker, loadWorldState, saveWorldState } from './invoker.js';
export { CHAINCODE_OPERATIONS, isChaincodeOperation, isChaincodeQuery, type ChaincodeOperation } from './operations.js';
