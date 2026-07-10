import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, COMMODITIES, TransferStatus } from '@pds/shared-types';
import { demoEntitlements, demoLots } from '../src/demo-model.js';
import {
  applyMockWorkflowAction,
  getAllCommoditiesRoleQueue,
  getAllCommoditiesWorkflowActions,
  getNextWorkflowAction,
  getRoleQueue,
  getWorkflowActions,
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

const receivedTransfer = (transferId: string, fromOrg: string, toOrg: string, lotId = 'LOT-RICE-2026-001') => ({
  transferId,
  lotId,
  fromOrg,
  toOrg,
  dispatchedQtyKg: demoQuantities.stageOneTransferKg,
  receivedQtyKg: demoQuantities.stageOneTransferKg,
  vehicleNo: 'KA01AB2000',
  status: TransferStatus.RECEIVED,
  dispatchTimestamp: '2026-06-09T10:00:00.000Z',
  receiveTimestamp: '2026-06-09T11:00:00.000Z'
});

const completedTransfers = [
  receivedTransfer('TR-POC-RICE-PROC-FCI', 'PROC-001', 'FCI-001'),
  receivedTransfer('TR-POC-RICE-FCI-DEPOT', 'FCI-001', 'GODOWN-S-001'),
  receivedTransfer('TR-POC-RICE-DEPOT-ISSUE', 'GODOWN-S-001', 'ISSUE-001')
];

const roEvent = {
  ledgerTxId: 'MOCK-RO',
  entityType: 'workflow' as const,
  entityId: 'TR-POC-RICE-DEPOT-ISSUE',
  eventType: 'RO_LITE_APPROVED',
  payload: {},
  timestamp: '2026-06-09T10:00:00.000Z'
};

const completedFpsAllocation = {
  allocationId: 'ALLOC-POC-RICE-FPS',
  fpsId: 'FPS-101',
  commodity: 'Rice',
  allocatedQtyKg: demoQuantities.fpsAllocationKg,
  receivedQtyKg: demoQuantities.fpsReceiptKg,
  month: '2026-06',
  sourceGodownId: 'ISSUE-001',
  status: 'RECEIVED' as const
};

describe('workflow actions', () => {
  it('starts with procurement dispatch to FCI', () => {
    const action = getNextWorkflowAction(emptyContext);

    expect(action?.request.kind).toBe('dispatch');
    expect(action?.id).toBe('TR-POC-RICE-PROC-FCI');
    expect(getRoleQueue(emptyContext, 'PROCUREMENT')).toHaveLength(1);
    expect(getRoleQueue(emptyContext, 'CONTROL_OFFICE')).toHaveLength(0);
  });

  it('queues DSO approval when stock reaches the state godown', () => {
    const readyContext: WorkflowContext = {
      ...emptyContext,
      transfers: completedTransfers.slice(0, 2)
    };

    const action = getNextWorkflowAction(readyContext);

    expect(action?.request.kind).toBe('authorize-movement');
    expect(action?.request).toMatchObject({ transferId: 'TR-POC-RICE-DEPOT-ISSUE' });
    expect(getRoleQueue(readyContext, 'CONTROL_OFFICE')).toHaveLength(1);
  });

  it('advances to depot dispatch after DSO approval', () => {
    const readyContext: WorkflowContext = {
      ...emptyContext,
      transfers: completedTransfers.slice(0, 2)
    };
    const result = applyMockWorkflowAction(readyContext, {
      kind: 'authorize-movement',
      transferId: 'TR-POC-RICE-DEPOT-ISSUE',
      authorizedBy: 'DSO-001',
      roRef: 'RO-DSO-POC-001'
    });

    const action = getNextWorkflowAction(result.context);

    expect(action?.id).toBe('TR-POC-RICE-DEPOT-ISSUE');
    expect(action?.request.kind).toBe('dispatch');
    expect(getRoleQueue(result.context, 'DEPOT')).toHaveLength(1);
  });

  it('offers FPS allocation after issue point receipt', () => {
    const action = getNextWorkflowAction({
      ...emptyContext,
      transfers: completedTransfers,
      ledgerEvents: [roEvent]
    });

    expect(action?.request.kind).toBe('allocate');
    expect(action?.id).toBe('ALLOC-POC-RICE-FPS');
  });

  it('offers distribution after FPS receipt and first distribution exists for duplicate probe', () => {
    const action = getNextWorkflowAction({
      ...emptyContext,
      transfers: completedTransfers,
      allocations: [completedFpsAllocation],
      ledgerEvents: [roEvent],
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
  });

  it('keeps the planned workflow free of removed stakeholder IDs', () => {
    const serialized = JSON.stringify(getWorkflowActions(emptyContext));

    expect(serialized).not.toMatch(/FCI-BUF|MLL-001|GODOWN-B|DFPD|FDO|TSO|FOOD-001/);
    expect(getWorkflowProgress(emptyContext)).toEqual({ completed: 0, total: 9 });
  });

  it('aggregates workflow actions for all commodities on the canonical chain', () => {
    const groups = getAllCommoditiesWorkflowActions(emptyContext);

    expect(groups.map((group) => group.commodity)).toEqual(COMMODITIES.map((commodity) => commodity.name));
    expect(groups.every((group) => group.actions[0]?.id.endsWith('PROC-FCI'))).toBe(true);
  });

  it('surfaces pending per-leg approvals across commodities', () => {
    const wheatReady: WorkflowContext = {
      ...emptyContext,
      transfers: [
        receivedTransfer('TR-POC-WHEAT-PROC-FCI', 'PROC-001', 'FCI-001', 'LOT-WHEAT-2026-001'),
        receivedTransfer('TR-POC-WHEAT-FCI-DEPOT', 'FCI-001', 'GODOWN-S-001', 'LOT-WHEAT-2026-001')
      ]
    };
    const groups = getAllCommoditiesRoleQueue(wheatReady, 'CONTROL_OFFICE');

    expect(groups.find((group) => group.commodity === 'Wheat')?.actions[0]?.request).toMatchObject({
      kind: 'authorize-movement',
      transferId: 'TR-POC-WHEAT-DEPOT-ISSUE'
    });
  });

  it('derives workbench transfer ids from the active lot series after reset', () => {
    const seriesId = 'R20260710-165432-ab12';
    const seriesContext: WorkflowContext = {
      ...emptyContext,
      lots: demoLots.map((lot) =>
        lot.commodity === 'Kerosene'
          ? {
              ...lot,
              lotId: `LOT-KEROSENE-${seriesId}-001`
            }
          : lot
      )
    };

    const action = getWorkflowActions(seriesContext, 'Kerosene')[0];
    expect(action?.id).toBe(`TR-${seriesId}-KEROSENE-PROC-FCI`);
    expect(action?.request).toMatchObject({
      kind: 'dispatch',
      payload: {
        transferId: `TR-${seriesId}-KEROSENE-PROC-FCI`,
        lotId: `LOT-KEROSENE-${seriesId}-001`
      }
    });
  });

  it('keeps low-stock dispatches runnable when the requested quantity can be reduced', () => {
    const context: WorkflowContext = {
      ...emptyContext,
      lots: demoLots.map((lot) =>
        lot.commodity === 'Kerosene'
          ? {
              ...lot,
              quantityKg: 500
            }
          : lot
      )
    };

    const action = getWorkflowActions(context, 'Kerosene')[0];

    expect(action?.status).toBe('pending');
    expect(action?.request).toMatchObject({
      kind: 'dispatch',
      payload: {
        dispatchedQtyKg: demoQuantities.stageOneTransferKg
      }
    });
  });
});
