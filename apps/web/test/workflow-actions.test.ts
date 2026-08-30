import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, COMMODITIES, TransferStatus } from '@pds/shared-types';
import { demoEntitlements, demoLots } from '../src/demo-model.js';
import {
  applyMockWorkflowAction,
  getAllCommoditiesRoleQueue,
  getAllCommoditiesWorkflowActions,
  getNextWorkflowAction,
  getRoleQueue,
  getSessionStockKg,
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
  receiveTimestamp: '2026-06-09T11:00:00.000Z',
  transporterId: 'TRANS-001',
  transporterName: 'Transport Contractor 01'
});

const completedTransfers = [
  receivedTransfer('TR-POC-RICE-FCI-DEPOT', 'FCI-001', 'GODOWN-S-001'),
  receivedTransfer('TR-POC-RICE-DEPOT-BLOCK', 'GODOWN-S-001', 'GODOWN-B-001')
];

const roEvent = {
  ledgerTxId: 'MOCK-RO',
  entityType: 'workflow' as const,
  entityId: 'TR-POC-RICE-DEPOT-BLOCK',
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
  sourceGodownId: 'GODOWN-B-001',
  status: 'RECEIVED' as const,
  transporterId: 'TRANS-001',
  transporterName: 'Transport Contractor 01',
  vehicleNo: 'KA01AB1204',
  dispatchTimestamp: '2026-06-09T12:00:00.000Z',
  receiveTimestamp: '2026-06-09T13:00:00.000Z'
};

