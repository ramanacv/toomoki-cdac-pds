import type {
  AuditAlert,
  AuthTransaction,
  CommodityLot,
  DistributionTransaction,
  FPSAllocation,
  LedgerEvent,
  TransferOrder
} from '@pds/shared-types';
import { AlertType, AuthMode, AuthResult, LotStatus, TransferStatus } from '@pds/shared-types';
import type { DemoRole } from './demo-model.js';

const DEMO_LOT_ID = 'LOT-RICE-2026-002';
const DEMO_RATION_CARD_HASH = 'demo-ration-card-hash';
const DEMO_BENEFICIARY_HASH = 'beneficiary-hash';
const DEMO_MONTH = '2026-06';
const now = () => new Date('2026-06-30T10:00:00.000Z').toISOString();

export type WorkflowActionRequest =
  | {
      kind: 'authorize-movement';
      transferId: string;
      authorizedBy: string;
      authorizedAt?: string;
      roRef?: string;
      remarks?: string;
    }
  | {
      kind: 'transform-lot';
      payload: {
        parentLotId: string;
        childLotId: string;
        transformedBy: string;
        commodity: string;
        quantityKg: number;
        qualityGrade: string;
        source?: string;
      };
    }
  | {
      kind: 'dispatch';
      payload: {
        transferId: string;
        lotId: string;
        fromOrg: string;
        toOrg: string;
        dispatchedQtyKg: number;
        vehicleNo: string;
        stage?: 'I' | 'II';
        roRef?: string;
        authorizedBy?: string;
        transporterId?: string;
        transformedFromLotId?: string;
      };
    }
  | { kind: 'receive'; transferId: string; receivedQtyKg: number; remarks?: string }
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
        authMode?: AuthMode;
        approvedBy?: string;
      };
    }
  | {
      kind: 'distribute' | 'duplicate-distribute' | 'supervisor-exception-distribute';
      payload: {
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
        approvedBy?: string;
        exceptionReason?: string;
      };
    };

export type WorkflowActionSpec = {
  id: string;
  label: string;
  detail: string;
  roles: DemoRole[];
  request: WorkflowActionRequest;
  status: 'pending' | 'approved' | 'dispatched' | 'received' | 'shortage' | 'distributed' | 'blocked' | 'exception-approved';
};

export type WorkflowContext = {
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  authTransactions: AuthTransaction[];
  distributions: DistributionTransaction[];
  alerts?: AuditAlert[];
  ledgerEvents?: LedgerEvent[];
};

export type MockWorkflowResult = {
  context: Required<WorkflowContext>;
  message: string;
  evidence: LedgerEvent;
};

type PlannedLeg = {
  id: string;
  lotId: string;
  fromOrg: string;
  toOrg: string;
  label: string;
  detail: string;
  roles: DemoRole[];
  qtyKg: number;
  vehicleNo: string;
  stage: 'I' | 'II';
  roRef?: string;
  authorizedBy?: string;
  transporterId?: string;
  transformedFromLotId?: string;
};

