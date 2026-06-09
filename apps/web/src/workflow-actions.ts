import type {
  AuthTransaction,
  CommodityLot,
  DistributionTransaction,
  FPSAllocation,
  TransferOrder
} from '@pds/shared-types';
import { AuthResult, TransferStatus } from '@pds/shared-types';
import type { DemoRole } from './demo-model.js';

const DEMO_LOT_ID = 'LOT-RICE-2026-001';
const DEMO_RATION_CARD_HASH = 'demo-ration-card-hash';
const DEMO_BENEFICIARY_HASH = 'beneficiary-hash';
const DEMO_MONTH = '2026-06';

export type WorkflowActionRequest =
  | {
      kind: 'dispatch';
      payload: {
        transferId: string;
        lotId: string;
        fromOrg: string;
        toOrg: string;
        dispatchedQtyKg: number;
        vehicleNo: string;
      };
    }
  | { kind: 'receive'; transferId: string; receivedQtyKg: number }
  | {
      kind: 'allocate';
      payload: {
        allocationId: string;
        fpsId: string;
        commodity: string;
        allocatedQtyKg: number;
        month: string;
        sourceGodownId: string;
      };
    }
  | { kind: 'fps-receipt'; allocationId: string; receivedQtyKg: number }
  | {
      kind: 'auth';
      payload: {
        authTxnId: string;
        beneficiaryRefHash: string;
        rationCardHash: string;
        authResult: AuthResult;
      };
    }
  | {
      kind: 'distribute';
      payload: {
        distributionId: string;
        fpsId: string;
        rationCardHash: string;
        beneficiaryRefHash: string;
        commodity: string;
        deliveredKg: number;
        authMode: AuthTransaction['authMode'];
        authResult: AuthResult;
        authTxnRefHash: string;
        dealerId: string;
      };
    }
  | {
      kind: 'duplicate-distribute';
      payload: {
        distributionId: string;
        fpsId: string;
        rationCardHash: string;
        beneficiaryRefHash: string;
        commodity: string;
        deliveredKg: number;
        authMode: AuthTransaction['authMode'];
        authResult: AuthResult;
        authTxnRefHash: string;
        dealerId: string;
      };
    };

export type WorkflowActionSpec = {
  id: string;
  label: string;
  detail: string;
  roles: DemoRole[];
  request: WorkflowActionRequest;
};

export type WorkflowContext = {
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  authTransactions: AuthTransaction[];
  distributions: DistributionTransaction[];
};

type CustodyLeg = {
  id: string;
  fromOrg: string;
  toOrg: string;
  label: string;
  detail: string;
  roles: DemoRole[];
  vehicleNo: string;
  qtyKg: number;
};

const custodyLegs: CustodyLeg[] = [
  {
    id: 'TR-UI-PROC-MLL',
    fromOrg: 'PROC-001',
    toOrg: 'MLL-001',
    label: 'Dispatch to miller',
    detail: 'Move the rice lot from procurement to the miller.',
    roles: ['PROCUREMENT'],
    vehicleNo: 'KA01AB2001',
    qtyKg: 1000
  },
  {
    id: 'TR-UI-MLL-SG',
    fromOrg: 'MLL-001',
    toOrg: 'GODOWN-S-001',
    label: 'Dispatch to state godown',
    detail: 'Send milled stock to the state godown.',
    roles: ['GODOWN', 'PROCUREMENT'],
    vehicleNo: 'KA01AB2002',
    qtyKg: 1000
  },
  {
    id: 'TR-UI-SG-BG',
    fromOrg: 'GODOWN-S-001',
    toOrg: 'GODOWN-B-001',
    label: 'Dispatch to block godown',
    detail: 'Move stock from state godown to block godown.',
    roles: ['GODOWN'],
    vehicleNo: 'KA01AB2003',
    qtyKg: 1000
  }
];

const findTransfer = (transfers: TransferOrder[], transferId: string): TransferOrder | undefined =>
  transfers.find((transfer) => transfer.transferId === transferId);

const isReceived = (transfer: TransferOrder | undefined): boolean =>
  transfer?.status === TransferStatus.RECEIVED || transfer?.status === TransferStatus.RECEIVED_WITH_SHORTAGE;

