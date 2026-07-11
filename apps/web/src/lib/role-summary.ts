import type {
  AuditAlert,
  AuthTransaction,
  CommodityLot,
  DashboardSummary,
  DistributionTransaction,
  FPSAllocation,
  LedgerEvent,
  MonthlyEntitlement,
  Stakeholder,
  TransferOrder
} from '@pds/shared-types';
import { TransferStatus } from '@pds/shared-types';
import type { DemoRole } from '@/demo-model.js';
import { getAllCommoditiesRoleQueue } from '@/workflow-actions.js';
import { stageHints, summaryCardData } from '@/lib/constants.js';

export type RoleSummaryInput = {
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  authTransactions: AuthTransaction[];
  entitlements: MonthlyEntitlement[];
  distributions: DistributionTransaction[];
  alerts: AuditAlert[];
  ledgerEvents: LedgerEvent[];
  stakeholders: Stakeholder[];
};

// Demo org identities operated by each role, mirroring the planned legs in workflow-actions.
const roleOrgs: Partial<Record<DemoRole, string[]>> = {
  PROCUREMENT: ['PROC-001'],
  FCI_DEPOT: ['FCI-001'],
  DEPOT: ['GODOWN-S-001', 'ISSUE-001'],
  GODOWN: ['GODOWN-S-001'],
  FPS: ['FPS-101']
};

const kg = (value: number): string => `${value.toLocaleString()} kg`;

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const dispatchedKg = (transfers: TransferOrder[], orgs: string[]): number =>
  sum(transfers.filter((t) => orgs.includes(t.fromOrg)).map((t) => t.dispatchedQtyKg));

const receivedKg = (transfers: TransferOrder[], orgs: string[]): number =>
  sum(transfers.filter((t) => orgs.includes(t.toOrg)).map((t) => t.receivedQtyKg ?? 0));

const shortageKg = (transfers: TransferOrder[], orgs: string[]): number =>
  sum(transfers.filter((t) => orgs.includes(t.toOrg)).map((t) => t.shortageQtyKg ?? 0));

const inboundPending = (transfers: TransferOrder[], orgs: string[]): number =>
  transfers.filter((t) => orgs.includes(t.toOrg) && t.status === TransferStatus.DISPATCHED).length;

export function roleSummaryCards(
  role: DemoRole,
  data: RoleSummaryInput,
  liveSummary: DashboardSummary
): Array<[string, string, string?]> {
  const orgs = roleOrgs[role] ?? [];
  const queue = getAllCommoditiesRoleQueue(data, role).flatMap((g) => g.actions);
  const queued = queue.filter((action) => action.status !== 'blocked').length;
  const openAlerts = data.alerts.filter((alert) => alert.status === 'OPEN');

  switch (role) {
    case 'MANAGEMENT':
      return summaryCardData(liveSummary);

    case 'AUDITOR':
      return [
        ['Open alerts', openAlerts.length.toString()],
        ['High risk', openAlerts.filter((alert) => alert.riskLevel === 'HIGH').length.toString()],
        ['Distributions recorded', data.distributions.length.toString()],
        ['Ledger events', data.ledgerEvents.length.toString()]
      ];

    case 'CONTROL_OFFICE': {
      const stageTwo = data.transfers.filter((t) => t.stage === 'II');
      return [
        ['Queued approvals', queued.toString()],
        ['Stage-II movements', stageTwo.length.toString(), stageHints.II],
        ['Approved movements', stageTwo.filter((t) => t.approvalStatus === 'APPROVED' || Boolean(t.authorizedBy)).length.toString()],
        ['Blocked dispatches', data.transfers.filter((t) => t.approvalStatus === 'BLOCKED').length.toString()]
      ];
    }

    case 'PROCUREMENT':
      return [
        ['Queued actions', queued.toString()],
        ['Registered lots', data.lots.length.toString()],
        ['Dispatched', kg(dispatchedKg(data.transfers, orgs))],
        ['Open alerts', openAlerts.length.toString()]
      ];

    case 'FCI_DEPOT':
    case 'DEPOT':
      return [
        ['Queued actions', queued.toString()],
        ['Inbound pending', inboundPending(data.transfers, orgs).toString()],
        ['Received', kg(receivedKg(data.transfers, orgs))],
        ['Dispatched', kg(dispatchedKg(data.transfers, orgs))]
      ];

    case 'GODOWN':
      return [
        ['Queued actions', queued.toString()],
        ['Inbound pending', inboundPending(data.transfers, orgs).toString()],
        ['Received', kg(receivedKg(data.transfers, orgs))],
        ['Shortages', kg(shortageKg(data.transfers, orgs))]
      ];

    case 'FPS': {
      const own = data.allocations.filter((a) => orgs.includes(a.fpsId));
      const ownDistributions = data.distributions.filter((d) => orgs.includes(d.fpsId));
      return [
        ['Queued actions', queued.toString()],
        ['Allocated', kg(sum(own.map((a) => a.allocatedQtyKg)))],
        ['Received', kg(sum(own.map((a) => a.receivedQtyKg ?? 0)))],
        ['Distributed', kg(sum(ownDistributions.map((d) => d.deliveredKg)))]
      ];
    }

  }
}
