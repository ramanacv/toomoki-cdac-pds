import type {
  AuditAlert,
  AuthTransaction,
  CommodityLot,
  DashboardSummary,
  DistributionTransaction,
  FPSAllocation,
  MonthlyEntitlement,
  Stakeholder,
  TransferOrder
} from '@pds/shared-types';
import stakeholdersJson from '../../../mock/entities/stakeholders.json' with { type: 'json' };
import lotsJson from '../../../mock/entities/lots.json' with { type: 'json' };
import transfersJson from '../../../mock/entities/transfers.json' with { type: 'json' };
import allocationsJson from '../../../mock/entities/allocations.json' with { type: 'json' };
import distributionsJson from '../../../mock/entities/distributions.json' with { type: 'json' };
import authTransactionsJson from '../../../mock/entities/auth-transactions.json' with { type: 'json' };
import entitlementsJson from '../../../mock/entities/entitlements.json' with { type: 'json' };
import backendSeedJson from '../../../mock/seed/backend.json' with { type: 'json' };
import dashboardSummaryJson from '../../../mock/workspace/dashboard-summary.json' with { type: 'json' };
import happyPathScenarioJson from '../../../mock/scenarios/happy-path.json' with { type: 'json' };
import shortReceiptScenarioJson from '../../../mock/scenarios/short-receipt.json' with { type: 'json' };
import duplicateClaimScenarioJson from '../../../mock/scenarios/duplicate-claim.json' with { type: 'json' };

export type DemoScenario = 'happy-path' | 'short-receipt' | 'duplicate-claim';

export type BackendSeed = {
  initialLot: Omit<CommodityLot, 'status'>;
  initialEntitlement: MonthlyEntitlement;
  beneficiaryRegistry: {
    beneficiaryRefHash: string;
    nameMasked: string;
    district: string;
    rationCardHash: string;
    active: boolean;
  };
  rationCard: {
    rationCardHash: string;
    householdSize: number;
    district: string;
    status: string;
  };
};

export type ScenarioFixture = {
  id: DemoScenario;
  title: string;
  tagline: string;
  dashboardSummary: Partial<DashboardSummary>;
  alerts: AuditAlert[];
};

export const stakeholders = stakeholdersJson as Stakeholder[];
export const lots = lotsJson as CommodityLot[];
export const transfers = transfersJson as TransferOrder[];
export const allocations = allocationsJson as FPSAllocation[];
export const distributions = distributionsJson as DistributionTransaction[];
export const authTransactions = authTransactionsJson as AuthTransaction[];
export const entitlements = entitlementsJson as MonthlyEntitlement[];
export const backendSeed = backendSeedJson as BackendSeed;
export const dashboardSummary = dashboardSummaryJson as DashboardSummary;

const scenarioFixtures: Record<DemoScenario, ScenarioFixture> = {
  'happy-path': happyPathScenarioJson as ScenarioFixture,
  'short-receipt': shortReceiptScenarioJson as ScenarioFixture,
  'duplicate-claim': duplicateClaimScenarioJson as ScenarioFixture
};

export const getScenarioFixture = (scenario: DemoScenario): ScenarioFixture => scenarioFixtures[scenario];

export const getScenarioAlerts = (scenario: DemoScenario): AuditAlert[] =>
  getScenarioFixture(scenario).alerts;

export const getScenarioDashboardSummary = (scenario: DemoScenario): DashboardSummary => ({
  ...dashboardSummary,
  ...getScenarioFixture(scenario).dashboardSummary
});

export const getWorkspaceSnapshot = (scenario: DemoScenario = 'happy-path') => ({
  summary: getScenarioDashboardSummary(scenario),
  stakeholders,
  lots,
  transfers,
  allocations,
  authTransactions,
  entitlements,
  distributions,
  alerts: getScenarioAlerts(scenario)
});
