import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, TransferStatus } from '@pds/shared-types';
import { demoLots } from '../src/demo-model.js';
import { getNextWorkflowAction, getWorkflowProgress } from '../src/workflow-actions.js';

const emptyContext = {
  lots: demoLots,
  transfers: [],
  allocations: [],
  authTransactions: [],
  distributions: []
};

describe('workflow actions', () => {
  it('starts with procurement dispatch when no transfers exist', () => {
    const action = getNextWorkflowAction(emptyContext);
    expect(action?.request.kind).toBe('dispatch');
    expect(action?.request).toMatchObject({
      kind: 'dispatch',
      payload: { fromOrg: 'PROC-001', toOrg: 'MLL-001' }
    });
  });

  it('requests receipt after dispatch', () => {
    const action = getNextWorkflowAction({
      ...emptyContext,
      transfers: [
        {
          transferId: 'TR-UI-PROC-MLL',
          lotId: 'LOT-RICE-2026-001',
          fromOrg: 'PROC-001',
          toOrg: 'MLL-001',
          dispatchedQtyKg: 1000,
          vehicleNo: 'KA01AB2001',
          status: TransferStatus.DISPATCHED,
          dispatchTimestamp: '2026-06-09T10:00:00.000Z'
        }
      ]
    });

    expect(action?.request.kind).toBe('receive');
    expect(action?.request).toMatchObject({ transferId: 'TR-UI-PROC-MLL', receivedQtyKg: 1000 });
  });

  it('offers duplicate claim after the first distribution', () => {
    const completedTransfers = [
      'TR-UI-PROC-MLL',
      'TR-UI-MLL-SG',
      'TR-UI-SG-BG'
    ].map((transferId, index) => ({
      transferId,
      lotId: 'LOT-RICE-2026-001',
      fromOrg: ['PROC-001', 'MLL-001', 'GODOWN-S-001'][index]!,
      toOrg: ['MLL-001', 'GODOWN-S-001', 'GODOWN-B-001'][index]!,
      dispatchedQtyKg: 1000,
      receivedQtyKg: 1000,
      vehicleNo: `KA01AB20${index}`,
      status: TransferStatus.RECEIVED,
      dispatchTimestamp: '2026-06-09T10:00:00.000Z',
      receiveTimestamp: '2026-06-09T11:00:00.000Z'
    }));

    const action = getNextWorkflowAction(
      {
        lots: demoLots,
        transfers: completedTransfers,
        allocations: [
          {
            allocationId: 'ALLOC-UI-2026-06',
            fpsId: 'FPS-101',
            commodity: 'Rice',
            allocatedQtyKg: 100,
            receivedQtyKg: 100,
            month: '2026-06',
            sourceGodownId: 'GODOWN-B-001',
            status: 'RECEIVED'
          }
        ],
        authTransactions: [
          {
            authTxnId: 'AUTH-UI-001',
            beneficiaryRefHash: 'beneficiary-hash',
            rationCardHash: 'demo-ration-card-hash',
            authMode: AuthMode.MOCK_OTP,
            authResult: AuthResult.SUCCESS,
            authTxnRefHash: 'auth-ref',
            timestamp: '2026-06-09T10:00:00.000Z'
          }
        ],
        distributions: [
          {
            distributionId: 'DIST-UI-001',
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
      },
      { allowDuplicateClaim: true }
    );

    expect(action?.request.kind).toBe('duplicate-distribute');
    expect(action?.label).toContain('duplicate');
  });

  it('tracks workflow progress', () => {
    expect(getWorkflowProgress(emptyContext)).toEqual({ completed: 0, total: 6 });
  });
});
