import { describe, expect, it } from 'vitest';
import { AlertType, AuthMode, AuthResult, TransferStatus } from '@pds/shared-types';
import { demoLots } from '../src/demo-model.js';
import {
  applyMockWorkflowAction,
  getNextWorkflowAction,
  getRoleQueue,
  getWorkflowProgress,
  type WorkflowContext
} from '../src/workflow-actions.js';

const emptyContext: WorkflowContext = {
  lots: demoLots,
  transfers: [],
  allocations: [],
  authTransactions: [],
  distributions: [],
  alerts: [],
  ledgerEvents: []
};

const completedTransfers = [
  ['TR-POC-FCI-BUF', 'FCI-001', 'FCI-BUF-001', 1000],
  ['TR-POC-BUF-DEPOT', 'FCI-BUF-001', 'GODOWN-S-001', 1000],
  ['TR-POC-DEPOT-MILLER', 'GODOWN-S-001', 'MLL-001', 1000],
  ['TR-POC-MILLER-ISSUE', 'MLL-001', 'ISSUE-001', 850],
  ['TR-POC-ISSUE-FPS', 'ISSUE-001', 'FPS-101', 300],
  ['TR-POC-ISSUE-WI', 'ISSUE-001', 'WI-101', 200],
  ['TR-POC-ISSUE-SBE', 'ISSUE-001', 'SBE-101', 200]
].map(([transferId, fromOrg, toOrg, qty]) => ({
  transferId: String(transferId),
  lotId: 'LOT-RICE-2026-002',
  fromOrg: String(fromOrg),
  toOrg: String(toOrg),
  dispatchedQtyKg: Number(qty),
  receivedQtyKg: Number(qty),
  vehicleNo: 'KA01AB2000',
  status: TransferStatus.RECEIVED,
  dispatchTimestamp: '2026-06-09T10:00:00.000Z',
  receiveTimestamp: '2026-06-09T11:00:00.000Z'
}));

describe('workflow actions', () => {
  it('starts with an RO-lite approval queue for control offices', () => {
    const action = getNextWorkflowAction(emptyContext);
    expect(action?.request.kind).toBe('authorize-movement');
    expect(getRoleQueue(emptyContext, 'CONTROL_OFFICE')).toHaveLength(1);
  });

  it('records mock RO approval as ledger evidence', () => {
    const result = applyMockWorkflowAction(emptyContext, {
      kind: 'authorize-movement',
      transferId: 'TR-POC-MILLER-ISSUE',
      authorizedBy: 'DSO-001'
    });

    expect(result.evidence.eventType).toBe('RO_LITE_APPROVED');
    expect(result.context.ledgerEvents).toHaveLength(1);
  });

  it('blocks unauthorized Stage-II dispatch and raises an audit alert', () => {
    const result = applyMockWorkflowAction(emptyContext, {
      kind: 'dispatch',
      payload: {
        transferId: 'TR-POC-MILLER-ISSUE',
        lotId: 'LOT-RICE-2026-002',
        fromOrg: 'MLL-001',
        toOrg: 'ISSUE-001',
        dispatchedQtyKg: 850,
        vehicleNo: 'KA01AB2004',
        stage: 'II'
      }
    });

    expect(result.evidence.eventType).toBe('DISPATCH_BLOCKED');
    expect(result.context.alerts[0]?.alertType).toBe(AlertType.UNAUTHORIZED_TRANSACTION);
  });

  it('offers and applies the milling transform after stock reaches the miller', () => {
    const millerReady = completedTransfers.slice(0, 3);
    const action = getNextWorkflowAction({
      ...emptyContext,
      transfers: millerReady,
      ledgerEvents: [
        {
          ledgerTxId: 'MOCK-RO',
          entityType: 'workflow',
          entityId: 'TR-POC-MILLER-ISSUE',
          eventType: 'RO_LITE_APPROVED',
          payload: {},
          timestamp: '2026-06-09T10:00:00.000Z'
        }
      ]
    });

    expect(action?.request.kind).toBe('transform-lot');
    const result = applyMockWorkflowAction(emptyContext, action!.request);
    expect(result.evidence.eventType).toBe('TransformLot');
    expect(result.context.lots.some((lot) => lot.transformedFromLotId === 'LOT-RICE-2026-001')).toBe(true);
  });

  it('offers duplicate claim after successful endpoint receipts and first distribution', () => {
    const action = getNextWorkflowAction({
      ...emptyContext,
      transfers: completedTransfers,
      ledgerEvents: [
        {
          ledgerTxId: 'MOCK-RO',
          entityType: 'workflow',
          entityId: 'TR-POC-MILLER-ISSUE',
          eventType: 'RO_LITE_APPROVED',
          payload: {},
          timestamp: '2026-06-09T10:00:00.000Z'
        },
        {
          ledgerTxId: 'MOCK-TRANSFORM',
          entityType: 'lot',
          entityId: 'LOT-RICE-2026-002',
          eventType: 'TransformLot',
          payload: { parentLotId: 'LOT-RICE-2026-001' },
          timestamp: '2026-06-09T10:01:00.000Z'
        }
      ],
      distributions: [
        {
          distributionId: 'DIST-POC-001',
          fpsId: 'FPS-101',
          rationCardHash: 'demo-ration-card-hash',
          beneficiaryRefHash: 'beneficiary-hash',
          commodity: 'Rice',
          deliveredKg: 25,
          authMode: AuthMode.MOCK_OTP,
          authResult: AuthResult.SUCCESS,
          authTxnRefHash: 'auth-ref',
          dealerId: 'FPS-DEALER-101',
          timestamp: '2026-06-09T10:05:00.000Z',
          ledgerTxId: 'TX-1'
        }
      ]
    });

    expect(action?.request.kind).toBe('duplicate-distribute');
    expect(action?.label).toContain('duplicate');
  });

  it('tracks the full POC workflow progress', () => {
    expect(getWorkflowProgress(emptyContext)).toEqual({ completed: 0, total: 12 });
  });
});