const plannedLegs: PlannedLeg[] = [
  {
    id: 'TR-POC-FCI-BUF',
    lotId: 'LOT-RICE-2026-001',
    fromOrg: 'FCI-001',
    toOrg: 'FCI-BUF-001',
    label: 'Dispatch FCI stock to buffer godown',
    detail: 'FCI records central reserve movement before state lifting.',
    roles: ['FCI_DEPOT'],
    qtyKg: 1000,
    vehicleNo: 'FCI01AB2001',
    stage: 'I',
    transporterId: 'TRANS-001'
  },
  {
    id: 'TR-POC-BUF-DEPOT',
    lotId: 'LOT-RICE-2026-001',
    fromOrg: 'FCI-BUF-001',
    toOrg: 'GODOWN-S-001',
    label: 'Stage-I dispatch to state depot',
    detail: 'Move lifted stock from FCI buffer godown to the state depot.',
    roles: ['FCI_DEPOT'],
    qtyKg: 1000,
    vehicleNo: 'KA01AB2002',
    stage: 'I',
    transporterId: 'TRANS-001'
  },
  {
    id: 'TR-POC-DEPOT-MILLER',
    lotId: 'LOT-RICE-2026-001',
    fromOrg: 'GODOWN-S-001',
    toOrg: 'MLL-001',
    label: 'Dispatch paddy to miller',
    detail: 'Send stock for the POC milling transformation leg.',
    roles: ['DEPOT'],
    qtyKg: 1000,
    vehicleNo: 'KA01AB2003',
    stage: 'I',
    transporterId: 'TRANS-001'
  },
  {
    id: 'TR-POC-MILLER-ISSUE',
    lotId: DEMO_LOT_ID,
    fromOrg: 'MLL-001',
    toOrg: 'ISSUE-001',
    label: 'Stage-II dispatch to issue point',
    detail: 'RO-lite approval is required before this movement can dispatch.',
    roles: ['DEPOT'],
    qtyKg: 850,
    vehicleNo: 'KA01AB2004',
    stage: 'II',
    roRef: 'RO-DSO-POC-001',
    authorizedBy: 'DSO-001',
    transporterId: 'TRANS-001',
    transformedFromLotId: 'LOT-RICE-2026-001'
  },
  {
    id: 'TR-POC-ISSUE-FPS',
    lotId: DEMO_LOT_ID,
    fromOrg: 'ISSUE-001',
    toOrg: 'FPS-101',
    label: 'Dispatch to FPS',
    detail: 'Issue point sends stock to the fair price shop endpoint.',
    roles: ['DEPOT'],
    qtyKg: 300,
    vehicleNo: 'KA01AB2005',
    stage: 'II',
    roRef: 'RO-DSO-POC-FPS',
    authorizedBy: 'DSO-001',
    transporterId: 'TRANS-001'
  },
  {
    id: 'TR-POC-ISSUE-WI',
    lotId: DEMO_LOT_ID,
    fromOrg: 'ISSUE-001',
    toOrg: 'WI-101',
    label: 'Dispatch to welfare institute',
    detail: 'Issue point sends hostel allocation to the welfare endpoint.',
    roles: ['DEPOT'],
    qtyKg: 200,
    vehicleNo: 'KA01AB2006',
    stage: 'II',
    roRef: 'RO-DSO-POC-WI',
    authorizedBy: 'DSO-001',
    transporterId: 'TRANS-001'
  },
  {
    id: 'TR-POC-ISSUE-SBE',
    lotId: DEMO_LOT_ID,
    fromOrg: 'ISSUE-001',
    toOrg: 'SBE-101',
    label: 'Dispatch to Shiv Bhojan eatery',
    detail: 'Issue point sends meal-scheme stock to the eatery endpoint.',
    roles: ['DEPOT'],
    qtyKg: 200,
    vehicleNo: 'KA01AB2007',
    stage: 'II',
    roRef: 'RO-DSO-POC-SBE',
    authorizedBy: 'DSO-001',
    transporterId: 'TRANS-001'
  }
];

const findTransfer = (transfers: TransferOrder[], transferId: string): TransferOrder | undefined =>
  transfers.find((transfer) => transfer.transferId === transferId);

const isReceived = (transfer: TransferOrder | undefined): boolean =>
  transfer?.status === TransferStatus.RECEIVED || transfer?.status === TransferStatus.RECEIVED_WITH_SHORTAGE;

const isAuthorizationEvent = (eventType: string): boolean =>
  eventType === 'RO_LITE_APPROVED' || eventType === 'AuthorizeMovement';

const txId = (prefix: string, id: string) => `MOCK-${prefix}-${id}`;

const evidence = (
  eventType: string,
  entityType: LedgerEvent['entityType'],
  entityId: string,
  payload: Record<string, unknown>
): LedgerEvent => ({
  ledgerTxId: txId(eventType, entityId),
  entityType,
  entityId,
  eventType,
  payload,
  timestamp: now()
});

export function getRoleQueue(context: WorkflowContext, role: DemoRole): WorkflowActionSpec[] {
  return getWorkflowActions(context).filter((action) => action.roles.includes(role));
}

