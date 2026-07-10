import type {
  AuditAlert,
  AuthTransaction,
  CommodityLot,
  DistributionTransaction,
  FPSAllocation,
  LedgerEvent,
  MonthlyEntitlement,
  TransferOrder
} from '@pds/shared-types';
import {
  COMMODITIES,
  type CommodityDefinition,
  type CommodityName,
  type CommodityRouteLeg,
  type CommodityRouteTemplate,
  AlertType,
  AuthMode,
  AuthResult,
  TransferStatus,
  getCommodityRouteTemplate,
  isCommodityRouteEdgeAllowed,
  seriesIdFromLotId,
  buildCommodityRouteForSeries,
  buildDistributionId,
  INITIAL_DEMO_SERIES_ID
} from '@pds/shared-types';
import { demoQuantities } from '@pds/fixtures';
import type { DemoRole } from './demo-model.js';

const DEFAULT_WORKFLOW_COMMODITY: CommodityName = 'Rice';
const DEMO_RATION_CARD_HASH = 'demo-ration-card-hash';
const DEMO_BENEFICIARY_HASH = 'beneficiary-hash';
const now = () => new Date('2026-06-30T10:00:00.000Z').toISOString();
const monthTimestamp = (month: string) => `${month}-15T10:00:00.000Z`;
const monthKey = (timestamp: string) => timestamp.slice(0, 7);

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
        timestamp?: string;
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
  entitlements?: MonthlyEntitlement[];
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
  commodity: string;
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

const commodityDefinition = (commodity: string): CommodityDefinition =>
  COMMODITIES.find((item) => item.name === commodity) ?? COMMODITIES[0]!;

const roleForSender = (fromOrg: string): DemoRole[] => {
  if (fromOrg === 'PROC-001') return ['PROCUREMENT'];
  if (fromOrg === 'FCI-001') return ['FCI_DEPOT'];
  if (fromOrg === 'ISSUE-001' || fromOrg === 'GODOWN-S-001') return ['DEPOT'];
  return ['GODOWN'];
};

const roleForReceiver = (toOrg: string): DemoRole[] => {
  if (toOrg === 'FCI-001') return ['FCI_DEPOT'];
  if (toOrg === 'GODOWN-S-001' || toOrg === 'ISSUE-001') return ['DEPOT'];
  if (toOrg === 'FPS-101') return ['FPS'];
  return ['GODOWN'];
};

const vehicleForLeg = (leg: CommodityRouteLeg, index: number): string =>
  leg.id.endsWith('PROC-FCI')
    ? 'KA01AB1999'
    : leg.id.endsWith('FCI-DEPOT')
      ? 'FCI01AB2001'
      : `KA01AB${String(2000 + index).padStart(4, '0')}`;

const quantityForLeg = (template: CommodityRouteTemplate, leg: CommodityRouteLeg): number => {
  return Math.min(commodityDefinition(template.commodity).defaultTopUpQuantityKg, demoQuantities.stageOneTransferKg);
};

const labelForLeg = (template: CommodityRouteTemplate, leg: CommodityRouteLeg): string => {
  if (template.commodity === 'Rice') {
    const labels: Record<string, string> = {
      'TR-POC-PROC-FCI': 'Dispatch procurement stock to FCI',
      'TR-POC-RICE-PROC-FCI': 'Dispatch procurement stock to FCI',
      'TR-POC-RICE-FCI-DEPOT': 'Stage-I dispatch to state depot',
      'TR-POC-RICE-DEPOT-ISSUE': 'Stage-II state depot dispatch to issue point'
    };
    return labels[leg.id] ?? `Dispatch ${template.commodity}`;
  }
  if (leg.toOrg === 'ISSUE-001') return `State depot dispatch ${template.commodity} to issue point`;
  if (leg.toOrg === 'FPS-101') return `Allocate ${template.commodity} to FPS`;
  if (leg.toOrg === 'GODOWN-S-001') return `Dispatch ${template.commodity} to state depot`;
  if (leg.toOrg === 'FCI-001') return `Dispatch ${template.commodity} to FCI`;
  return `Dispatch ${template.commodity}`;
};

