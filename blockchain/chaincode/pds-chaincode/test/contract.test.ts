import { describe, expect, it } from 'vitest';
import type { Context } from 'fabric-contract-api';
import { PdsControlContract, PdsDataContract } from '../src/contract.js';
import { assertAuthorized, type ClientIdentity } from '../src/authorization.js';
import { EntitlementRuleStatus } from '@pds/shared-types';
import { createHash } from 'node:crypto';

/**
 * Minimal in-memory fabric Context stub: a key-value store backed by a Map and
 * a clientIdentity whose MSPID is read from a mutable holder so a single
 * scenario can act under different identities against the same state.
 */
const makeContext = (mspHolder: { mspId: string }): Context => {
  const state = new Map<string, Buffer>();
  let txCounter = 0;
  const iteratorFor = (entries: Array<[string, Buffer]>) => {
    let index = 0;
    return {
      next: async () => index < entries.length
        ? { done: false, value: { key: entries[index]![0], value: entries[index++]![1] } }
        : { done: true },
      close: async () => undefined
    };
  };
  const stub = {
    getState: async (key: string): Promise<Buffer> => Promise.resolve(state.get(key) ?? Buffer.alloc(0)),
    putState: async (key: string, value: Buffer): Promise<void> => { state.set(key, value); },
    createCompositeKey: (objectType: string, attributes: string[]): string => `\x00${objectType}\x00${attributes.join('\x00')}\x00`,
    splitCompositeKey: (key: string) => {
      const parts = key.split('\x00').filter(Boolean);
      return { objectType: parts[0], attributes: parts.slice(1) };
    },
    getStateByPartialCompositeKey: async (objectType: string, attributes: string[]) => {
      const prefix = `\x00${objectType}\x00${attributes.length > 0 ? `${attributes.join('\x00')}\x00` : ''}`;
      return iteratorFor([...state.entries()].filter(([key]) => key.startsWith(prefix)));
    },
    setEvent: (_name: string, _payload: Buffer): void => { /* captured for side-effect only */ },
    getTxID: (): string => `mock-tx-${++txCounter}`,
    getTxTimestamp: () => ({ seconds: BigInt(Math.floor(Date.now() / 1000)), nanos: 0 })
  };
  const clientIdentity = {
    getMSPID: () => mspHolder.mspId,
    getAttributeValue: (_name: string) => undefined
  };
  return { stub, clientIdentity } as unknown as Context;
};

const stakeholder = (id: string, type: string) => ({
  stakeholderId: id,
  stakeholderType: type,
  name: id,
  district: 'Bengaluru',
  licenseNo: `LIC-${id}`,
  status: 'ACTIVE'
});