export function getWorkflowActions(context: WorkflowContext): WorkflowActionSpec[] {
  const actions: WorkflowActionSpec[] = [];
  const stageTwo = findTransfer(context.transfers, 'TR-POC-MILLER-ISSUE');
  const millingReceived = isReceived(findTransfer(context.transfers, 'TR-POC-DEPOT-MILLER'));
  const transformed = context.ledgerEvents?.some((event) => event.eventType === 'TransformLot' && event.entityId === DEMO_LOT_ID);
  if (millingReceived && !transformed) {
    actions.push({
      id: 'LOT-POC-TRANSFORM',
      label: 'Transform paddy to rice at miller',
      detail: 'Create the child rice lot with parent-lot provenance before Stage-II dispatch.',
      roles: ['DEPOT'],
      status: 'pending',
      request: {
        kind: 'transform-lot',
        payload: {
          parentLotId: 'LOT-RICE-2026-001',
          childLotId: DEMO_LOT_ID,
          transformedBy: 'MLL-001',
          commodity: 'Rice',
          quantityKg: 850,
          qualityGrade: 'A',
          source: 'Miller 01'
        }
      }
    });
    return actions;
  }
  if (!stageTwo) {
    actions.push({
      id: 'RO-DSO-POC-001',
      label: 'Approve Stage-II RO-lite movement',
      detail: 'Stamp RO-DSO-POC-001 before the miller can dispatch rice to the issue point.',
      roles: ['CONTROL_OFFICE'],
      status: 'pending',
      request: {
        kind: 'authorize-movement',
        transferId: 'TR-POC-MILLER-ISSUE',
        authorizedBy: 'DSO-001',
        roRef: 'RO-DSO-POC-001'
      }
    });
  }

  for (const leg of plannedLegs) {
    const transfer = findTransfer(context.transfers, leg.id);
    const stageTwoMissingApproval =
      leg.stage === 'II' &&
      leg.id === 'TR-POC-MILLER-ISSUE' &&
      !context.ledgerEvents?.some((event) => event.entityId === leg.id && isAuthorizationEvent(event.eventType));

    if (!transfer) {
      actions.push({
        id: leg.id,
        label: leg.label,
        detail: stageTwoMissingApproval ? `${leg.detail} Approval is still missing.` : leg.detail,
        roles: leg.roles,
        status: stageTwoMissingApproval ? 'blocked' : 'pending',
        request: {
          kind: 'dispatch',
          payload: {
            transferId: leg.id,
            lotId: leg.lotId,
            fromOrg: leg.fromOrg,
            toOrg: leg.toOrg,
            dispatchedQtyKg: leg.qtyKg,
            vehicleNo: leg.vehicleNo,
            stage: leg.stage,
            ...(leg.roRef ? { roRef: leg.roRef } : {}),
            ...(!stageTwoMissingApproval && leg.authorizedBy ? { authorizedBy: leg.authorizedBy } : {}),
            ...(leg.transporterId ? { transporterId: leg.transporterId } : {}),
            ...(leg.transformedFromLotId ? { transformedFromLotId: leg.transformedFromLotId } : {})
          }
        }
      });
      break;
    }

    if (transfer.status === TransferStatus.DISPATCHED) {
      actions.push({
        id: `${leg.id}-receive`,
        label: `Confirm receipt at ${leg.toOrg}`,
        detail: `Record stock received against ${transfer.dispatchedQtyKg} kg dispatched.`,
        roles: leg.toOrg === 'FPS-101' ? ['FPS'] : leg.toOrg === 'WI-101' ? ['WELFARE_INSTITUTE'] : leg.toOrg === 'SBE-101' ? ['SHIV_BHOJAN_OPERATOR'] : ['DEPOT', 'FCI_DEPOT'],
        status: 'dispatched',
        request: { kind: 'receive', transferId: leg.id, receivedQtyKg: transfer.dispatchedQtyKg }
      });
      break;
    }
  }

  const endpointReceipts = ['TR-POC-ISSUE-FPS', 'TR-POC-ISSUE-WI', 'TR-POC-ISSUE-SBE'].every((id) =>
    isReceived(findTransfer(context.transfers, id))
  );

  if (endpointReceipts && !context.distributions.some((item) => item.distributionId === 'DIST-POC-001')) {
    actions.push({
      id: 'DIST-POC-001',
      label: 'Issue beneficiary ration',
      detail: 'Record successful AAY/PHH/NPH-aware beneficiary distribution after simulated auth.',
      roles: ['FPS'],
      status: 'pending',
      request: {
        kind: 'distribute',
        payload: {
          distributionId: 'DIST-POC-001',
          fpsId: 'FPS-101',
          rationCardHash: DEMO_RATION_CARD_HASH,
          beneficiaryRefHash: DEMO_BENEFICIARY_HASH,
          commodity: 'Rice',
          deliveredKg: 25,
          authMode: AuthMode.MOCK_OTP,
          authResult: AuthResult.SUCCESS,
          authTxnRefHash: 'auth-ref-poc-001',
          dealerId: 'FPS-DEALER-101'
        }
      }
    });
  }

  if (context.distributions.some((item) => item.distributionId === 'DIST-POC-001')) {
    if (!context.alerts?.some((alert) => alert.alertId === 'ALERT-POC-DUPLICATE')) {
      actions.push({
        id: 'DIST-POC-002',
        label: 'Attempt duplicate claim',
        detail: 'Try a second issue for the same beneficiary-month and block it with audit evidence.',
        roles: ['FPS', 'AUDITOR'],
        status: 'pending',
        request: {
          kind: 'duplicate-distribute',
          payload: {
            distributionId: 'DIST-POC-002',
            fpsId: 'FPS-101',
            rationCardHash: DEMO_RATION_CARD_HASH,
            beneficiaryRefHash: DEMO_BENEFICIARY_HASH,
            commodity: 'Rice',
            deliveredKg: 25,
            authMode: AuthMode.MOCK_OTP,
            authResult: AuthResult.SUCCESS,
            authTxnRefHash: 'auth-ref-poc-duplicate',
            dealerId: 'FPS-DEALER-101'
          }
        }
      });
    }

    if (!context.distributions.some((item) => item.distributionId === 'DIST-POC-EXCEPTION')) {
      actions.push({
        id: 'DIST-POC-EXCEPTION',
        label: 'Approve supervisor exception issue',
        detail: 'Record an exception-approved distribution with supervisor identity and reason.',
        roles: ['FPS'],
        status: 'exception-approved',
        request: {
          kind: 'supervisor-exception-distribute',
          payload: {
            distributionId: 'DIST-POC-EXCEPTION',
            fpsId: 'FPS-101',
            rationCardHash: 'exception-ration-card-hash',
            beneficiaryRefHash: 'exception-beneficiary-hash',
            commodity: 'Rice',
            deliveredKg: 10,
            authMode: AuthMode.SUPERVISOR_EXCEPTION,
            authResult: AuthResult.EXCEPTION_APPROVED,
            authTxnRefHash: 'auth-ref-poc-exception',
            dealerId: 'FPS-DEALER-101',
            approvedBy: 'SUPERVISOR-101',
            exceptionReason: 'Biometric failure approved at shop.'
          }
        }
      });
    }
  }

  return actions;
}