const detailForLeg = (template: CommodityRouteTemplate, leg: CommodityRouteLeg): string => {
  if (template.commodity === 'Rice') {
    const details: Record<string, string> = {
      'TR-POC-PROC-FCI': 'Procurement centre hands the seeded lot to FCI before central buffer movement.',
      'TR-POC-RICE-PROC-FCI': 'Procurement centre hands the seeded lot to FCI before state lifting.',
      'TR-POC-RICE-FCI-DEPOT': 'Move lifted stock from FCI to the state depot.',
      'TR-POC-RICE-DEPOT-ISSUE': 'State depot dispatches DSO/TSO-approved stock to the issue point. Issue-point receipt is the next checkpoint after this dispatch is recorded.'
    };
    return details[leg.id] ?? `Move ${template.commodity} stock through the configured route.`;
  }
  return leg.requiresAuthorization
    ? `State depot dispatches DSO/TSO-approved ${template.commodity} stock to the issue point. Issue-point receipt is the next checkpoint after this dispatch is recorded.`
    : `Move ${template.commodity} stock through the configured route.`;
};

export const resolveSourceLotForCommodity = (
  lots: CommodityLot[],
  commodity: string
): CommodityLot | undefined => {
  const matches = lots.filter((lot) => lot.commodity === commodity);
  if (matches.length === 0) {
    return undefined;
  }
  const ranked = [...matches].sort((left, right) => right.lotId.localeCompare(left.lotId));
  return ranked.find((lot) => /-\d{3}$/.test(lot.lotId)) ?? ranked[0];
};

export const getWorkflowRoute = (
  commodity: string = DEFAULT_WORKFLOW_COMMODITY,
  lots: CommodityLot[] = []
): CommodityRouteTemplate => {
  const fallback = getCommodityRouteTemplate(commodity) ?? getCommodityRouteTemplate(DEFAULT_WORKFLOW_COMMODITY)!;
  if (lots.length === 0) {
    return fallback;
  }
  const sourceLot = resolveSourceLotForCommodity(lots, commodity);
  if (!sourceLot) {
    return fallback;
  }
  const seriesId = seriesIdFromLotId(sourceLot.lotId);
  return buildCommodityRouteForSeries(commodity, seriesId, sourceLot.lotId) ?? fallback;
};

export const getPlannedLegs = (
  commodity: string = DEFAULT_WORKFLOW_COMMODITY,
  lots: CommodityLot[] = []
): PlannedLeg[] => {
  const template = getWorkflowRoute(commodity, lots);
  return template.legs.map((leg, index) => ({
    id: leg.id,
    lotId: leg.lot === 'transformed' ? template.activeLotId : template.sourceLotId,
    commodity: template.commodity,
    fromOrg: leg.fromOrg,
    toOrg: leg.toOrg,
    label: labelForLeg(template, leg),
    detail: detailForLeg(template, leg),
    roles: roleForSender(leg.fromOrg),
    qtyKg: quantityForLeg(template, leg),
    vehicleNo: vehicleForLeg(leg, index),
    stage: leg.stage,
    ...(leg.requiresAuthorization
      ? {
          roRef:
            leg.id.endsWith('DEPOT-ISSUE')
              ? 'RO-DSO-POC-001'
              : `RO-DSO-${leg.id.replace(/^TR-/, '')}`,
          authorizedBy: 'DSO-001'
        }
      : {}),
    transporterId: 'TRANS-001',
    ...(leg.lot === 'transformed' ? { transformedFromLotId: template.sourceLotId } : {})
  }));
};

const findTransfer = (transfers: TransferOrder[], transferId: string): TransferOrder | undefined =>
  transfers.find((transfer) => transfer.transferId === transferId);

const isReceived = (transfer: TransferOrder | undefined): boolean =>
  transfer?.status === TransferStatus.RECEIVED || transfer?.status === TransferStatus.RECEIVED_WITH_SHORTAGE;

const isAllocationReceived = (allocation: FPSAllocation | undefined): boolean =>
  allocation?.status === 'RECEIVED' || allocation?.status === 'RECEIVED_WITH_SHORTAGE';

const isAuthorizationEvent = (eventType: string): boolean =>
  eventType === 'RO_LITE_APPROVED' || eventType === 'AuthorizeMovement';

const isLegAuthorized = (context: WorkflowContext, legId: string): boolean =>
  context.ledgerEvents?.some((event) => event.entityId === legId && isAuthorizationEvent(event.eventType)) ?? false;

const priorLegsReceived = (context: WorkflowContext, plannedLegs: PlannedLeg[], legIndex: number): boolean =>
  plannedLegs.slice(0, legIndex).every((priorLeg) => isReceived(findTransfer(context.transfers, priorLeg.id)));

const txId = (prefix: string, id: string) => `MOCK-${prefix}-${id}`;

const sumKg = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const isSessionTransfer = (transfer: TransferOrder): boolean =>
  transfer.transferId.startsWith('TR-') && !transfer.transferId.startsWith('TR-SEED');