describe('workflow actions', () => {
  it('starts with FCI Stage-I dispatch to state godown', () => {
    const action = getNextWorkflowAction(emptyContext);

    expect(action?.request.kind).toBe('dispatch');
    expect(action?.id).toBe('TR-POC-RICE-FCI-DEPOT');
    expect(getRoleQueue(emptyContext, 'FCI_DEPOT')).toHaveLength(1);
    expect(getRoleQueue(emptyContext, 'CONTROL_OFFICE')).toHaveLength(0);
  });

  it('requires state godown receipt before Stage-II approval or block-godown dispatch', () => {
    const context: WorkflowContext = {
      ...emptyContext,
      transfers: [
        {
          transferId: 'TR-POC-RICE-FCI-DEPOT',
          lotId: 'LOT-RICE-2026-001',
          fromOrg: 'FCI-001',
          toOrg: 'GODOWN-S-001',
          dispatchedQtyKg: demoQuantities.stageOneTransferKg,
          vehicleNo: 'KA01AB2000',
          status: TransferStatus.DISPATCHED,
          dispatchTimestamp: '2026-06-09T10:00:00.000Z',
          transporterId: 'TRANS-001',
          transporterName: 'Transport Contractor 01'
        }
      ]
    };

    const action = getNextWorkflowAction(context);

    expect(action?.id).toBe('TR-POC-RICE-FCI-DEPOT-receive');
    expect(action?.request.kind).toBe('receive');
    expect(getRoleQueue(context, 'GODOWN')[0]?.id).toBe('TR-POC-RICE-FCI-DEPOT-receive');
    expect(getRoleQueue(context, 'CONTROL_OFFICE')).toHaveLength(0);
    expect(getRoleQueue(context, 'FCI_DEPOT')).toHaveLength(0);
  });

  it('queues DSO approval when stock reaches the state godown', () => {
    const readyContext: WorkflowContext = {
      ...emptyContext,
      transfers: completedTransfers.slice(0, 1)
    };

    const action = getNextWorkflowAction(readyContext);

    expect(action?.request.kind).toBe('authorize-movement');
    expect(action?.request).toMatchObject({ transferId: 'TR-POC-RICE-DEPOT-BLOCK' });
    expect(getRoleQueue(readyContext, 'CONTROL_OFFICE')).toHaveLength(1);
  });

  it('advances to depot dispatch after DSO approval', () => {
    const readyContext: WorkflowContext = {
      ...emptyContext,
      transfers: completedTransfers.slice(0, 1)
    };
    const result = applyMockWorkflowAction(readyContext, {
      kind: 'authorize-movement',
      transferId: 'TR-POC-RICE-DEPOT-BLOCK',
      authorizedBy: 'DSO-001',
      roRef: 'RO-DSO-POC-001'
    });

    const action = getNextWorkflowAction(result.context);

    expect(action?.id).toBe('TR-POC-RICE-DEPOT-BLOCK');
    expect(action?.request.kind).toBe('dispatch');
    expect(getRoleQueue(result.context, 'GODOWN')).toHaveLength(1);
  });

  it('preserves the RO reference recorded by an existing authorization event', () => {
    const action = getNextWorkflowAction({
      ...emptyContext,
      transfers: completedTransfers.slice(0, 1),
      ledgerEvents: [
        {
          ...roEvent,
          payload: { roRef: 'RO-DSO-LEGACY-001', authorizedBy: 'DSO-001' }
        }
      ]
    });

    expect(action?.request).toMatchObject({
      kind: 'dispatch',
      payload: {
        transferId: 'TR-POC-RICE-DEPOT-BLOCK',
        roRef: 'RO-DSO-LEGACY-001'
      }
    });
  });

  it('requires block-godown receipt before FPS allocation', () => {
    const context: WorkflowContext = {
      ...emptyContext,
      transfers: [
        completedTransfers[0]!,
        {
          transferId: 'TR-POC-RICE-DEPOT-BLOCK',
          lotId: 'LOT-RICE-2026-001',
          fromOrg: 'GODOWN-S-001',
          toOrg: 'GODOWN-B-001',
          dispatchedQtyKg: demoQuantities.stageOneTransferKg,
          vehicleNo: 'KA01AB2000',
          status: TransferStatus.DISPATCHED,
          dispatchTimestamp: '2026-06-09T10:00:00.000Z',
          stage: 'II',
          authorizedBy: 'DSO-001',
          approvalStatus: 'APPROVED',
          roRef: 'RO-DSO-POC-001',
          transporterId: 'TRANS-001',
          transporterName: 'Transport Contractor 01'
        }
      ],
      ledgerEvents: [roEvent]
    };

    const action = getNextWorkflowAction(context);

    expect(action?.id).toBe('TR-POC-RICE-DEPOT-BLOCK-receive');
    expect(action?.request.kind).toBe('receive');
    expect(getRoleQueue(context, 'GODOWN')[0]?.id).toBe('TR-POC-RICE-DEPOT-BLOCK-receive');
    expect(getRoleQueue(context, 'FPS')).toHaveLength(0);
  });

  it('offers FPS allocation after block godown receipt', () => {
    const action = getNextWorkflowAction({
      ...emptyContext,
      transfers: completedTransfers,
      ledgerEvents: [roEvent]
    });

    expect(action?.request.kind).toBe('allocate');
    expect(action?.id).toBe('ALLOC-POC-RICE-FPS');
    expect(action?.roles).toEqual(['BLOCK_OFFICE']);
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

  it('raises an audit alert for short FPS receipt in mock workflow', () => {
    const result = applyMockWorkflowAction(
      {
        ...emptyContext,
        transfers: completedTransfers,
        allocations: [
          {
            allocationId: 'ALLOC-POC-RICE-FPS',
            fpsId: 'FPS-101',
            commodity: 'Rice',
            allocatedQtyKg: 300,
            month: '2026-06',
            sourceGodownId: 'GODOWN-B-001',
            status: 'ALLOCATED',
            transporterId: 'TRANS-001',
            transporterName: 'Transport Contractor 01',
            vehicleNo: 'KA01AB1204',
            dispatchTimestamp: '2026-06-09T12:00:00.000Z'
          }
        ],
        ledgerEvents: [roEvent]
      },
      { kind: 'fps-receipt', allocationId: 'ALLOC-POC-RICE-FPS', receivedQtyKg: 100 }
    );

    expect(result.context.allocations.find((item) => item.allocationId === 'ALLOC-POC-RICE-FPS')).toMatchObject({
      receivedQtyKg: 100,
      shortageQtyKg: 200,
      status: 'RECEIVED_WITH_SHORTAGE'
    });
    expect(result.context.alerts).toContainEqual(
      expect.objectContaining({
        alertType: 'SHORT_RECEIPT',
        entityId: 'ALLOC-POC-RICE-FPS',
        evidence: expect.objectContaining({ shortageQtyKg: 200 })
      })
    );
  });

  it('keeps the planned workflow free of removed stakeholder IDs', () => {
    const serialized = JSON.stringify(getWorkflowActions(emptyContext));

    expect(serialized).not.toMatch(/FCI-BUF|MLL-001|PROC-001|ISSUE-001|DFPD|FOOD-001/);
    expect(getWorkflowProgress(emptyContext)).toEqual({ completed: 0, total: 8 });
  });

  it('aggregates workflow actions for all commodities on the canonical chain', () => {
    const groups = getAllCommoditiesWorkflowActions(emptyContext);

    expect(groups.map((group) => group.commodity)).toEqual(COMMODITIES.map((commodity) => commodity.name));
    expect(groups.every((group) => group.actions[0]?.id.endsWith('FCI-DEPOT'))).toBe(true);
  });

  it('surfaces pending per-leg approvals across commodities', () => {
    const wheatReady: WorkflowContext = {
      ...emptyContext,
      transfers: [
        receivedTransfer('TR-POC-WHEAT-FCI-DEPOT', 'FCI-001', 'GODOWN-S-001', 'LOT-WHEAT-2026-001')
      ]
    };
    const groups = getAllCommoditiesRoleQueue(wheatReady, 'CONTROL_OFFICE');

    expect(groups.find((group) => group.commodity === 'Wheat')?.actions[0]?.request).toMatchObject({
      kind: 'authorize-movement',
      transferId: 'TR-POC-WHEAT-DEPOT-BLOCK',
      roRef: 'RO-DSO-POC-WHEAT-DEPOT-BLOCK'
    });
  });

  it('gives every commodity approval a distinct card id and RO reference', () => {
    const readyContext: WorkflowContext = {
      ...emptyContext,
      transfers: COMMODITIES.map((commodity) =>
        receivedTransfer(
          `TR-POC-${commodity.slug.toUpperCase()}-FCI-DEPOT`,
          'FCI-001',
          'GODOWN-S-001',
          `LOT-${commodity.slug.toUpperCase()}-2026-001`
        )
      )
    };

    const approvals = getAllCommoditiesRoleQueue(readyContext, 'CONTROL_OFFICE')
      .flatMap((group) => group.actions)
      .filter((action) => action.request.kind === 'authorize-movement');
    const ids = approvals.map((action) => action.id);
    const roRefs = approvals.map((action) =>
      action.request.kind === 'authorize-movement' ? action.request.roRef : undefined
    );

    expect(approvals).toHaveLength(COMMODITIES.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(roRefs).size).toBe(roRefs.length);
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
    expect(action?.id).toBe(`TR-${seriesId}-KEROSENE-FCI-DEPOT`);
    expect(action?.request).toMatchObject({
      kind: 'dispatch',
      payload: {
        transferId: `TR-${seriesId}-KEROSENE-FCI-DEPOT`,
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

  it('does not double-count a split child lot while it is in transit', () => {
    const rootLot = {
      ...demoLots.find((lot) => lot.commodity === 'Rice')!,
      lotId: 'LOT-SPLIT-ROOT',
      quantityKg: 40,
      originalQuantityKg: 100,
      remainingQuantityKg: 40,
      rootLotId: 'LOT-SPLIT-ROOT'
    };
    const childLot = {
      ...rootLot,
      lotId: 'LOT-SPLIT-ROOT-SPLIT-TR-SPLIT-1',
      quantityKg: 60,
      originalQuantityKg: 60,
      remainingQuantityKg: 60,
      parentLotId: 'LOT-SPLIT-ROOT',
      status: 'DISPATCHED' as const
    };
    const transfer = {
      ...receivedTransfer('TR-SPLIT-1', rootLot.currentOwner, 'GODOWN-S-001', childLot.lotId),
      dispatchedQtyKg: 60,
      receivedQtyKg: undefined,
      receiveTimestamp: undefined,
      status: TransferStatus.DISPATCHED
    };

    expect(
      getSessionStockKg(
        { lots: [rootLot, childLot], transfers: [transfer], allocations: [], ledgerEvents: [] },
        rootLot.currentOwner,
        rootLot.lotId,
        rootLot.commodity
      )
    ).toBe(40);
  });
});
