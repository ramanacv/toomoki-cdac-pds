/**
 * PDS Chaincode — two contracts on one channel, cleanly separating planes:
 *
 *  PdsControlContract  — governance / policy / identity (control plane)
 *    RegisterStakeholder, IssueRationCard, ActivateRationCard, SuspendRationCard,
 *    TransferRationCard, ProposeEntitlementRule, ApproveEntitlementRule,
 *    RolloverUnclaimedQuota
 *    Queries: GetActiveEntitlementRules, GetRationCardHistory, GetStakeholdersByType
 *
 *  PdsDataContract     — operational flows / transactions (data plane)
 *    CreateCommodityLot, DispatchLot, ReceiveLot, AllocateToFPS, RecordFPSReceipt,
 *    RegisterBeneficiaryHash, CreateMonthlyEntitlement, RecordDistribution,
 *    RaiseAuditFlag, ResolveAuditFlag, RecordLedgerProof,
 *    FileGrievance, AcknowledgeGrievance, ResolveGrievance, EscalateOverdueGrievances
 *    Queries: GetLotHistory, GetDistributionHistory, GetCurrentStock,
 *             VerifyDatabaseHash, CheckDuplicateClaim, GetEntityHistory,
 *             GetDistributionsByFPS
 *
 * Both contracts share state storage (same per-collection keys) and helpers
 * from contract-base.ts. Each write method:
 *   1. Asserts MSP authorization
 *   2. Loads only the collections it needs
 *   3. Runs the engine for business logic
 *   4. Persists changed collections + per-entity composite keys
 *   5. Calls emitAndLog() which both sets a Fabric event AND logs to peer stdout
 */

import { Context, Contract } from 'fabric-contract-api';
import type {
  AuditAlert,
  CommodityLot,
  EntitlementRule,
  FPSAllocation,
  Grievance,
  LedgerEvent,
  MonthlyEntitlement,
  RationCard,
  Stakeholder,
  TransferOrder
} from '@pds/shared-types';
import type { PdsLedgerState } from './index.js';
import { assertAuthorized } from './authorization.js';
import {
  buildEngine,
  emitAndLog,
  getTxTimestamp,
  identityFromContext,
  loadCollection,
  saveCollection
} from './contract-base.js';

// ── Control Plane Contract ────────────────────────────────────────────────────

export class PdsControlContract extends Contract {