export const getNextWorkflowAction = (
  context: WorkflowContext,
  options?: { receiveQtyKg?: number; allowDuplicateClaim?: boolean }
): WorkflowActionSpec | null => {
  const receiveQtyKg = options?.receiveQtyKg ?? 1000;

  for (const leg of custodyLegs) {
    const transfer = findTransfer(context.transfers, leg.id);
    if (!transfer) {
      return {
        id: leg.id,
        label: leg.label,
        detail: leg.detail,
        roles: leg.roles,
        request: {
          kind: 'dispatch',
          payload: {
            transferId: leg.id,
            lotId: DEMO_LOT_ID,
            fromOrg: leg.fromOrg,
            toOrg: leg.toOrg,
            dispatchedQtyKg: leg.qtyKg,
            vehicleNo: leg.vehicleNo
          }
        }
      };
    }

    if (transfer.status === TransferStatus.DISPATCHED) {
      return {
        id: `${leg.id}-receive`,
        label: `Confirm receipt at ${leg.toOrg}`,
        detail: `Record ${receiveQtyKg} kg received against ${transfer.dispatchedQtyKg} kg dispatched.`,
        roles: leg.roles.includes('PROCUREMENT') ? ['GODOWN', 'PROCUREMENT'] : ['GODOWN'],
        request: {
          kind: 'receive',
          transferId: leg.id,
          receivedQtyKg: receiveQtyKg
        }
      };
    }

    if (!isReceived(transfer)) {
      return null;
    }
  }

  const allocation = context.allocations.find((item) => item.allocationId === 'ALLOC-UI-2026-06');
  if (!allocation) {
    return {
      id: 'ALLOC-UI-2026-06',
      label: 'Allocate stock to FPS',
      detail: 'Allocate 100 kg of rice from block godown to FPS 101 for June 2026.',
      roles: ['DEPARTMENT', 'GODOWN'],
      request: {
        kind: 'allocate',
        payload: {
          allocationId: 'ALLOC-UI-2026-06',
          fpsId: 'FPS-101',
          commodity: 'Rice',
          allocatedQtyKg: 100,
          month: DEMO_MONTH,
          sourceGodownId: 'GODOWN-B-001'
        }
      }
    };
  }

  if (allocation.status !== 'RECEIVED') {
    return {
      id: 'ALLOC-UI-2026-06-receipt',
      label: 'Confirm FPS receipt',
      detail: `Record ${allocation.allocatedQtyKg} kg received at FPS 101.`,
      roles: ['FPS', 'GODOWN'],
      request: {
        kind: 'fps-receipt',
        allocationId: allocation.allocationId,
        receivedQtyKg: allocation.allocatedQtyKg
      }
    };
  }

  const auth = context.authTransactions.find(
    (item) => item.rationCardHash === DEMO_RATION_CARD_HASH && item.authResult === AuthResult.SUCCESS
  );
  if (!auth) {
    return {
      id: 'AUTH-UI-001',
      label: 'Authenticate beneficiary',
      detail: 'Run mock OTP authentication before issuing rations.',
      roles: ['FPS'],
      request: {
        kind: 'auth',
        payload: {
          authTxnId: 'AUTH-UI-001',
          beneficiaryRefHash: DEMO_BENEFICIARY_HASH,
          rationCardHash: DEMO_RATION_CARD_HASH,
          authResult: AuthResult.SUCCESS
        }
      }
    };
  }

  const existingDistribution = context.distributions.find((item) => item.distributionId === 'DIST-UI-001');
  if (!existingDistribution) {
    return {
      id: 'DIST-UI-001',
      label: 'Record distribution',
      detail: 'Issue 25 kg to the beneficiary and write the ledger receipt.',
      roles: ['FPS'],
      request: {
        kind: 'distribute',
        payload: {
          distributionId: 'DIST-UI-001',
          fpsId: 'FPS-101',
          rationCardHash: DEMO_RATION_CARD_HASH,
          beneficiaryRefHash: DEMO_BENEFICIARY_HASH,
          commodity: 'Rice',
          deliveredKg: 25,
          authMode: auth.authMode,
          authResult: auth.authResult,
          authTxnRefHash: auth.authTxnRefHash,
          dealerId: 'FPS-DEALER-101'
        }
      }
    };
  }

  if (options?.allowDuplicateClaim) {
    return {
      id: 'DIST-UI-002',
      label: 'Attempt duplicate claim',
      detail: 'Try to issue another 25 kg for the same beneficiary-month to trigger duplicate-claim protection.',
      roles: ['FPS', 'AUDITOR'],
      request: {
        kind: 'duplicate-distribute',
        payload: {
          distributionId: 'DIST-UI-002',
          fpsId: 'FPS-101',
          rationCardHash: DEMO_RATION_CARD_HASH,
          beneficiaryRefHash: DEMO_BENEFICIARY_HASH,
          commodity: 'Rice',
          deliveredKg: 25,
          authMode: auth.authMode,
          authResult: auth.authResult,
          authTxnRefHash: auth.authTxnRefHash,
          dealerId: 'FPS-DEALER-101'
        }
      }
    };
  }

  return null;
};

export const getWorkflowProgress = (context: WorkflowContext): { completed: number; total: number } => {
  const checkpoints = [
    ...custodyLegs.map((leg) => isReceived(findTransfer(context.transfers, leg.id))),
    context.allocations.some((item) => item.allocationId === 'ALLOC-UI-2026-06' && item.status === 'RECEIVED'),
    context.authTransactions.some(
      (item) => item.rationCardHash === DEMO_RATION_CARD_HASH && item.authResult === AuthResult.SUCCESS
    ),
    context.distributions.some((item) => item.distributionId === 'DIST-UI-001')
  ];

  return {
    completed: checkpoints.filter(Boolean).length,
    total: checkpoints.length
  };
};