describe('PdsControlContract / PdsDataContract authorization (T1.5)', () => {
  it('allows CreateCommodityLot from ProcurementMillerMSP and rejects FairPriceShopMSP', async () => {
    const msp = { mspId: 'FoodAndCivilSuppliesMSP' };
    const ctx = makeContext(msp);
    const control = new PdsControlContract();
    const data = new PdsDataContract();

    // Department registers the procurement center stakeholder.
    await control.RegisterStakeholder(ctx, JSON.stringify(stakeholder('PROC-001', 'PROCUREMENT_CENTER')));

    // Procurement creates a lot.
    msp.mspId = 'ProcurementMillerMSP';
    const lotPayload = {
      lotId: 'LOT-AUTH-001',
      commodity: 'Rice',
      season: 'Kharif 2026',
      quantityKg: 100,
      qualityGrade: 'A',
      source: 'Procurement Centre 01',
      currentOwner: 'PROC-001',
      currentLocation: 'Procurement Yard'
    };
    await expect(data.CreateCommodityLot(ctx, JSON.stringify(lotPayload))).resolves.toBeDefined();

    // FairPriceShopMSP is NOT authorized to create commodity lots.
    msp.mspId = 'FairPriceShopMSP';
    await expect(data.CreateCommodityLot(ctx, JSON.stringify({ ...lotPayload, lotId: 'LOT-AUTH-002' }))).rejects.toThrow(
      /not authorized/
    );
  });

  it('treats duplicate identical stakeholder replay as idempotent', async () => {
    const msp = { mspId: 'FoodAndCivilSuppliesMSP' };
    const ctx = makeContext(msp);
    const control = new PdsControlContract();
    const payload = stakeholder('PROC-001', 'PROCUREMENT_CENTER');

    await expect(control.RegisterStakeholder(ctx, JSON.stringify(payload))).resolves.toBeDefined();
    await expect(control.RegisterStakeholder(ctx, JSON.stringify(payload))).resolves.toBeDefined();
    await expect(
      control.RegisterStakeholder(ctx, JSON.stringify({ ...payload, name: 'Different Name' }))
    ).rejects.toThrow(/already exists/);
  });

  it('RecordLedgerProof is gated and rejects malformed proofs', async () => {
    const msp = { mspId: 'FairPriceShopMSP' };
    const ctx = makeContext(msp);
    const data = new PdsDataContract();
    await expect(
      data.RecordLedgerProof(
        ctx,
        JSON.stringify({
          eventId: 'TX-X', operationId: 'OP-X', schemaVersion: 1,
          entityType: 'lot',
          entityId: 'LOT-1',
          eventType: 'CreateCommodityLot',
          payloadHash: 'a'.repeat(64), proofPayload: {},
          actor: { subject: 'user', applicationRole: 'FPS', submittingOrganization: 'FairPriceShopMSP' },
          businessTimestamp: '2026-06-01T00:00:00.000Z'
        })
      )
    ).rejects.toThrow(/not authorized/);

    msp.mspId = 'AuditAuthorityMSP';
    await expect(
      data.RecordLedgerProof(
        ctx,
        JSON.stringify({
          eventId: 'TX-Y', operationId: 'OP-Y', schemaVersion: 1,
          entityType: 'lot',
          entityId: 'LOT-1',
          eventType: 'TotallyBogusEventType',
          payloadHash: 'bad', proofPayload: {},
          actor: { subject: 'user', applicationRole: 'AUDITOR', submittingOrganization: 'AuditAuthorityMSP' },
          businessTimestamp: '2026-06-01T00:00:00.000Z'
        })
      )
    ).rejects.toThrow(/Invalid LedgerProof/);

    msp.mspId = 'FoodAndCivilSuppliesMSP';
    await expect(
      data.RecordLedgerProof(
        ctx,
        JSON.stringify({
          eventId: 'TX-Z', operationId: 'OP-Z', schemaVersion: 2,
          entityType: 'lot',
          entityId: 'LOT-1',
          eventType: 'TotallyBogusEventType',
          payloadHash: 'a'.repeat(64), proofPayload: {},
          actor: { subject: 'user', applicationRole: 'DEPARTMENT', submittingOrganization: 'FoodAndCivilSuppliesMSP' },
          businessTimestamp: '2026-06-01T00:00:00.000Z'
        })
      )
    ).rejects.toThrow(/Invalid LedgerProof/);
  });

  it('records identical proofs idempotently and rejects conflicting event IDs', async () => {
    const msp = { mspId: 'FoodAndCivilSuppliesMSP' };
    const ctx = makeContext(msp);
    const data = new PdsDataContract();
    const proof = {
      eventId: 'EVT-1', operationId: 'OP-1', schemaVersion: 1,
      entityType: 'lot', entityId: 'LOT-1', eventType: 'DispatchLot',
      actor: { subject: 'api', applicationRole: 'DEPARTMENT', submittingOrganization: msp.mspId },
      payloadHash: createHash('sha256').update('{}').digest('hex'), proofPayload: {},
      businessTimestamp: '2026-06-01T00:00:00.000Z'
    };
    await expect(data.RecordLedgerProof(ctx, JSON.stringify(proof))).resolves.toContain('"duplicate":false');
    await expect(data.RecordLedgerProof(ctx, JSON.stringify(proof))).resolves.toContain('"duplicate":true');
    await expect(data.RecordLedgerProof(ctx, JSON.stringify({ ...proof, operationId: 'OP-2' }))).rejects.toThrow(/Conflicting/);
  });
});