const getTransferCommodity = (
  context: Pick<WorkflowContext, 'lots'>,
  transfer: Pick<TransferOrder, 'lotId'>
): string | undefined => context.lots.find((lot) => lot.lotId === transfer.lotId)?.commodity;

/**
 * Stock available to dispatch from an org within the interactive session,
 * mirroring the chaincode stock ledger: receipts flow in, dispatches flow
 * out, and the chain origin draws down the source lot. Seeded history
 * (TR-SEED-*) is display data and stays out of the session balance.
 */
export const getSessionStockKg = (
  context: Pick<WorkflowContext, 'transfers' | 'lots' | 'ledgerEvents'> & Pick<Partial<WorkflowContext>, 'allocations'>,
  org: string,
  lotId?: string,
  commodity?: string
): number => {
  const session = context.transfers.filter(isSessionTransfer);
  const relevantCommodity = commodity ?? (lotId ? context.lots.find((lot) => lot.lotId === lotId)?.commodity : undefined);
  const sameCommoditySession = relevantCommodity
    ? session.filter((transfer) => getTransferCommodity(context, transfer) === relevantCommodity)
    : session;
  const inflow = sumKg(sameCommoditySession.filter((t) => t.toOrg === org).map((t) => t.receivedQtyKg ?? 0));
  const outflow = sumKg(sameCommoditySession.filter((t) => t.fromOrg === org).map((t) => t.dispatchedQtyKg));
  const allocationOutflow = sumKg(
    (context.allocations ?? [])
      .filter((allocation) => allocation.sourceGodownId === org)
      .filter((allocation) => !relevantCommodity || allocation.commodity === relevantCommodity)
      .map((allocation) => allocation.allocatedQtyKg)
  );
  const allocationInflow = sumKg(
    (context.allocations ?? [])
      .filter((allocation) => allocation.fpsId === org && isAllocationReceived(allocation))
      .filter((allocation) => !relevantCommodity || allocation.commodity === relevantCommodity)
      .map((allocation) => allocation.receivedQtyKg ?? allocation.allocatedQtyKg)
  );
  if (inflow > 0 || allocationInflow > 0) {
    return inflow + allocationInflow - outflow - allocationOutflow;
  }
  const rootLots = context.lots.filter(
    (lot) =>
      !lot.transformedFromLotId &&
      (!relevantCommodity || lot.commodity === relevantCommodity) &&
      (lot.currentOwner === org || lot.lotId === lotId)
  );
  const registered = sumKg(rootLots.map((lot) => lot.quantityKg));
  return registered + allocationInflow - outflow - allocationOutflow;
};

export type StockPosition = {
  entityId: string;
  commodity: string;
  quantityKg: number;
};

export type ActionStockInfo = {
  availableLabel: string;
  availableKg: number;
  requiredLabel: string;
  requiredKg: number;
};

const lookupLiveStockKg = (
  stockPositions: StockPosition[] | undefined,
  org: string,
  commodity?: string
): number | undefined => {
  if (!stockPositions) {
    return undefined;
  }
  return stockPositions
    .filter((position) => position.entityId === org && (!commodity || position.commodity === commodity))
    .reduce((total, position) => total + position.quantityKg, 0);
};

export function getActionStockInfo(
  request: WorkflowActionRequest,
  context: Pick<WorkflowContext, 'transfers' | 'lots' | 'ledgerEvents'> & Pick<Partial<WorkflowContext>, 'allocations'>,
  options: {
    apiOnline: boolean;
    stockPositions?: StockPosition[];
  }
): ActionStockInfo | null {
  switch (request.kind) {
    case 'dispatch': {
      const commodity = context.lots.find((lot) => lot.lotId === request.payload.lotId)?.commodity;
      const availableKg =
        options.apiOnline && options.stockPositions
          ? (lookupLiveStockKg(options.stockPositions, request.payload.fromOrg, commodity) ?? 0)
          : getSessionStockKg(context, request.payload.fromOrg, request.payload.lotId, commodity);
      return {
        availableLabel: 'Available stock',
        availableKg,
        requiredLabel: 'Dispatch qty',
        requiredKg: request.payload.dispatchedQtyKg
      };
    }
    case 'receive': {
      const transfer = context.transfers.find((item) => item.transferId === request.transferId);
      return transfer
        ? {
            availableLabel: 'Dispatched qty',
            availableKg: transfer.dispatchedQtyKg,
            requiredLabel: 'Receipt qty',
            requiredKg: request.receivedQtyKg
          }
        : null;
    }
    default:
      return null;
  }
}