export const getNextWorkflowAction = (
  context: WorkflowContext,
  options?: { receiveQtyKg?: number; allowDuplicateClaim?: boolean }
): WorkflowActionSpec | null => {
  const actions = getWorkflowActions(context);
  const action = actions.find((item) => item.status !== 'blocked') ?? actions[0] ?? null;
  if (action?.request.kind === 'receive' && options?.receiveQtyKg) {
    return { ...action, request: { ...action.request, receivedQtyKg: options.receiveQtyKg } };
  }
  return action;
};

export function applyMockWorkflowAction(context: WorkflowContext, request: WorkflowActionRequest): MockWorkflowResult {
  const current: Required<WorkflowContext> = {
    lots: [...context.lots],
    transfers: [...context.transfers],
    allocations: [...context.allocations],
    authTransactions: [...context.authTransactions],
    distributions: [...context.distributions],
    alerts: [...(context.alerts ?? [])],
    ledgerEvents: [...(context.ledgerEvents ?? [])]
  };

  let event: LedgerEvent;
  let message = 'Workflow action recorded.';

  if (request.kind === 'authorize-movement') {
    event = evidence('RO_LITE_APPROVED', 'workflow', request.transferId, request);
    message = `RO-lite movement approved by ${request.authorizedBy}.`;
  } else if (request.kind === 'dispatch') {
    if (request.payload.stage === 'II' && (!request.payload.roRef || !request.payload.authorizedBy)) {
      event = evidence('DISPATCH_BLOCKED', 'audit', request.payload.transferId, request.payload);
      current.alerts.push({
        alertId: `ALERT-${request.payload.transferId}`,
        alertType: AlertType.UNAUTHORIZED_TRANSACTION,
        entityId: request.payload.transferId,
        riskLevel: 'HIGH',
        message: 'Stage-II dispatch blocked until RO-lite authorization is present.',
        status: 'OPEN',
        evidence: { transferId: request.payload.transferId, roRef: request.payload.roRef ?? '', authorized: false },
        createdAt: now()
      });
      message = 'Unauthorized Stage-II dispatch blocked.';
    } else {
      const transfer: TransferOrder = {
        ...request.payload,
        status: TransferStatus.DISPATCHED,
        dispatchTimestamp: now(),
        ...(request.payload.stage === 'II' ? { approvalStatus: 'APPROVED' as const } : {})
      };
      current.transfers.push(transfer);
      event = evidence('DISPATCH_LOT', 'transfer', transfer.transferId, transfer);
      message = `${transfer.transferId} dispatched with transporter evidence.`;
    }
  } else if (request.kind === 'transform-lot') {
    const parent = current.lots.find((lot) => lot.lotId === request.payload.parentLotId);
    const existingChild = current.lots.find((lot) => lot.lotId === request.payload.childLotId);
    const child: CommodityLot = {
      lotId: request.payload.childLotId,
      commodity: request.payload.commodity,
      season: parent?.season ?? 'Kharif 2026',
      quantityKg: request.payload.quantityKg,
      qualityGrade: request.payload.qualityGrade,
      source: request.payload.source ?? request.payload.parentLotId,
      currentOwner: request.payload.transformedBy,
      currentLocation: request.payload.transformedBy,
      status: existingChild?.status ?? parent?.status ?? LotStatus.CREATED,
      transformedFromLotId: request.payload.parentLotId
    };
    current.lots = existingChild
      ? current.lots.map((lot) => (lot.lotId === child.lotId ? { ...lot, ...child } : lot))
      : [...current.lots, child];
    event = evidence('TransformLot', 'lot', child.lotId, {
      ...child,
      parentLotId: request.payload.parentLotId,
      transformedBy: request.payload.transformedBy
    });
    message = `${child.lotId} created from ${request.payload.parentLotId}.`;
  } else if (request.kind === 'receive') {
    const transfer = current.transfers.find((item) => item.transferId === request.transferId);
    if (!transfer) {
      throw new Error(`Transfer ${request.transferId} not found`);
    }
    transfer.receivedQtyKg = request.receivedQtyKg;
    transfer.shortageQtyKg = Math.max(0, transfer.dispatchedQtyKg - request.receivedQtyKg);
    transfer.status = transfer.shortageQtyKg > 0 ? TransferStatus.RECEIVED_WITH_SHORTAGE : TransferStatus.RECEIVED;
    transfer.receiveTimestamp = now();
    event = evidence(transfer.shortageQtyKg > 0 ? 'RECEIVE_WITH_SHORTAGE' : 'RECEIVE_LOT', 'transfer', transfer.transferId, transfer);
    if (transfer.shortageQtyKg > 0) {
      current.alerts.push({
        alertId: `ALERT-${transfer.transferId}-SHORT`,
        alertType: AlertType.SHORT_RECEIPT,
        entityId: transfer.transferId,
        riskLevel: 'HIGH',
        message: `${transfer.shortageQtyKg} kg short receipt at ${transfer.toOrg}.`,
        status: 'OPEN',
        evidence: { transferId: transfer.transferId, shortageQtyKg: transfer.shortageQtyKg },
        createdAt: now()
      });
    }
    message = `${transfer.transferId} receipt recorded.`;
  } else if (request.kind === 'duplicate-distribute') {
    event = evidence('DUPLICATE_CLAIM_BLOCKED', 'audit', request.payload.distributionId, request.payload);
    current.alerts.push({
      alertId: 'ALERT-POC-DUPLICATE',
      alertType: AlertType.DUPLICATE_CLAIM,
      entityId: request.payload.rationCardHash,
      riskLevel: 'HIGH',
      message: 'Duplicate or over-entitlement claim blocked before distribution.',
      status: 'OPEN',
      evidence: { rationCardHash: request.payload.rationCardHash, month: DEMO_MONTH, deliveredKg: request.payload.deliveredKg },
      createdAt: now()
    });
    message = 'Duplicate claim blocked and written to the auditor queue.';
  } else if (request.kind === 'distribute' || request.kind === 'supervisor-exception-distribute') {
    const distribution: DistributionTransaction = {
      ...request.payload,
      timestamp: now(),
      ledgerTxId: txId('DISTRIBUTION', request.payload.distributionId)
    };
    current.distributions.push(distribution);
    current.authTransactions.push({
      authTxnId: `AUTH-${request.payload.distributionId}`,
      beneficiaryRefHash: request.payload.beneficiaryRefHash,
      rationCardHash: request.payload.rationCardHash,
      authMode: request.payload.authMode,
      authResult: request.payload.authResult,
      authTxnRefHash: request.payload.authTxnRefHash,
      ...(request.payload.approvedBy ? { approvedBy: request.payload.approvedBy } : {}),
      timestamp: now()
    });
    event = evidence(request.kind === 'supervisor-exception-distribute' ? 'SUPERVISOR_EXCEPTION_DISTRIBUTION' : 'RECORD_DISTRIBUTION', 'distribution', distribution.distributionId, distribution);
    if (request.kind === 'supervisor-exception-distribute') {
      current.alerts.push({
        alertId: 'ALERT-POC-SUPERVISOR-EXCEPTION',
        alertType: AlertType.UNAUTHORIZED_TRANSACTION,
        entityId: distribution.distributionId,
        riskLevel: 'MEDIUM',
        message: 'Supervisor exception distribution requires auditor review.',
        status: 'OPEN',
        evidence: { distributionId: distribution.distributionId, approvedBy: request.payload.approvedBy ?? '' },
        createdAt: now()
      });
    }
    message = `${distribution.distributionId} distribution recorded.`;
  } else if (request.kind === 'allocate' || request.kind === 'fps-receipt' || request.kind === 'auth') {
    event = evidence(request.kind.toUpperCase(), 'workflow', request.kind, request as unknown as Record<string, unknown>);
  } else {
    throw new Error('Unsupported workflow action');
  }

  current.ledgerEvents.push(event);
  return { context: current, message, evidence: event };
}

export const getWorkflowProgress = (context: WorkflowContext): { completed: number; total: number } => {
  const checkpoints = [
    context.ledgerEvents?.some((event) => isAuthorizationEvent(event.eventType)) ?? false,
    ...plannedLegs.map((leg) => isReceived(findTransfer(context.transfers, leg.id))),
    context.ledgerEvents?.some((event) => event.eventType === 'TransformLot' && event.entityId === DEMO_LOT_ID) ?? false,
    context.distributions.some((item) => item.distributionId === 'DIST-POC-001'),
    context.alerts?.some((alert) => alert.alertId === 'ALERT-POC-DUPLICATE') ?? false,
    context.distributions.some((item) => item.distributionId === 'DIST-POC-EXCEPTION')
  ];

  return {
    completed: checkpoints.filter(Boolean).length,
    total: checkpoints.length
  };
};