describe('assertAuthorized (unit)', () => {
  const identity = (mspId: string): ClientIdentity => ({
    getMSPID: () => mspId,
    getAttributeValue: () => undefined
  });

  it('allows mapped MSP and rejects unmapped MSP', () => {
    expect(() => assertAuthorized('RecordDistribution', identity('FairPriceShopMSP'))).not.toThrow();
    expect(() => assertAuthorized('RecordDistribution', identity('GodownWarehouseMSP'))).toThrow(/not authorized/);
  });

  it('AllocateToFPS and RecordDistribution MSP gating', () => {
    const godown = identity('GodownWarehouseMSP');
    const fps = identity('FairPriceShopMSP');
    const department = identity('FoodAndCivilSuppliesMSP');
    expect(() => assertAuthorized('AllocateToFPS', godown)).not.toThrow();
    expect(() => assertAuthorized('AllocateToFPS', department)).not.toThrow();
    expect(() => assertAuthorized('AllocateToFPS', fps)).toThrow(/not authorized/);
    expect(() => assertAuthorized('RecordDistribution', fps)).not.toThrow();
    expect(() => assertAuthorized('RecordDistribution', department)).not.toThrow();
    expect(() => assertAuthorized('RecordDistribution', godown)).toThrow(/not authorized/);
  });

  it('allows the department MSP to orchestrate demo supply-chain writes in fabric mode', () => {
    const department = identity('FoodAndCivilSuppliesMSP');
    expect(() => assertAuthorized('CreateCommodityLot', department)).not.toThrow();
    expect(() => assertAuthorized('DispatchLot', department)).not.toThrow();
    expect(() => assertAuthorized('ReceiveLot', department)).not.toThrow();
    expect(() => assertAuthorized('RecordFPSReceipt', department)).not.toThrow();
    expect(() => assertAuthorized('RegisterBeneficiaryHash', department)).not.toThrow();
    expect(() => assertAuthorized('RecordLedgerProof', department)).not.toThrow();
  });

  it('does not gate unmapped (query) operations', () => {
    expect(() => assertAuthorized('GetCurrentStock', identity('AnyMSP'))).not.toThrow();
  });

  it('new operations have correct MSP gates', () => {
    expect(() => assertAuthorized('IssueRationCard', identity('FoodAndCivilSuppliesMSP'))).not.toThrow();
    expect(() => assertAuthorized('IssueRationCard', identity('FairPriceShopMSP'))).toThrow(/not authorized/);
    expect(() => assertAuthorized('SuspendRationCard', identity('AuditAuthorityMSP'))).not.toThrow();
    expect(() => assertAuthorized('SuspendRationCard', identity('GodownWarehouseMSP'))).toThrow(/not authorized/);
    expect(() => assertAuthorized('AcknowledgeGrievance', identity('FairPriceShopMSP'))).not.toThrow();
    expect(() => assertAuthorized('EscalateOverdueGrievances', identity('AuditAuthorityMSP'))).not.toThrow();
    expect(() => assertAuthorized('EscalateOverdueGrievances', identity('FairPriceShopMSP'))).toThrow(/not authorized/);
    expect(() => assertAuthorized('ProposeEntitlementRule', identity('FoodAndCivilSuppliesMSP'))).not.toThrow();
    expect(() => assertAuthorized('ApproveEntitlementRule', identity('AuditAuthorityMSP'))).not.toThrow();
    expect(() => assertAuthorized('ApproveEntitlementRule', identity('FoodAndCivilSuppliesMSP'))).toThrow(/not authorized/);
    expect(() => assertAuthorized('RolloverUnclaimedQuota', identity('FoodAndCivilSuppliesMSP'))).not.toThrow();
  });
});

describe('PdsControlContract / PdsDataContract Fabric-native primitives (Tier 1)', () => {
  it('IssueRationCard returns a real-looking Fabric txId as ledgerTxId', async () => {
    const msp = { mspId: 'FoodAndCivilSuppliesMSP' };
    const ctx = makeContext(msp);
    const control = new PdsControlContract();
    const raw = await control.IssueRationCard(ctx, JSON.stringify({ rationCardHash: 'abcdef1234567890', cardType: 'BPL', assignedFpsId: 'FPS-001' }));
    const result = JSON.parse(raw) as { ledgerTxId: string };
    expect(result.ledgerTxId).toMatch(/^mock-tx-/);
  });

  it('ProposeEntitlementRule stamps proposedBy from MSP identity and returns PENDING_APPROVAL', async () => {
    const msp = { mspId: 'FoodAndCivilSuppliesMSP' };
    const ctx = makeContext(msp);
    const control = new PdsControlContract();
    const raw = await control.ProposeEntitlementRule(ctx, JSON.stringify({ ruleId: 'R1', category: 'BPL', commodity: 'Rice', monthlyKg: 20, effectiveFrom: '2026-01' }));
    const rule = JSON.parse(raw) as { proposedBy: string; status: string };
    expect(rule.proposedBy).toBe('FoodAndCivilSuppliesMSP');
    expect(rule.status).toBe(EntitlementRuleStatus.PENDING_APPROVAL);
  });

  it('ApproveEntitlementRule stamps approvedBy from MSP identity', async () => {
    const msp = { mspId: 'FoodAndCivilSuppliesMSP' };
    const ctx = makeContext(msp);
    const control = new PdsControlContract();
    await control.ProposeEntitlementRule(ctx, JSON.stringify({ ruleId: 'R2', category: 'AAY', commodity: 'Wheat', monthlyKg: 35, effectiveFrom: '2026-01' }));
    msp.mspId = 'AuditAuthorityMSP';
    const raw = await control.ApproveEntitlementRule(ctx, JSON.stringify({ ruleId: 'R2' }));
    const rule = JSON.parse(raw) as { approvedBy: string; status: string };
    expect(rule.approvedBy).toBe('AuditAuthorityMSP');
    expect(rule.status).toBe(EntitlementRuleStatus.ACTIVE);
  });

  it('FileGrievance is ungated and uses consensus timestamp as filedAt', async () => {
    const msp = { mspId: 'GodownWarehouseMSP' };
    const ctx = makeContext(msp);
    const data = new PdsDataContract();
    const raw = await data.FileGrievance(ctx, JSON.stringify({
      grievanceId: 'GRV-CONTRACT-001',
      rationCardHash: 'abcdef1234567890',
      fpsId: 'FPS-001',
      grievanceType: 'NOT_RECEIVED',
      description: 'Did not receive ration'
    }));
    const grievance = JSON.parse(raw) as { filedAt: string; slaDeadlineAt: string; status: string };
    expect(grievance.status).toBe('OPEN');
    expect(grievance.filedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(grievance.slaDeadlineAt).toBeDefined();
  });
});
