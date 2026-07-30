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
import { createHash } from 'node:crypto';
import type {
  AuditAlert,
  CommodityLot,
  DistributionTransaction,
  EntitlementRule,
  FPSAllocation,
  Grievance,
  LedgerEvent,
  LedgerProof,
  MonthlyEntitlement,
  Stakeholder,
  TransferOrder
} from '@pds/shared-types';
import type { PdsLedgerEngine } from './index.js';
import { assertAuthorized } from './authorization.js';
import {
  buildEngine,
  emitAndLog,
  getTxTimestamp,
  identityFromContext,
  loadCollection,
  saveCollection,
  queryState,
  loadSelective,
  readState
} from './contract-base.js';

type StockKey = `${string}:${string}`;

type StoredLedgerProof = { docType: 'proof'; proof: LedgerProof; fabricTxId: string };

const proofAsLedgerEvent = ({ proof }: StoredLedgerProof): LedgerEvent => ({
  ledgerTxId: proof.eventId,
  entityType: proof.entityType as LedgerEvent['entityType'],
  entityId: proof.entityId,
  eventType: proof.eventType,
  payload: proof.proofPayload,
  timestamp: proof.businessTimestamp
});

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
};

const assertNoSensitiveProofFields = (value: unknown): void => {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach(assertNoSensitiveProofFields);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const opaqueApproved = /(hash|refhash|digest)$/.test(normalizedKey);
    const prohibitedIdentityAlias = ['aadhaar', 'mobile', 'phone', 'otp', 'biometric']
      .some((term) => normalizedKey.includes(term)) && !opaqueApproved;
    const prohibitedRationCard = normalizedKey.includes('rationcard') && !opaqueApproved;
    if (prohibitedIdentityAlias || prohibitedRationCard) {
      throw new Error(`LedgerProof contains prohibited personal data field: ${key}`);
    }
    assertNoSensitiveProofFields(child);
  }
};

// ── Control Plane Contract ────────────────────────────────────────────────────

export class PdsControlContract extends Contract {

  async RegisterStakeholder(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RegisterStakeholder', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const payload = JSON.parse(payloadJson) as Stakeholder;
    const partialState = await loadSelective(ctx, {
      stakeholders: [payload.stakeholderId]
    });
    const existing = partialState.stakeholders?.find((stakeholder) => stakeholder.stakeholderId === payload.stakeholderId);
    if (existing) {
      const persisted = { ...existing } as Stakeholder & { docType?: string };
      delete persisted.docType;
      if (canonicalJson(persisted) !== canonicalJson(payload)) {
        throw new Error(`Stakeholder ${payload.stakeholderId} already exists`);
      }
      const out = { stakeholder: existing, ledgerTxId: txId };
      emitAndLog(ctx, 'control', 'RegisterStakeholder', txId, out);
      return JSON.stringify(out);
    }
    const engine = buildEngine(partialState, ctx);
    const result = engine.registerStakeholder(payload);
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
    const partialState = await loadSelective(ctx, {
      rationCards: [payload.rationCardHash]
    });
    const engine = buildEngine(partialState, ctx);
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
    const payload = JSON.parse(payloadJson) as { rationCardHash: string };
    const partialState = await loadSelective(ctx, {
      rationCards: [payload.rationCardHash]
    });
    const engine = buildEngine(partialState, ctx);
    const result = engine.activateRationCard(payload);
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
    const partialState = await loadSelective(ctx, {
      rationCards: [payload.rationCardHash],
      alerts: payload.alertId ? [payload.alertId] : []
    });
    const engine = buildEngine(partialState, ctx);
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
    const partialState = await loadSelective(ctx, {
      rationCards: [payload.rationCardHash],
      stakeholders: [payload.newFpsId]
    });
    const engine = buildEngine(partialState, ctx);
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
    const partialState = await loadSelective(ctx, {
      entitlementRules: [payload.ruleId]
    });
    const engine = buildEngine(partialState, ctx);
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
    const partialState = await loadSelective(ctx, {
      entitlementRules: [payload.ruleId]
    });
    const engine = buildEngine(partialState, ctx);
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
    const payload = JSON.parse(payloadJson) as Parameters<PdsLedgerEngine['rolloverUnclaimedQuota']>[0];
    const entitlements = await queryState<MonthlyEntitlement>(ctx, {
      selector: {
        docType: 'entitlement',
        month: payload.fromMonth,
        commodity: payload.commodity
      }
    });
    const engine = buildEngine({ entitlements, events: [] }, ctx);
    const result = engine.rolloverUnclaimedQuota(payload);
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
    const entitlementRules = await queryState<EntitlementRule>(ctx, {
      selector: {
        docType: 'entitlementrule',
        status: 'ACTIVE'
      }
    });
    return JSON.stringify(entitlementRules);
  }