const getEntitlementForDistribution = (
  entitlements: MonthlyEntitlement[] | undefined,
  rationCardHash: string,
  commodity: string
): MonthlyEntitlement | undefined =>
  [...(entitlements ?? [])]
    .filter((item) => item.rationCardHash === rationCardHash && item.commodity === commodity)
    .sort((left, right) => right.month.localeCompare(left.month))[0];

const getDistributionTimestamp = (
  context: Pick<WorkflowContext, 'entitlements'>,
  rationCardHash: string,
  commodity: string
): string | undefined => {
  const entitlement = getEntitlementForDistribution(context.entitlements, rationCardHash, commodity);
  return entitlement ? monthTimestamp(entitlement.month) : undefined;
};

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

export function getRoleQueue(context: WorkflowContext, role: DemoRole, commodity = DEFAULT_WORKFLOW_COMMODITY): WorkflowActionSpec[] {
  return getWorkflowActions(context, commodity).filter((action) => action.roles.includes(role));
}

export type CommodityActionGroup = { commodity: CommodityName; actions: WorkflowActionSpec[] };

export function getAllCommoditiesWorkflowActions(context: WorkflowContext): CommodityActionGroup[] {
  return COMMODITIES.map((def) => ({ commodity: def.name, actions: getWorkflowActions(context, def.name) }));
}

export function getAllCommoditiesRoleQueue(context: WorkflowContext, role: DemoRole): CommodityActionGroup[] {
  return COMMODITIES.map((def) => ({ commodity: def.name, actions: getRoleQueue(context, role, def.name) }))
    .filter((group) => group.actions.length > 0);
}

