import { describe, expect, it } from 'vitest';
import { AlertType, AuthMode, AuthResult, TransferStatus } from '@pds/shared-types';
import { demoEntitlements, demoLots } from '../src/demo-model.js';
import {
  applyMockWorkflowAction,
  getNextWorkflowAction,
  getRoleQueue,
  getWorkflowProgress,
  type WorkflowContext
} from '../src/workflow-actions.js';
import { demoQuantities } from '@pds/fixtures';

const emptyContext: WorkflowContext = {
  lots: demoLots,
  transfers: [],
  allocations: [],
  authTransactions: [],
  distributions: [],
  entitlements: demoEntitlements,
  alerts: [],
  ledgerEvents: []
};

const completedTransfers = [
  ['TR-POC-PROC-FCI', 'PROC-001', 'FCI-001', demoQuantities.stageOneTransferKg],
  ['TR-POC-FCI-BUF', 'FCI-001', 'FCI-BUF-001', demoQuantities.stageOneTransferKg],
  ['TR-POC-BUF-DEPOT', 'FCI-BUF-001', 'GODOWN-S-001', demoQuantities.stageOneTransferKg],
  ['TR-POC-DEPOT-MILLER', 'GODOWN-S-001', 'MLL-001', demoQuantities.stageOneTransferKg],
  ['TR-POC-MILLER-ISSUE', 'MLL-001', 'ISSUE-001', demoQuantities.millerToIssueKg],
  ['TR-POC-ISSUE-FPS', 'ISSUE-001', 'FPS-101', demoQuantities.endpointDispatchKg.fps],
  ['TR-POC-ISSUE-WI', 'ISSUE-001', 'WI-101', demoQuantities.endpointDispatchKg.welfareInstitute],
  ['TR-POC-ISSUE-SBE', 'ISSUE-001', 'SBE-101', demoQuantities.endpointDispatchKg.shivBhojan]
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

  it('advances to procurement dispatch after RO approval', () => {
    const result = applyMockWorkflowAction(emptyContext, {
      kind: 'authorize-movement',
      transferId: 'TR-POC-MILLER-ISSUE',
      authorizedBy: 'DSO-001'
    });

    const action = getNextWorkflowAction(result.context);
    expect(action?.id).toBe('TR-POC-PROC-FCI');
    expect(action?.request.kind).toBe('dispatch');
    expect(getRoleQueue(result.context, 'PROCUREMENT')).toHaveLength(1);
    expect(getRoleQueue(result.context, 'FCI_DEPOT')).toHaveLength(0);
  });

  it('blocks unauthorized Stage-II dispatch and raises an audit alert', () => {
    const result = applyMockWorkflowAction(emptyContext, {
      kind: 'dispatch',
      payload: {
        transferId: 'TR-POC-MILLER-ISSUE',
        lotId: 'LOT-RICE-2026-002',
        fromOrg: 'MLL-001',
        toOrg: 'ISSUE-001',
        dispatchedQtyKg: demoQuantities.millerToIssueKg,
        vehicleNo: 'KA01AB2004',
        stage: 'II'
      }
    });

    expect(result.evidence.eventType).toBe('DISPATCH_BLOCKED');
    expect(result.context.alerts[0]?.alertType).toBe(AlertType.UNAUTHORIZED_TRANSACTION);
  });

  it('rejects receipt quantities above the dispatched amount', () => {
    const context: WorkflowContext = {
      ...emptyContext,
      transfers: [
        {
          transferId: 'TR-SHORT-UI',
          lotId: 'LOT-RICE-2026-002',
          fromOrg: 'ISSUE-001',
          toOrg: 'WI-101',
          dispatchedQtyKg: demoQuantities.endpointDispatchKg.fps,
          vehicleNo: 'KA01AB1206',
          status: TransferStatus.DISPATCHED,
          dispatchTimestamp: '2026-06-09T15:15:00.000Z'
        }
      ]
    };

    expect(() =>
      applyMockWorkflowAction(context, {
        kind: 'receive',
        transferId: 'TR-SHORT-UI',
        receivedQtyKg: demoQuantities.endpointDispatchKg.fps + 1
      })
    ).toThrow(/cannot exceed dispatchedQtyKg/);
  });

  it('offers and applies the milling transform after stock reaches the miller', () => {
    const millerReady = completedTransfers.slice(0, 4);
    const readyContext: WorkflowContext = {
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
    };
    const action = getNextWorkflowAction(readyContext);

    expect(action?.request.kind).toBe('transform-lot');
    const result = applyMockWorkflowAction(readyContext, action!.request);
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
      ],
      entitlements: demoEntitlements
    });

    expect(action?.request.kind).toBe('duplicate-distribute');
    expect(action?.label).toContain('duplicate');
  });

  it('rejects a dispatch quantity greater than the org has on hand', () => {
    expect(() =>
      applyMockWorkflowAction(emptyContext, {
        kind: 'dispatch',
        payload: {
          transferId: 'TR-POC-PROC-FCI',
          lotId: 'LOT-RICE-2026-001',
          fromOrg: 'PROC-001',
          toOrg: 'FCI-001',
          dispatchedQtyKg: 999999,
          vehicleNo: 'KA01AB2000'
        }
      })
    ).toThrow(/Insufficient stock/);
  });

	  it('rejects a non-positive dispatch quantity', () => {
	    expect(() =>
	      applyMockWorkflowAction(emptyContext, {
        kind: 'dispatch',
        payload: {
          transferId: 'TR-POC-PROC-FCI',
          lotId: 'LOT-RICE-2026-001',
          fromOrg: 'PROC-001',
          toOrg: 'FCI-001',
          dispatchedQtyKg: 0,
          vehicleNo: 'KA01AB2000'
        }
      })
	    ).toThrow(/dispatchedQtyKg must be positive/);
	  });
	
	  it('rejects mock dispatches outside the configured commodity route', () => {
	    expect(() =>
	      applyMockWorkflowAction(emptyContext, {
	        kind: 'dispatch',
	        payload: {
	          transferId: 'TR-POC-KEROSENE-MILLER-BLOCK',
	          lotId: 'LOT-KEROSENE-2026-001',
	          fromOrg: 'PROC-001',
	          toOrg: 'MLL-001',
	          dispatchedQtyKg: 100,
	          vehicleNo: 'KA01AB8001'
	        }
	      })
	    ).toThrow(/Kerosene route does not allow movement/);
	  });
	
	  it('rejects mock transformations for direct-route commodities', () => {
	    expect(() =>
	      applyMockWorkflowAction(emptyContext, {
	        kind: 'transform-lot',
	        payload: {
	          parentLotId: 'LOT-COOKING-OIL-2026-001',
	          childLotId: 'LOT-COOKING-OIL-2026-CHILD',
	          transformedBy: 'PROC-001',
	          commodity: 'Cooking Oil',
	          quantityKg: 100,
	          qualityGrade: 'A'
	        }
	      })
	    ).toThrow(/Cooking Oil does not require transformation/);
	  });
	
	  it('caps dispatch quantity to what a downstream org actually received in-session', () => {
    const context: WorkflowContext = {
      ...emptyContext,
      transfers: [
        {
          transferId: 'TR-POC-PROC-FCI',
          lotId: 'LOT-RICE-2026-001',
          fromOrg: 'PROC-001',
          toOrg: 'FCI-001',
          dispatchedQtyKg: 1000,
          receivedQtyKg: 1000,
          vehicleNo: 'KA01AB2000',
          status: TransferStatus.RECEIVED,
          dispatchTimestamp: '2026-06-09T10:00:00.000Z',
          receiveTimestamp: '2026-06-09T10:30:00.000Z'
        }
      ]
    };

    expect(() =>
      applyMockWorkflowAction(context, {
        kind: 'dispatch',
        payload: {
          transferId: 'TR-POC-FCI-BUF',
          lotId: 'LOT-RICE-2026-001',
          fromOrg: 'FCI-001',
          toOrg: 'FCI-BUF-001',
          dispatchedQtyKg: 1500,
          vehicleNo: 'KA01AB2001'
        }
      })
    ).toThrow(/Insufficient stock/);

    const result = applyMockWorkflowAction(context, {
      kind: 'dispatch',
      payload: {
        transferId: 'TR-POC-FCI-BUF',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'FCI-001',
        toOrg: 'FCI-BUF-001',
        dispatchedQtyKg: 700,
        vehicleNo: 'KA01AB2001'
      }
    });
    expect(result.evidence.eventType).toBe('DISPATCH_LOT');
  });

  it('blocks a distribution that exceeds the beneficiary monthly balance and raises an alert', () => {
    const result = applyMockWorkflowAction(emptyContext, {
      kind: 'distribute',
      payload: {
        distributionId: 'DIST-OVER-1',
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: 999,
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS,
        authTxnRefHash: 'auth-ref-over',
        dealerId: 'FPS-DEALER-101',
        timestamp: '2026-06-15T10:00:00.000Z'
      }
    });

    expect(result.context.distributions).toHaveLength(0);
    expect(result.evidence.eventType).toBe('DUPLICATE_CLAIM_BLOCKED');
    expect(result.context.alerts.some((alert) => alert.alertType === AlertType.DUPLICATE_CLAIM)).toBe(true);
  });

  it('decrements the entitlement balance as distributions are recorded', () => {
    const result = applyMockWorkflowAction(emptyContext, {
      kind: 'distribute',
      payload: {
        distributionId: 'DIST-PARTIAL-1',
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: 10,
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS,
        authTxnRefHash: 'auth-ref-partial',
        dealerId: 'FPS-DEALER-101',
        timestamp: '2026-06-15T10:00:00.000Z'
      }
    });

    const entitlement = result.context.entitlements.find(
      (item) => item.rationCardHash === 'demo-ration-card-hash' && item.month === '2026-06'
    );
    expect(entitlement?.availableBalanceKg).toBe(15);
    expect(entitlement?.alreadyLiftedKg).toBe(10);
  });

  it('tracks the full POC workflow progress', () => {
    expect(getWorkflowProgress(emptyContext)).toEqual({ completed: 0, total: 13 });
  });

  it('uses a direct non-milling workflow for kerosene', () => {
    const actions = [];
    let context: WorkflowContext = emptyContext;

    for (let index = 0; index < 10; index += 1) {
      const action = getNextWorkflowAction(context, { commodity: 'Kerosene' });
      if (!action) break;
      actions.push(action);
      context = applyMockWorkflowAction(context, action.request).context;
    }

    expect(actions.some((action) => action.request.kind === 'transform-lot')).toBe(false);
    expect(actions.some((action) => action.id.includes('MILLER'))).toBe(false);
    expect(actions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        'TR-POC-KEROSENE-PROC-DEPOT',
        'TR-POC-KEROSENE-DEPOT-ISSUE',
        'TR-POC-KEROSENE-ISSUE-FPS',
        'DIST-POC-KEROSENE-001'
      ])
    );
  });

  it('can replay the full mock role-workbench action graph to completion', () => {
    let context: WorkflowContext = emptyContext;
    const executed: string[] = [];

    for (let index = 0; index < 30; index += 1) {
      const action = getNextWorkflowAction(context);
      if (!action) {
        break;
      }
      executed.push(action.id);
      context = applyMockWorkflowAction(context, action.request).context;
    }

    expect(executed).toContain('RO-DSO-POC-001');
    expect(executed).toContain('TR-POC-PROC-FCI');
    expect(executed).toContain('TR-POC-ISSUE-FPS');
    expect(executed).toContain('DIST-POC-001');
    expect(executed).toContain('DIST-POC-002');
    expect(executed).toContain('DIST-POC-EXCEPTION');
    expect(getNextWorkflowAction(context)).toBeNull();
    const progress = getWorkflowProgress(context);
    expect(progress.completed).toBe(progress.total);
  });
});