  async GetRationCardHistory(ctx: Context, payloadJson: string): Promise<string> {
    const { rationCardHash } = JSON.parse(payloadJson) as { rationCardHash: string };
    const events = await queryState<LedgerEvent>(ctx, {
      selector: {
        docType: 'event',
        entityType: 'rationcard',
        entityId: rationCardHash
      }
    });
    return JSON.stringify(events);
  }

  async GetStakeholdersByType(ctx: Context, payloadJson: string): Promise<string> {
    const { type } = JSON.parse(payloadJson) as { type: string };
    const stakeholders = await queryState<Stakeholder>(ctx, {
      selector: {
        docType: 'stakeholder',
        stakeholderType: type
      }
    });
    return JSON.stringify(stakeholders);
  }
}

// ── Data Plane Contract ───────────────────────────────────────────────────────

export class PdsDataContract extends Contract {

  // ── Supply chain ──────────────────────────────────────────────────────────

  async CreateCommodityLot(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('CreateCommodityLot', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const payload = JSON.parse(payloadJson) as Omit<CommodityLot, 'status' | 'createdAt'>;
    const partialState = await loadSelective(ctx, {
      stakeholders: [payload.currentOwner],
      lots: [payload.lotId],
      stock: [{ org: payload.currentOwner, commodity: payload.commodity }]
    });
    const engine = buildEngine(partialState, ctx);
    const result = engine.createCommodityLot(payload);
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'lots', state.lots),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'events', state.events)
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
    const lot = await readState<CommodityLot>(ctx, 'lot', [payload.lotId]);
    if (!lot) {
      throw new Error(`Lot ${payload.lotId} not found`);
    }
    const partialState = await loadSelective(ctx, {
      stakeholders: [payload.fromOrg, payload.toOrg, payload.transporterId],
      lots: [payload.lotId],
      transfers: [payload.transferId],
      stock: [{ org: payload.fromOrg, commodity: lot.commodity }]
    });
    if (lot.currentOwner !== payload.fromOrg) {
      const targetRoot = lot.rootLotId ?? lot.lotId;
      const lineageLots = (await loadCollection<CommodityLot>(ctx, 'lots')).filter(
        (item) =>
          item.lotId === lot.lotId ||
          (item.commodity === lot.commodity &&
            (item.rootLotId === targetRoot || item.parentLotId === lot.lotId || item.lotId === targetRoot))
      );
      partialState.lots = lineageLots;
    }
    const events = await queryState<LedgerEvent>(ctx, {
      selector: {
        docType: 'event',
        entityId: payload.transferId
      }
    });
    partialState.events = events;
    const engine = buildEngine(partialState, ctx);
    const result = engine.dispatchLot(payload);
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'lots', state.lots),
      saveCollection(ctx, 'transfers', state.transfers),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events)
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
    const transfer = await readState<TransferOrder>(ctx, 'transfer', [payload.transferId]);
    if (!transfer) {
      throw new Error(`Transfer ${payload.transferId} not found`);
    }
    const lot = await readState<CommodityLot>(ctx, 'lot', [transfer.lotId]);
    if (!lot) {
      throw new Error(`Lot ${transfer.lotId} not found`);
    }
    const partialState = await loadSelective(ctx, {
      lots: [transfer.lotId],
      transfers: [payload.transferId],
      stock: [{ org: transfer.toOrg, commodity: lot.commodity }]
    });
    const engine = buildEngine(partialState, ctx);
    const result = engine.receiveLot(payload);
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'lots', state.lots),
      saveCollection(ctx, 'transfers', state.transfers),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'ReceiveLot', txId, out);
    return JSON.stringify(out);
  }

  async AllocateToFPS(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('AllocateToFPS', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const payload = JSON.parse(payloadJson);
    const partialState = await loadSelective(ctx, {
      stakeholders: [payload.fpsId, payload.sourceGodownId, payload.transporterId],
      allocations: [payload.allocationId],
      stock: [{ org: payload.sourceGodownId, commodity: payload.commodity }]
    });
    const engine = buildEngine(partialState, ctx);
    const result = engine.allocateToFps(payload);
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
    const allocation = await readState<FPSAllocation>(ctx, 'allocation', [payload.allocationId]);
    if (!allocation) {
      throw new Error(`Allocation ${payload.allocationId} not found`);
    }
    const partialState = await loadSelective(ctx, {
      allocations: [payload.allocationId],
      stock: [{ org: allocation.fpsId, commodity: allocation.commodity }]
    });
    const engine = buildEngine(partialState, ctx);
    const result = engine.recordFpsReceipt(payload);
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'allocations', state.allocations),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'RecordFPSReceipt', txId, out);
    return JSON.stringify(out);
  }

  // ── Beneficiary auth & distribution ──────────────────────────────────────

  async RegisterBeneficiaryHash(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RegisterBeneficiaryHash', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const payload = JSON.parse(payloadJson) as Parameters<PdsLedgerEngine['simulateAuthentication']>[0];
    const partialState = await loadSelective(ctx, {
      authTransactions: [payload.authTxnId]
    });
    const engine = buildEngine({ authTransactions: partialState.authTransactions as never, events: [] }, ctx);
    const result = engine.simulateAuthentication(payload);
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
    const payload = JSON.parse(payloadJson) as Parameters<PdsLedgerEngine['createOrUpdateEntitlement']>[0];
    const [partialState, entitlementRules] = await Promise.all([
      loadSelective(ctx, {
        entitlements: [{ rationCardHash: payload.rationCardHash, commodity: payload.commodity, month: payload.month }]
      }),
      queryState<EntitlementRule>(ctx, { selector: { docType: 'entitlementrule' } })
    ]);
    partialState.entitlementRules = entitlementRules;
    const engine = buildEngine(partialState, ctx);
    const result = engine.createOrUpdateEntitlement(payload);
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
    const month = payload.timestamp ? payload.timestamp.slice(0, 7) : isoTimestamp.slice(0, 7);
    const partialState = await loadSelective(ctx, {
      distributions: [payload.distributionId],
      entitlements: [{ rationCardHash: payload.rationCardHash, commodity: payload.commodity, month }],
      stock: [{ org: payload.fpsId, commodity: payload.commodity }],
      rationCards: [payload.rationCardHash]
    });
    const engine = buildEngine(partialState, ctx);
    const result = engine.recordDistribution(payload);
    const state = engine.exportState();
    await Promise.all([
      saveCollection(ctx, 'distributions', state.distributions),
      saveCollection(ctx, 'entitlements', state.entitlements),
      saveCollection(ctx, 'stock', state.stock),
      saveCollection(ctx, 'alerts', state.alerts),
      saveCollection(ctx, 'events', state.events)
    ]);
    const out = { ...result, ledgerTxId: txId };
    emitAndLog(ctx, 'data', 'RecordDistribution', txId, out);
    return JSON.stringify(out);
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  async RaiseAuditFlag(ctx: Context, payloadJson: string): Promise<string> {
    assertAuthorized('RaiseAuditFlag', identityFromContext(ctx));
    const txId = ctx.stub.getTxID();
    const payload = JSON.parse(payloadJson) as Parameters<PdsLedgerEngine['raiseAuditFlag']>[0] & { alertId?: string };
    const partialState = await loadSelective(ctx, {
      alerts: payload.alertId ? [payload.alertId] : []
    });
    const engine = buildEngine(partialState, ctx);
    const result = engine.raiseAuditFlag(payload);
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
    const payload = JSON.parse(payloadJson) as Parameters<PdsLedgerEngine['resolveAuditAlert']>[0];
    const partialState = await loadSelective(ctx, {
      alerts: [payload.alertId]
    });
    const engine = buildEngine(partialState, ctx);
    const result = engine.resolveAuditAlert(payload);
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
    const proof = JSON.parse(payloadJson) as import('@pds/shared-types').LedgerProof;
    if (!proof.eventId || !proof.operationId || !proof.entityId || !proof.eventType || proof.schemaVersion !== 1) {
      throw new Error('Invalid LedgerProof: required identifiers and schemaVersion 1 are mandatory');
    }
    if (!/^[a-f0-9]{64}$/.test(proof.payloadHash) || !proof.actor?.subject || !proof.actor.applicationRole || !proof.actor.submittingOrganization) {
      throw new Error('Invalid LedgerProof: actor and SHA-256 payloadHash are mandatory');
    }
    const proofKey = ctx.stub.createCompositeKey('proof', [proof.eventId]);
    const existing = await ctx.stub.getState(proofKey);
    assertNoSensitiveProofFields(proof.proofPayload);
    const calculatedHash = createHash('sha256').update(canonicalJson(proof.proofPayload)).digest('hex');
    if (calculatedHash !== proof.payloadHash) throw new Error('Invalid LedgerProof: payloadHash does not match proofPayload');
    const canonical = canonicalJson(proof);
    if (existing.length > 0) {
      const existingProof = JSON.parse(Buffer.from(existing).toString('utf8')) as { proof: unknown; fabricTxId: string };
      if (canonicalJson(existingProof.proof) !== canonical) {
        throw new Error(`Conflicting LedgerProof for eventId ${proof.eventId}`);
      }
      return JSON.stringify({ eventId: proof.eventId, fabricTxId: existingProof.fabricTxId, duplicate: true });
    }
    await ctx.stub.putState(proofKey, Buffer.from(JSON.stringify({ docType: 'proof', proof, fabricTxId: txId })));
    const out = { eventId: proof.eventId, operationId: proof.operationId, fabricTxId: txId, duplicate: false };
    emitAndLog(ctx, 'data', 'RecordLedgerProof', txId, out);
    return JSON.stringify(out);
  }

  // ── Grievance management ──────────────────────────────────────────────────

  async FileGrievance(ctx: Context, payloadJson: string): Promise<string> {
    const txId = ctx.stub.getTxID();
    const isoTimestamp = getTxTimestamp(ctx);
    const payload = { ...JSON.parse(payloadJson), filedAt: isoTimestamp };
    const partialState = await loadSelective(ctx, {
      grievances: [payload.grievanceId]
    });
    const engine = buildEngine(partialState, ctx);
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
    const partialState = await loadSelective(ctx, {
      grievances: [payload.grievanceId]
    });
    const engine = buildEngine(partialState, ctx);
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
    const partialState = await loadSelective(ctx, {
      grievances: [payload.grievanceId]
    });
    const engine = buildEngine(partialState, ctx);
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
    const engine = buildEngine({ grievances, alerts, events }, ctx);
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
    const proofs = await queryState<StoredLedgerProof>(ctx, {
      selector: {
        docType: 'proof',
        'proof.entityType': 'lot',
        'proof.entityId': lotId
      }
    });
    return JSON.stringify(proofs.map(proofAsLedgerEvent));
  }

  async GetDistributionHistory(ctx: Context, payloadJson: string): Promise<string> {
    const { distributionId } = JSON.parse(payloadJson) as { distributionId: string };
    const proofs = await queryState<StoredLedgerProof>(ctx, {
      selector: {
        docType: 'proof',
        'proof.entityType': 'distribution',
        'proof.entityId': distributionId
      }
    });
    return JSON.stringify(proofs.map(proofAsLedgerEvent));
  }

  async GetCurrentStock(ctx: Context): Promise<string> {
    const stock = await loadCollection<[StockKey, number]>(ctx, 'stock');
    return JSON.stringify(stock);
  }

  async VerifyDatabaseHash(ctx: Context, payloadJson: string): Promise<string> {
    const { digest } = JSON.parse(payloadJson) as { digest: string };
    const events = await loadCollection<LedgerEvent>(ctx, 'events');
    return JSON.stringify(buildEngine({ events }, ctx).verifyDatabaseHash({ digest }));
  }

  async CheckDuplicateClaim(ctx: Context, payloadJson: string): Promise<string> {
    const payload = JSON.parse(payloadJson) as { rationCardHash: string; commodity: string; month: string; requestedQtyKg: number };
    const entitlements = await loadCollection<MonthlyEntitlement>(ctx, 'entitlements');
    return JSON.stringify(buildEngine({ entitlements }, ctx).checkDuplicateClaim(payload));
  }

  async GetDistributionsByFPS(ctx: Context, payloadJson: string): Promise<string> {
    const { fpsId } = JSON.parse(payloadJson) as { fpsId: string };
    const distributions = await queryState<DistributionTransaction>(ctx, {
      selector: {
        docType: 'distribution',
        fpsId: fpsId
      }
    });
    return JSON.stringify(distributions);
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
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) {
          break;
        }
        const result = next.value;
        history.push({
          txId: result.txId,
          timestamp: new Date(Number(result.timestamp?.seconds ?? 0) * 1000).toISOString(),
          isDelete: result.isDelete,
          value: result.value?.length ? JSON.parse(Buffer.from(result.value).toString()) : null
        });
      }
    } finally {
      iterator.close();
    }
    return JSON.stringify(history);
  }
}

// Both contracts registered so the Fabric peer loads them both from this chaincode package.
export const contracts: Array<new () => Contract> = [PdsControlContract, PdsDataContract];