export function getWorkflowActions(context: WorkflowContext, commodity: string = DEFAULT_WORKFLOW_COMMODITY): WorkflowActionSpec[] {
  const route = getWorkflowRoute(commodity, context.lots);
  const plannedLegs = getPlannedLegs(route.commodity, context.lots);
  const seriesId = seriesIdFromLotId(route.sourceLotId);
  const seriesToken = seriesId === INITIAL_DEMO_SERIES_ID ? 'POC' : seriesId;
  const slug = commodityDefinition(route.commodity).slug;
  const actions: WorkflowActionSpec[] = [];

  for (let legIndex = 0; legIndex < plannedLegs.length; legIndex += 1) {
    const leg = plannedLegs[legIndex];
    if (!leg) {
      continue;
    }
    const transfer = findTransfer(context.transfers, leg.id);
    const missingApproval = Boolean(leg.roRef && !isLegAuthorized(context, leg.id));

    if (!transfer && leg.roRef && priorLegsReceived(context, plannedLegs, legIndex) && missingApproval) {
      actions.push({
        id: leg.roRef ?? `RO-DSO-${leg.id}`,
        label: `Approve: ${leg.label}`,
        detail: `RO-lite approval unlocks ${leg.id} (${leg.fromOrg} → ${leg.toOrg}). ${leg.detail}`,
        roles: ['CONTROL_OFFICE'],
        status: 'pending',
        request: {
          kind: 'authorize-movement',
          transferId: leg.id,
          authorizedBy: 'DSO-001',
          roRef: leg.roRef
        }
      });
      break;
    }

    if (!transfer) {
      const availableStock = getSessionStockKg(context, leg.fromOrg, leg.lotId, leg.commodity);
      const depletedStock = !missingApproval && availableStock <= 0;
      const blocked = missingApproval || depletedStock;
      actions.push({
        id: leg.id,
        label: leg.label,
        detail: missingApproval
          ? `${leg.detail} Approval is still missing.`
          : depletedStock
            ? `${leg.detail} No stock is currently available at ${leg.fromOrg}.`
            : availableStock < leg.qtyKg
              ? `${leg.detail} ${availableStock} kg is available now, so reduce the dispatch quantity before running this action.`
            : leg.detail,
        roles: leg.roles,
        status: blocked ? 'blocked' : 'pending',
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
            ...(!missingApproval && leg.authorizedBy ? { authorizedBy: leg.authorizedBy } : {}),
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
        roles: roleForReceiver(leg.toOrg),
        status: 'dispatched',
        request: { kind: 'receive', transferId: leg.id, receivedQtyKg: transfer.dispatchedQtyKg }
      });
      break;
    }
  }

  const transferLegsComplete = plannedLegs.every((leg) => isReceived(findTransfer(context.transfers, leg.id)));
  const fpsDelivery = route.fpsDelivery;
  if (transferLegsComplete && fpsDelivery) {
    const allocation = context.allocations.find((item) => item.allocationId === fpsDelivery.allocationId);
    if (!allocation) {
      actions.push({
        id: fpsDelivery.allocationId,
        label: `Allocate ${route.commodity} stock to FPS`,
        detail: `Debit ${fpsDelivery.sourceGodownId} and create an FPS allocation before citizen distribution.`,
        roles: ['DEPOT'],
        status: 'pending',
        request: {
          kind: 'allocate',
          payload: {
            allocationId: fpsDelivery.allocationId,
            fpsId: fpsDelivery.fpsId,
            commodity: route.commodity,
            allocatedQtyKg: fpsDelivery.allocatedQtyKg,
            month: '2026-06',
            sourceGodownId: fpsDelivery.sourceGodownId
          }
        }
      });
      return actions;
    }
    if (!isAllocationReceived(allocation)) {
      actions.push({
        id: `${fpsDelivery.allocationId}-receipt`,
        label: `Confirm FPS receipt for ${route.commodity}`,
        detail: `Record stock received at ${fpsDelivery.fpsId} against allocation ${fpsDelivery.allocationId}.`,
        roles: ['FPS'],
        status: 'pending',
        request: {
          kind: 'fps-receipt',
          allocationId: fpsDelivery.allocationId,
          receivedQtyKg: allocation.allocatedQtyKg
        }
      });
      return actions;
    }
  }

  const fpsAllocationReceived = fpsDelivery
    ? context.allocations.some(
        (item) => item.allocationId === fpsDelivery.allocationId && isAllocationReceived(item)
      )
    : true;

  const distributionId = buildDistributionId(seriesId, slug, '001');
  const duplicateDistributionId = buildDistributionId(seriesId, slug, '002');
  const exceptionDistributionId = buildDistributionId(seriesId, slug, 'EXCEPTION');

  if (fpsAllocationReceived && !context.distributions.some((item) => item.distributionId === distributionId)) {
    const timestamp = getDistributionTimestamp(context, DEMO_RATION_CARD_HASH, route.commodity);
    actions.push({
      id: distributionId,
      label: `Authenticate and issue ${route.commodity} ration`,
      detail: 'FPS operator verifies the ration-card holder with mock OTP/biometric auth, records the household delivery, and writes the citizen receipt proof.',
      roles: ['FPS'],
      status: 'pending',
      request: {
        kind: 'distribute',
        payload: {
          distributionId,
          fpsId: 'FPS-101',
          rationCardHash: DEMO_RATION_CARD_HASH,
          beneficiaryRefHash: DEMO_BENEFICIARY_HASH,
          commodity: route.commodity,
          deliveredKg: Math.min(demoQuantities.citizenDistributionKg, commodityDefinition(route.commodity).defaultMonthlyEntitlementKg),
          authMode: AuthMode.MOCK_OTP,
          authResult: AuthResult.SUCCESS,
          authTxnRefHash: 'auth-ref-poc-001',
          dealerId: 'FPS-DEALER-101',
          ...(timestamp ? { timestamp } : {})
        }
      }
    });
  }

  if (context.distributions.some((item) => item.distributionId === distributionId)) {
    const duplicateAlertId =
      seriesId === INITIAL_DEMO_SERIES_ID && route.commodity === 'Rice'
        ? 'ALERT-POC-DUPLICATE'
        : `ALERT-${seriesToken}-${slug}-DUPLICATE`;
    if (!context.alerts?.some((alert) => alert.alertId === duplicateAlertId)) {
      const timestamp = getDistributionTimestamp(context, DEMO_RATION_CARD_HASH, route.commodity);
      actions.push({
        id: duplicateDistributionId,
        label: 'Attempt duplicate claim',
        detail: 'Try a second issue for the same beneficiary-month and block it with audit evidence.',
        roles: ['FPS', 'AUDITOR'],
        status: 'pending',
        request: {
          kind: 'duplicate-distribute',
          payload: {
            distributionId: duplicateDistributionId,
            fpsId: 'FPS-101',
            rationCardHash: DEMO_RATION_CARD_HASH,
            beneficiaryRefHash: DEMO_BENEFICIARY_HASH,
            commodity: route.commodity,
            deliveredKg: Math.min(demoQuantities.citizenDistributionKg, commodityDefinition(route.commodity).defaultMonthlyEntitlementKg),
            authMode: AuthMode.MOCK_OTP,
            authResult: AuthResult.SUCCESS,
            authTxnRefHash: 'auth-ref-poc-duplicate',
            dealerId: 'FPS-DEALER-101',
            ...(timestamp ? { timestamp } : {})
          }
        }
      });
    }

    if (route.commodity === 'Rice' && !context.distributions.some((item) => item.distributionId === exceptionDistributionId)) {
      const timestamp = getDistributionTimestamp(context, 'exception-ration-card-hash', route.commodity);
      actions.push({
        id: exceptionDistributionId,
        label: 'Approve supervisor exception issue',
        detail: 'Record an exception-approved distribution with supervisor identity and reason.',
        roles: ['FPS'],
        status: 'exception-approved',
        request: {
          kind: 'supervisor-exception-distribute',
          payload: {
            distributionId: exceptionDistributionId,
            fpsId: 'FPS-101',
            rationCardHash: 'exception-ration-card-hash',
            beneficiaryRefHash: 'exception-beneficiary-hash',
            commodity: route.commodity,
            deliveredKg: 10,
            authMode: AuthMode.SUPERVISOR_EXCEPTION,
            authResult: AuthResult.EXCEPTION_APPROVED,
            authTxnRefHash: 'auth-ref-poc-exception',
            dealerId: 'FPS-DEALER-101',
            approvedBy: 'SUPERVISOR-101',
            exceptionReason: 'Biometric failure approved at shop.',
            ...(timestamp ? { timestamp } : {})
          }
        }
      });
    }
  }

  return actions;
}