  async RegisterStakeholder(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RegisterStakeholder', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const [stakeholders, events] = await Promise.all([
      loadCollection<Stakeholder>(ctx, 'stakeholders'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ stakeholders, events });
    const result = engine.registerStakeholder(JSON.parse(payloadJson) as Stakeholder);
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'stakeholders', state.stakeholders),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'control', 'RegisterStakeholder', txId, out);
    return JSON.stringify(out);
  }

  async IssueRationCard(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('IssueRationCard', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), issuedAt: isoTimestamp };
    const [rationCards, events] = await Promise.all([
      loadCollection<RationCard>(ctx, 'rationCards'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ rationCards, events });
    const result = engine.issueRationCard(payload);
    const state = engine.exportState();
    const cardKey = ctx.stub.createCompositeKey('rationcard', [result.rationCardHash]);
    await Promise.all([
      saveCollection(ctx, 'rationCards', state.rationCards),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(cardKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'control', 'IssueRationCard', txId, out);
    return JSON.stringify(out);
  }

  async ActivateRationCard(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('ActivateRationCard', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const [rationCards, events] = await Promise.all([
      loadCollection<RationCard>(ctx, 'rationCards'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ rationCards, events });
    const result = engine.activateRationCard(JSON.parse(payloadJson));
    const state = engine.exportState();
    const cardKey = ctx.stub.createCompositeKey('rationcard', [result.rationCardHash]);
    await Promise.all([
      saveCollection(ctx, 'rationCards', state.rationCards),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(cardKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'control', 'ActivateRationCard', txId, out);
    return JSON.stringify(out);
  }

  async SuspendRationCard(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('SuspendRationCard', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), suspendedAt: isoTimestamp };
    const [rationCards, alerts, events] = await Promise.all([
      loadCollection<RationCard>(ctx, 'rationCards'),
      loadCollection<AuditAlert>(ctx, 'alerts'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ rationCards, alerts, events });
    const result = engine.suspendRationCard(payload);
    const state = engine.exportState();
    const cardKey = ctx.stub.createCompositeKey('rationcard', [result.rationCardHash]);
    await Promise.all([
      saveCollection(ctx, 'rationCards', state.rationCards),
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(cardKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'control', 'SuspendRationCard', txId, out);
    return JSON.stringify(out);
  }

  async TransferRationCard(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('TransferRationCard', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), transferredAt: isoTimestamp };
    const [rationCards, stakeholders, events] = await Promise.all([
      loadCollection<RationCard>(ctx, 'rationCards'),
      loadCollection<Stakeholder>(ctx, 'stakeholders'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ rationCards, stakeholders, events });
    const result = engine.transferRationCard(payload);
    const state = engine.exportState();
    const cardKey = ctx.stub.createCompositeKey('rationcard', [result.rationCardHash]);
    await Promise.all([
      saveCollection(ctx, 'rationCards', state.rationCards),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(cardKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'control', 'TransferRationCard', txId, out);
    return JSON.stringify(out);
  }

  async ProposeEntitlementRule(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('ProposeEntitlementRule', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const mspId = identityFromContext(ctx).getMSPID();
    const payload = { ...JSON.parse(payloadJson), proposedBy: mspId };
    const [entitlementRules, events] = await Promise.all([
      loadCollection<EntitlementRule>(ctx, 'entitlementRules'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ entitlementRules, events });
    const result = engine.proposeEntitlementRule(payload);
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'entitlementRules', state.entitlementRules),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'control', 'ProposeEntitlementRule', txId, out);
    return JSON.stringify(out);
  }

  async ApproveEntitlementRule(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('ApproveEntitlementRule', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const mspId = identityFromContext(ctx).getMSPID();
    const payload = { ...JSON.parse(payloadJson), approvedBy: mspId };
    const [entitlementRules, events] = await Promise.all([
      loadCollection<EntitlementRule>(ctx, 'entitlementRules'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ entitlementRules, events });
    const result = engine.approveEntitlementRule(payload);
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'entitlementRules', state.entitlementRules),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'control', 'ApproveEntitlementRule', txId, out);
    return JSON.stringify(out);
  }

  async RolloverUnclaimedQuota(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RolloverUnclaimedQuota', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const [entitlements, events] = await Promise.all([
      loadCollection<MonthlyEntitlement>(ctx, 'entitlements'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ entitlements, events });
    const result = engine.rolloverUnclaimedQuota(JSON.parse(payloadJson));
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'entitlements', state.entitlements),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'control', 'RolloverUnclaimedQuota', txId, out);
    return JSON.stringify(out);
  }

  // ── Control-plane queries ─────────────────────────────────────────────────

  async GetActiveEntitlementRules(ctx: Context): Promise<string> {
    const entitlementRules = await loadCollection<EntitlementRule>(ctx, 'entitlementRules');
    return JSON.stringify(buildEngine({ entitlementRules }).getActiveEntitlementRules());
  }

  async GetRationCardHistory(ctx: Context, payloadJson: string): Promise<string> {
    const { rationCardHash } = JSON.parse(payloadJson) as { rationCardHash: string };
    const events = await loadCollection<LedgerEvent>(ctx, 'events');
    return JSON.stringify(buildEngine({ events }).getRationCardHistory(rationCardHash));
  }

  async GetStakeholdersByType(ctx: Context, payloadJson: string): Promise<string> {
    const { type } = JSON.parse(payloadJson) as { type: string };
    const stakeholders = await loadCollection<Stakeholder>(ctx, 'stakeholders');
    return JSON.stringify(stakeholders.filter((s) => s.stakeholderType === type));
  }
}

// ── Data Plane Contract ───────────────────────────────────────────────────────

export class PdsDataContract extends Contract {

  // ── Supply chain ──────────────────────────────────────────────────────────

  async CreateCommodityLot(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('CreateCommodityLot', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const [stakeholders, lots, stock, events] = await Promise.all([
      loadCollection<Stakeholder>(ctx, 'stakeholders'),
      loadCollection<CommodityLot>(ctx, 'lots'),
      loadCollection<[string, number]>(ctx, 'stock'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ stakeholders, lots, stock, events });
    const result = engine.createCommodityLot(JSON.parse(payloadJson));
    const state = engine.exportState();
    const lotKey = ctx.stub.createCompositeKey('lot', [result.lotId]);
    await Promise.all([
      saveCollection(ctx, 'lots', state.lots),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(lotKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId, fabricTimestamp: isoTimestamp })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'CreateCommodityLot', txId, out);
    return JSON.stringify(out);
  }

  async DispatchLot(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('DispatchLot', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), dispatchTimestamp: isoTimestamp };
    const [stakeholders, lots, transfers, stock, alerts, events] = await Promise.all([
      loadCollection<Stakeholder>(ctx, 'stakeholders'),
      loadCollection<CommodityLot>(ctx, 'lots'),
      loadCollection<TransferOrder>(ctx, 'transfers'),
      loadCollection<[string, number]>(ctx, 'stock'),
      loadCollection<AuditAlert>(ctx, 'alerts'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ stakeholders, lots, transfers, stock, alerts, events });
    const result = engine.dispatchLot(payload);
    const state = engine.exportState();
    const transferKey = ctx.stub.createCompositeKey('transfer', [result.transferId]);
    await Promise.all([
      saveCollection(ctx, 'lots', state.lots),
      saveCollection(ctx, 'transfers', state.transfers),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(transferKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'DispatchLot', txId, out);
    return JSON.stringify(out);
  }

  async ReceiveLot(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('ReceiveLot', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), receiveTimestamp: isoTimestamp };
    const [lots, transfers, stock, alerts, events] = await Promise.all([
      loadCollection<CommodityLot>(ctx, 'lots'),
      loadCollection<TransferOrder>(ctx, 'transfers'),
      loadCollection<[string, number]>(ctx, 'stock'),
      loadCollection<AuditAlert>(ctx, 'alerts'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ lots, transfers, stock, alerts, events });
    const result = engine.receiveLot(payload);
    const state = engine.exportState();
    const transferKey = ctx.stub.createCompositeKey('transfer', [result.transferId]);
    await Promise.all([
      saveCollection(ctx, 'lots', state.lots),
      saveCollection(ctx, 'transfers', state.transfers),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(transferKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'ReceiveLot', txId, out);
    return JSON.stringify(out);
  }

  async AllocateToFPS(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('AllocateToFPS', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const [stakeholders, allocations, stock, events] = await Promise.all([
      loadCollection<Stakeholder>(ctx, 'stakeholders'),
      loadCollection<FPSAllocation>(ctx, 'allocations'),
      loadCollection<[string, number]>(ctx, 'stock'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ stakeholders, allocations, stock, events });
    const result = engine.allocateToFps(JSON.parse(payloadJson));
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'allocations', state.allocations),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'AllocateToFPS', txId, out);
    return JSON.stringify(out);
  }

  async RecordFPSReceipt(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RecordFPSReceipt', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), receiveTimestamp: isoTimestamp };
    const [allocations, stock, events] = await Promise.all([
      loadCollection<FPSAllocation>(ctx, 'allocations'),
      loadCollection<[string, number]>(ctx, 'stock'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ allocations, stock, events });
    const result = engine.recordFpsReceipt(payload);
    const state = engine.exportState();
    const allocationKey = ctx.stub.createCompositeKey('allocation', [result.allocationId]);
    await Promise.all([
      saveCollection(ctx, 'allocations', state.allocations),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(allocationKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'RecordFPSReceipt', txId, out);
    return JSON.stringify(out);
  }

  // ── Beneficiary auth & distribution ──────────────────────────────────────

  async RegisterBeneficiaryHash(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RegisterBeneficiaryHash', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const [authTransactions, events] = await Promise.all([
      loadCollection<{ authTxnId: string }>(ctx, 'authTransactions'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ authTransactions: authTransactions as never, events });
    const result = engine.simulateAuthentication(JSON.parse(payloadJson));
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'authTransactions', state.authTransactions),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'RegisterBeneficiaryHash', txId, out);
    return JSON.stringify(out);
  }

  async CreateMonthlyEntitlement(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('CreateMonthlyEntitlement', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const [entitlements, entitlementRules, events] = await Promise.all([
      loadCollection<MonthlyEntitlement>(ctx, 'entitlements'),
      loadCollection<EntitlementRule>(ctx, 'entitlementRules'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ entitlements, entitlementRules, events });
    const result = engine.createOrUpdateEntitlement(JSON.parse(payloadJson));
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'entitlements', state.entitlements),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'CreateMonthlyEntitlement', txId, out);
    return JSON.stringify(out);
  }

  async RecordDistribution(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RecordDistribution', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), timestamp: isoTimestamp };
    const [entitlements, distributions, stock, alerts, rationCards, events] = await Promise.all([
      loadCollection<MonthlyEntitlement>(ctx, 'entitlements'),
      loadCollection<{ distributionId: string }>(ctx, 'distributions'),
      loadCollection<[string, number]>(ctx, 'stock'),
      loadCollection<AuditAlert>(ctx, 'alerts'),
      loadCollection<RationCard>(ctx, 'rationCards'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ entitlements, distributions: distributions as never, stock, alerts, rationCards, events });
    const result = engine.recordDistribution(payload);
    const state = engine.exportState();
    const distKey = ctx.stub.createCompositeKey('distribution', [result.distributionId]);
    await Promise.all([
      saveCollection(ctx, 'distributions', state.distributions),
      saveCollection(ctx, 'entitlements', state.entitlements),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(distKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'RecordDistribution', txId, out);
    return JSON.stringify(out);
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  async RaiseAuditFlag(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RaiseAuditFlag', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const [alerts, events] = await Promise.all([
      loadCollection<AuditAlert>(ctx, 'alerts'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ alerts, events });
    const result = engine.raiseAuditFlag(JSON.parse(payloadJson));
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'RaiseAuditFlag', txId, out);
    return JSON.stringify(out);
  }

  async ResolveAuditFlag(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('ResolveAuditFlag', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const [alerts, events] = await Promise.all([
      loadCollection<AuditAlert>(ctx, 'alerts'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ alerts, events });
    const result = engine.resolveAuditAlert(JSON.parse(payloadJson));
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'ResolveAuditFlag', txId, out);
    return JSON.stringify(out);
  }

  async RecordLedgerProof(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RecordLedgerProof', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const events = await loadCollection<LedgerEvent>(ctx, 'events');
    const engine = buildEngine({ events });
    const result = engine.applyLedgerEvent(JSON.parse(payloadJson) as LedgerEvent);
    const state = engine.exportState();
    await saveCollection(ctx, 'events', state.events);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'RecordLedgerProof', txId, out);
    return JSON.stringify(out);
  }

  // ── Grievance management ──────────────────────────────────────────────────

  async FileGrievance(ctx: Context, payloadJson: string): Promise<string> {
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), filedAt: isoTimestamp };
    const [grievances, events] = await Promise.all([
      loadCollection<Grievance>(ctx, 'grievances'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ grievances, events });
    const result = engine.fileGrievance(payload);
    const state = engine.exportState();
    const grievanceKey = ctx.stub.createCompositeKey('grievance', [result.grievanceId]);
    await Promise.all([
      saveCollection(ctx, 'grievances', state.grievances),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(grievanceKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'FileGrievance', txId, out);
    return JSON.stringify(out);
  }

  async AcknowledgeGrievance(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('AcknowledgeGrievance', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), acknowledgedAt: isoTimestamp };
    const [grievances, events] = await Promise.all([
      loadCollection<Grievance>(ctx, 'grievances'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ grievances, events });
    const result = engine.acknowledgeGrievance(payload);
    const state = engine.exportState();
    const grievanceKey = ctx.stub.createCompositeKey('grievance', [result.grievanceId]);
    await Promise.all([
      saveCollection(ctx, 'grievances', state.grievances),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(grievanceKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'AcknowledgeGrievance', txId, out);
    return JSON.stringify(out);
  }

  async ResolveGrievance(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('ResolveGrievance', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), resolvedAt: isoTimestamp };
    const [grievances, events] = await Promise.all([
      loadCollection<Grievance>(ctx, 'grievances'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ grievances, events });
    const result = engine.resolveGrievance(payload);
    const state = engine.exportState();
    const grievanceKey = ctx.stub.createCompositeKey('grievance', [result.grievanceId]);
    await Promise.all([
      saveCollection(ctx, 'grievances', state.grievances),
      saveCollection(ctx, 'events', state.events),
      ctx.stub.putState(grievanceKey, Buffer.from(JSON.stringify({ ...result, fabricTxId: txId })))
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'ResolveGrievance', txId, out);
    return JSON.stringify(out);
  }

  async EscalateOverdueGrievances(ctx: Context, _payloadJson: string): Promise<string> {
    assertAuthorized('EscalateOverdueGrievances', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const [grievances, alerts, events] = await Promise.all([
      loadCollection<Grievance>(ctx, 'grievances'),
      loadCollection<AuditAlert>(ctx, 'alerts'),
      loadCollection<LedgerEvent>(ctx, 'events')
    ]);
    const engine = buildEngine({ grievances, alerts, events });
    const result = engine.escalateOverdueGrievances({ currentTimestamp: isoTimestamp });
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'grievances', state.grievances),
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'EscalateOverdueGrievances', txId, out);
    return JSON.stringify(out);
  }

  // ── Data-plane queries ────────────────────────────────────────────────────

  async GetLotHistory(ctx: Context, payloadJson: string): Promise<string> {
    const { lotId } = JSON.parse(payloadJson) as { lotId: string };
    const events = await loadCollection<LedgerEvent>(ctx, 'events');
    return JSON.stringify(buildEngine({ events }).getLotHistory(lotId));
  }

  async GetDistributionHistory(ctx: Context, payloadJson: string): Promise<string> {
    const { distributionId } = JSON.parse(payloadJson) as { distributionId: string };
    const events = await loadCollection<LedgerEvent>(ctx, 'events');
    return JSON.stringify(buildEngine({ events }).getDistributionHistory(distributionId));
  }

  async GetCurrentStock(ctx: Context): Promise<string> {
    const stock = await loadCollection<[string, number]>(ctx, 'stock');
    return JSON.stringify(stock);
  }

  async VerifyDatabaseHash(ctx: Context, payloadJson: string): Promise<string> {
    const { digest } = JSON.parse(payloadJson) as { digest: string };
    const events = await loadCollection<LedgerEvent>(ctx, 'events');
    return JSON.stringify(buildEngine({ events }).verifyDatabaseHash({ digest }));
  }

  async CheckDuplicateClaim(ctx: Context, payloadJson: string): Promise<string> {
    const payload = JSON.parse(payloadJson) as { rationCardHash: string; commodity: string; month: string; requestedQtyKg: number };
    const entitlements = await loadCollection<MonthlyEntitlement>(ctx, 'entitlements');
    return JSON.stringify(buildEngine({ entitlements }).checkDuplicateClaim(payload));
  }

  async GetDistributionsByFPS(ctx: Context, payloadJson: string): Promise<string> {
    const { fpsId } = JSON.parse(payloadJson) as { fpsId: string };
    const distributions = await loadCollection<{ fpsId: string }>(ctx, 'distributions');
    return JSON.stringify(distributions.filter((d) => d.fpsId === fpsId));
  }

  /**
   * Returns Fabric's cryptographically-signed key history for a composite entity key
   * (e.g. lot~{lotId}, distribution~{id}). Each record carries the Fabric txId and
   * peer-signed timestamp — the strongest possible provenance proof.
   */
  async GetEntityHistory(ctx: Context, payloadJson: string): Promise<string> {
    const { key } = JSON.parse(payloadJson) as { key: string };
    const iterator = await ctx.stub.getHistoryForKey(key);
    const history: Array<{ txId: string; timestamp: string; isDelete: boolean; value: unknown }> = [];
    for await (const result of iterator) {
      history.push({
        txId: result.txId,
        timestamp: new Date(Number(result.timestamp?.seconds ?? 0) * 1000).toISOString(),
        isDelete: result.isDelete,
        value: result.value?.length ? JSON.parse(Buffer.from(result.value).toString()) : null
      });
    }
    return JSON.stringify(history);
  }
}

// Both contracts registered so the Fabric peer loads them both from this chaincode package.
export const contracts: Array<new () => Contract> = [PdsControlContract, PdsDataContract];