export const getNextWorkflowAction = (
  context: WorkflowContext,
  options?: { receiveQtyKg?: number; allowDuplicateClaim?: boolean; commodity?: string }
): WorkflowActionSpec | null => {
  const actions = getWorkflowActions(context, options?.commodity);
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
    entitlements: [...(context.entitlements ?? [])],
    alerts: [...(context.alerts ?? [])],
    ledgerEvents: [...(context.ledgerEvents ?? [])]
  };

  let event: LedgerEvent;
  let message = 'Workflow action recorded.';

  if (request.kind === 'authorize-movement') {
    event = evidence('RO_LITE_APPROVED', 'workflow', request.transferId, request);
    message = `RO-lite movement approved by ${request.authorizedBy} for ${request.transferId}.`;
	  } else if (request.kind === 'dispatch') {
	    const stageTwoAuthorized =
	      isLegAuthorized(current, request.payload.transferId) || Boolean(request.payload.authorizedBy);
	    if (request.payload.stage === 'II' && (!request.payload.roRef || !stageTwoAuthorized)) {
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
	      if (request.payload.dispatchedQtyKg <= 0) {
	        throw new Error('dispatchedQtyKg must be positive');
	      }
	      const lot = current.lots.find((item) => item.lotId === request.payload.lotId);
	      if (!lot) {
	        throw new Error(`Lot ${request.payload.lotId} not found`);
	      }
	      const lotKind: CommodityRouteLeg['lot'] = lot.transformedFromLotId ? 'transformed' : 'source';
	      if (!isCommodityRouteEdgeAllowed(lot.commodity, request.payload.fromOrg, request.payload.toOrg, lotKind)) {
	        throw new Error(
	          `${lot.commodity} route does not allow movement from ${request.payload.fromOrg} to ${request.payload.toOrg}`
	        );
	      }
	      const available = getSessionStockKg(current, request.payload.fromOrg, request.payload.lotId);
	      if (request.payload.dispatchedQtyKg > available) {
	        throw new Error(
          `Insufficient stock for ${request.payload.fromOrg}: ${available} kg available, ${request.payload.dispatchedQtyKg} kg requested`
        );
      }
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
  } else if (request.kind === 'receive') {
    const transfer = current.transfers.find((item) => item.transferId === request.transferId);
    if (!transfer) {
      throw new Error(`Transfer ${request.transferId} not found`);
    }
    if (request.receivedQtyKg <= 0) {
      throw new Error('receivedQtyKg must be positive');
    }
    if (request.receivedQtyKg > transfer.dispatchedQtyKg) {
      throw new Error(`receivedQtyKg cannot exceed dispatchedQtyKg for transfer ${transfer.transferId}`);
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
    const timestamp = request.payload.timestamp ?? getDistributionTimestamp(current, request.payload.rationCardHash, request.payload.commodity) ?? now();
    const seriesId = seriesIdFromLotId(
      current.lots.find((lot) => lot.commodity === request.payload.commodity)?.lotId ??
        `LOT-${commodityDefinition(request.payload.commodity).slug}-2026-001`
    );
    const seriesToken = seriesId === INITIAL_DEMO_SERIES_ID ? 'POC' : seriesId;
    const slug = commodityDefinition(request.payload.commodity).slug;
    const duplicateAlertId =
      seriesId === INITIAL_DEMO_SERIES_ID && request.payload.commodity === 'Rice'
        ? 'ALERT-POC-DUPLICATE'
        : `ALERT-${seriesToken}-${slug}-DUPLICATE`;
    event = evidence('DUPLICATE_CLAIM_BLOCKED', 'audit', request.payload.distributionId, request.payload);
    current.alerts.push({
      alertId: duplicateAlertId,
      alertType: AlertType.DUPLICATE_CLAIM,
      entityId: request.payload.rationCardHash,
      riskLevel: 'HIGH',
      message: 'Duplicate or over-entitlement claim blocked before distribution.',
      status: 'OPEN',
      evidence: { rationCardHash: request.payload.rationCardHash, month: monthKey(timestamp), deliveredKg: request.payload.deliveredKg },
      createdAt: timestamp
    });
    message = 'Duplicate claim blocked and written to the auditor queue.';
  } else if (request.kind === 'distribute' || request.kind === 'supervisor-exception-distribute') {
    const timestamp = request.payload.timestamp ?? getDistributionTimestamp(current, request.payload.rationCardHash, request.payload.commodity) ?? now();
    if (request.payload.deliveredKg <= 0) {
      throw new Error('deliveredKg must be positive');
    }
    const month = monthKey(timestamp);
    const entitlementIndex = current.entitlements.findIndex(
      (item) =>
        item.rationCardHash === request.payload.rationCardHash &&
        item.commodity === request.payload.commodity &&
        item.month === month
    );
    const entitlement = current.entitlements[entitlementIndex];
    if (!entitlement || !entitlement.active) {
      throw new Error(`No active entitlement for ${request.payload.rationCardHash} in ${month}`);
    }
    if (entitlement.availableBalanceKg < request.payload.deliveredKg) {
      // Mirror the ledger: block the claim, raise the audit signal, record nothing.
      event = evidence('DUPLICATE_CLAIM_BLOCKED', 'audit', request.payload.distributionId, request.payload);
      current.alerts.push({
        alertId: `ALERT-${request.payload.distributionId}-ENTITLEMENT`,
        alertType: AlertType.DUPLICATE_CLAIM,
        entityId: request.payload.rationCardHash,
        riskLevel: 'HIGH',
        message: 'Over-entitlement claim blocked before distribution.',
        status: 'OPEN',
        evidence: {
          rationCardHash: request.payload.rationCardHash,
          month,
          requestedQtyKg: request.payload.deliveredKg,
          availableBalanceKg: entitlement.availableBalanceKg
        },
        createdAt: timestamp
      });
      current.ledgerEvents.push(event);
      return {
        context: current,
        message: `Claim blocked: ${request.payload.deliveredKg} kg requested, only ${entitlement.availableBalanceKg} kg available this month.`,
        evidence: event
      };
    }
    current.entitlements[entitlementIndex] = {
      ...entitlement,
      alreadyLiftedKg: entitlement.alreadyLiftedKg + request.payload.deliveredKg,
      availableBalanceKg: entitlement.availableBalanceKg - request.payload.deliveredKg
    };
    const distribution: DistributionTransaction = {
      ...request.payload,
      timestamp,
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
      timestamp
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
  } else if (request.kind === 'allocate') {
    if (request.payload.allocatedQtyKg <= 0) {
      throw new Error('allocatedQtyKg must be positive');
    }
    if (current.allocations.some((item) => item.allocationId === request.payload.allocationId)) {
      throw new Error(`Allocation ${request.payload.allocationId} already exists`);
    }
    const available = getSessionStockKg(
      current,
      request.payload.sourceGodownId,
      undefined,
      request.payload.commodity
    );
    if (request.payload.allocatedQtyKg > available) {
      throw new Error(
        `Insufficient stock for ${request.payload.sourceGodownId}: ${available} kg available, ${request.payload.allocatedQtyKg} kg requested`
      );
    }
    const allocation: FPSAllocation = {
      ...request.payload,
      status: 'ALLOCATED'
    };
    current.allocations.push(allocation);
    event = evidence('ALLOCATE_TO_FPS', 'allocation', allocation.allocationId, allocation);
    message = `${allocation.allocationId} allocated to ${allocation.fpsId}.`;
  } else if (request.kind === 'fps-receipt') {
    const allocation = current.allocations.find((item) => item.allocationId === request.allocationId);
    if (!allocation) {
      throw new Error(`Allocation ${request.allocationId} not found`);
    }
    if (isAllocationReceived(allocation)) {
      throw new Error(`Allocation ${request.allocationId} already received`);
    }
    if (request.receivedQtyKg <= 0) {
      throw new Error('receivedQtyKg must be positive');
    }
    if (request.receivedQtyKg > allocation.allocatedQtyKg) {
      throw new Error(`receivedQtyKg cannot exceed allocatedQtyKg for allocation ${allocation.allocationId}`);
    }
    const shortageQtyKg = Math.max(0, allocation.allocatedQtyKg - request.receivedQtyKg);
    current.allocations = current.allocations.map((item) =>
      item.allocationId === request.allocationId
        ? {
            ...item,
            status: shortageQtyKg > 0 ? ('RECEIVED_WITH_SHORTAGE' as const) : ('RECEIVED' as const),
            receivedQtyKg: request.receivedQtyKg,
            ...(shortageQtyKg > 0 ? { shortageQtyKg } : {})
          }
        : item
    );
    event = evidence('RECORD_FPS_RECEIPT', 'allocation', request.allocationId, {
      allocationId: request.allocationId,
      receivedQtyKg: request.receivedQtyKg,
      ...(shortageQtyKg > 0 ? { shortageQtyKg } : {})
    });
    if (shortageQtyKg > 0) {
      current.alerts.push({
        alertId: `ALERT-${request.allocationId}-SHORT`,
        alertType: AlertType.SHORT_RECEIPT,
        entityId: request.allocationId,
        riskLevel: 'HIGH',
        message: `${shortageQtyKg} kg short FPS receipt at ${allocation.fpsId}.`,
        status: 'OPEN',
        evidence: {
          allocationId: request.allocationId,
          fpsId: allocation.fpsId,
          sourceGodownId: allocation.sourceGodownId,
          commodity: allocation.commodity,
          allocatedQtyKg: allocation.allocatedQtyKg,
          receivedQtyKg: request.receivedQtyKg,
          shortageQtyKg
        },
        createdAt: now()
      });
    }
    message = `FPS receipt recorded for ${request.allocationId}.`;
  } else if (request.kind === 'auth') {
    event = evidence(request.kind.toUpperCase(), 'workflow', request.kind, request as unknown as Record<string, unknown>);
  } else {
    throw new Error('Unsupported workflow action');
  }

  current.ledgerEvents.push(event);
  return { context: current, message, evidence: event };
}

export const getWorkflowProgress = (context: WorkflowContext, commodity: CommodityName = DEFAULT_WORKFLOW_COMMODITY): { completed: number; total: number } => {
  const route = getWorkflowRoute(commodity, context.lots);
  const plannedLegs = getPlannedLegs(route.commodity, context.lots);
  const seriesId = seriesIdFromLotId(route.sourceLotId);
  const seriesToken = seriesId === INITIAL_DEMO_SERIES_ID ? 'POC' : seriesId;
  const slug = commodityDefinition(route.commodity).slug;
  const distributionId = buildDistributionId(seriesId, slug, '001');
  const duplicateAlertId =
    seriesId === INITIAL_DEMO_SERIES_ID && route.commodity === 'Rice'
      ? 'ALERT-POC-DUPLICATE'
      : `ALERT-${seriesToken}-${slug}-DUPLICATE`;
  const exceptionDistributionId = buildDistributionId(seriesId, slug, 'EXCEPTION');
  const checkpoints = [
    ...plannedLegs.filter((leg) => leg.roRef).map((leg) => isLegAuthorized(context, leg.id)),
    ...plannedLegs.map((leg) => isReceived(findTransfer(context.transfers, leg.id))),
    ...(route.fpsDelivery
      ? [
          context.allocations.some((item) => item.allocationId === route.fpsDelivery!.allocationId),
          context.allocations.some(
            (item) => item.allocationId === route.fpsDelivery!.allocationId && isAllocationReceived(item)
          )
        ]
      : []),
    context.distributions.some((item) => item.distributionId === distributionId),
    context.alerts?.some((alert) => alert.alertId === duplicateAlertId) ?? false,
    ...(route.commodity === 'Rice' ? [context.distributions.some((item) => item.distributionId === exceptionDistributionId)] : [])
  ];

  return {
    completed: checkpoints.filter(Boolean).length,
    total: checkpoints.length
  };
};

export function getAllCommoditiesWorkflowProgress(context: WorkflowContext): Array<{ commodity: CommodityName; completed: number; total: number }> {
  return COMMODITIES.map((def) => ({ commodity: def.name, ...getWorkflowProgress(context, def.name) }));
}
