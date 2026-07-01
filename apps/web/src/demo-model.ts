import type { DashboardSummary } from '@pds/shared-types';
import {
  allocations as demoAllocations,
  authTransactions as demoAuthTransactions,
  dashboardSummary as demoSummaryFallback,
  distributions as demoDistributions,
  entitlements as demoEntitlements,
  getScenarioAlerts,
  getScenarioDashboardSummary,
  getScenarioFixture,
  lots as demoLots,
  stakeholders as demoStakeholders,
  transfers as demoTransfers,
  type DemoScenario
} from '@pds/fixtures';

export type { DemoScenario } from '@pds/fixtures';

export type DemoRole =
  | 'MANAGEMENT'
  | 'CONTROL_OFFICE'
  | 'FCI_DEPOT'
  | 'DEPOT'
  | 'FPS'
  | 'WELFARE_INSTITUTE'
  | 'SHIV_BHOJAN_OPERATOR'
  | 'AUDITOR'
  | 'DEPARTMENT'
  | 'PROCUREMENT'
  | 'GODOWN';
export type DemoScreen =
  | 'dashboard'
  | 'workbench'
  | 'stakeholders'
  | 'lots'
  | 'transfers'
  | 'allocations'
  | 'distribution'
  | 'audit-alerts'
  | 'verify';
export type WorkflowState = 'complete' | 'active' | 'blocked' | 'pending';

export type WorkflowStep = {
  id: string;
  title: string;
  detail: string;
  state: WorkflowState;
};

export type RoleProfile = {
  title: string;
  summary: string;
  modules: string[];
};

export type TraceCard = {
  title: string;
  value: string;
  detail: string;
  accent: 'emerald' | 'amber' | 'slate';
};

export type ScreenDefinition = {
  id: DemoScreen;
  label: string;
  description: string;
};

export {
  demoSummaryFallback,
  demoStakeholders,
  demoLots,
  demoTransfers,
  demoAllocations,
  demoDistributions,
  demoAuthTransactions,
  demoEntitlements,
  getScenarioAlerts
};

export const roleProfiles: Record<DemoRole, RoleProfile> = {
  MANAGEMENT: {
    title: 'Management',
    summary: 'Inspect aggregate workflow status and custody exceptions.',
    modules: ['Workflow status', 'Endpoint receipts', 'Audit evidence']
  },
  CONTROL_OFFICE: {
    title: 'DSO / FDO / TSO',
    summary: 'Authorize RO-lite Stage-II movement and review blocked dispatches.',
    modules: ['Pending approvals', 'RO-lite stamping', 'Movement blocks']
  },
  FCI_DEPOT: {
    title: 'FCI / Central Depot',
    summary: 'Move central stock into the state lifting chain.',
    modules: ['Central dispatch', 'Buffer receipt', 'Transport proof']
  },
  DEPOT: {
    title: 'Depot / Issue Point',
    summary: 'Dispatch approved stock to issue points and retail endpoints.',
    modules: ['Stage-I/II dispatch', 'Transporter evidence', 'Retail receipts']
  },
  WELFARE_INSTITUTE: {
    title: 'Welfare Institute',
    summary: 'Confirm hostel or institution stock receipts and shortages.',
    modules: ['Pending receipts', 'Shortage remarks', 'Endpoint stock']
  },
  SHIV_BHOJAN_OPERATOR: {
    title: 'Shiv Bhojan Operator',
    summary: 'Confirm meal-scheme stock receipts at the eatery endpoint.',
    modules: ['Pending receipts', 'Endpoint stock', 'Receipt proof']
  },
  DEPARTMENT: {
    title: 'Food Department',
    summary: 'Allocation, policy controls, and stock visibility.',
    modules: ['Stock overview', 'Allocation review', 'Audit exceptions']
  },
  PROCUREMENT: {
    title: 'Procurement Center',
    summary: 'Create lots and dispatch them into the supply chain.',
    modules: ['Lot creation', 'Dispatch proof', 'Transfer history']
  },
  GODOWN: {
    title: 'Godown Operator',
    summary: 'Receive stock, confirm shortages, and maintain custody.',
    modules: ['Receipt confirmation', 'Shortage alerts', 'Stock reconciliation']
  },
  FPS: {
    title: 'Fair Price Shop',
    summary: 'Receive allocations, authenticate beneficiaries, and distribute rations.',
    modules: ['FPS stock', 'Auth checks', 'Citizen receipt']
  },
  AUDITOR: {
    title: 'Audit Authority',
    summary: 'Inspect traceability, anomalies, and tamper evidence.',
    modules: ['Trace explorer', 'Open alerts', 'Resolution log']
  }
};

export const screenDefinitions: ScreenDefinition[] = [
  { id: 'dashboard', label: 'Dashboard', description: 'Summary, live state, and scenario control.' },
  { id: 'workbench', label: 'Workbench', description: 'Role-specific workflow queue and actions.' },
  { id: 'stakeholders', label: 'Stakeholders', description: 'Registered PDS actors and identities.' },
  { id: 'lots', label: 'Lots', description: 'Commodity lots and custody history.' },
  { id: 'transfers', label: 'Transfers', description: 'Movement log across the supply chain.' },
  { id: 'allocations', label: 'Allocations', description: 'FPS allocation and receipt tracking.' },
  { id: 'distribution', label: 'Distribution', description: 'Beneficiary issue and receipt proof.' },
  { id: 'audit-alerts', label: 'Audit alerts', description: 'Exceptions, severity, and resolution.' },
  { id: 'verify', label: 'Verify', description: 'Trace and receipt lookup views.' }
];

export const roleScreens: Record<DemoRole, DemoScreen[]> = {
  MANAGEMENT: ['dashboard', 'workbench', 'stakeholders', 'transfers', 'distribution', 'audit-alerts', 'verify'],
  CONTROL_OFFICE: ['workbench', 'transfers', 'audit-alerts', 'verify'],
  FCI_DEPOT: ['workbench', 'lots', 'transfers', 'verify'],
  DEPOT: ['workbench', 'lots', 'transfers', 'allocations', 'verify'],
  WELFARE_INSTITUTE: ['workbench', 'transfers', 'audit-alerts', 'verify'],
  SHIV_BHOJAN_OPERATOR: ['workbench', 'transfers', 'verify'],
  DEPARTMENT: ['dashboard', 'stakeholders', 'allocations', 'audit-alerts', 'verify'],
  PROCUREMENT: ['dashboard', 'stakeholders', 'lots', 'transfers', 'verify'],
  GODOWN: ['dashboard', 'lots', 'transfers', 'allocations', 'audit-alerts', 'verify'],
  FPS: ['dashboard', 'allocations', 'distribution', 'verify'],
  AUDITOR: ['dashboard', 'stakeholders', 'lots', 'transfers', 'allocations', 'distribution', 'audit-alerts', 'verify']
};

export const getRoleScreens = (role: DemoRole): DemoScreen[] => roleScreens[role];

export const getDefaultScreen = (role: DemoRole): DemoScreen => {
  const screens = getRoleScreens(role);
  const fallbackScreen = screens[0] ?? 'dashboard';
  return role === 'MANAGEMENT' || role === 'DEPARTMENT' || role === 'AUDITOR'
    ? screens.includes('dashboard')
      ? 'dashboard'
      : fallbackScreen
    : screens.includes('workbench')
      ? 'workbench'
      : fallbackScreen;
};

const baseWorkflow: WorkflowStep[] = [
  {
    id: 'central-tier',
    title: 'DFPD / FCI origin',
    detail: 'Central allocation and FCI buffer custody are represented before state lifting.',
    state: 'complete'
  },
  {
    id: 'milling',
    title: 'Milling transformation',
    detail: 'Parent paddy lot is transformed into a child rice lot at the miller.',
    state: 'complete'
  },
  {
    id: 'ro-lite',
    title: 'RO-lite authorization',
    detail: 'Control office stamps the Stage-II movement before issue-point dispatch.',
    state: 'complete'
  },
  {
    id: 'retail-endpoints',
    title: 'Retail endpoint receipts',
    detail: 'FPS, Welfare Institute, and Shiv Bhojan endpoints each record receipt.',
    state: 'complete'
  },
  {
    id: 'fps-allocation',
    title: 'FPS allocation',
    detail: 'Allocation is reserved for the fair price shop.',
    state: 'complete'
  },
  {
    id: 'authentication',
    title: 'Beneficiary authentication',
    detail: 'Mock OTP or supervised exception approval validates the claim.',
    state: 'complete'
  },
  {
    id: 'distribution',
    title: 'Commodity delivery',
    detail: 'Entitlement is checked and ration is issued.',
    state: 'complete'
  }
];

export function buildWorkflowSteps(scenario: DemoScenario): WorkflowStep[] {
  if (scenario === 'short-receipt') {
    return baseWorkflow.map((step) =>
      step.id === 'retail-endpoints'
        ? {
            ...step,
            state: 'blocked',
            detail: 'Endpoint receipt was short, which triggers an audit alert.'
          }
        : step
    );
  }

  if (scenario === 'duplicate-claim') {
    return baseWorkflow.map((step) =>
      step.id === 'authentication'
        ? {
            ...step,
            state: 'blocked',
            detail: 'The same ration card already lifted the monthly entitlement.'
          }
        : step
    );
  }

  return baseWorkflow;
}

export function getScenarioTitle(scenario: DemoScenario): string {
  return getScenarioFixture(scenario).title;
}

export function getScenarioTagline(scenario: DemoScenario): string {
  return getScenarioFixture(scenario).tagline;
}

export function getScenarioMetrics(scenario: DemoScenario): DashboardSummary {
  return getScenarioDashboardSummary(scenario);
}

export function getRoleProfile(role: DemoRole): RoleProfile {
  return roleProfiles[role];
}

export function getTraceCards(scenario: DemoScenario): TraceCard[] {
  if (scenario === 'short-receipt') {
    return [
      {
        title: 'Lot trace',
        value: 'LOT-RICE-2026-001',
        detail: 'Lot history shows a shortage on receipt at the block godown.',
        accent: 'amber'
      },
      {
        title: 'Shortage',
        value: '300 kg',
        detail: 'Shortage is captured as a ledger-visible audit signal.',
        accent: 'amber'
      },
      {
        title: 'Ledger status',
        value: 'Alert raised',
        detail: 'The mismatch is visible to the auditor immediately.',
        accent: 'slate'
      }
    ];
  }

  if (scenario === 'duplicate-claim') {
    return [
      {
        title: 'Ration card',
        value: 'demo-ration-card-hash',
        detail: 'The same card already lifted the monthly grain quota.',
        accent: 'amber'
      },
      {
        title: 'Auth proof',
        value: 'auth-ref-2026-001',
        detail: 'The duplicate claim is blocked before issue.',
        accent: 'amber'
      },
      {
        title: 'Ledger status',
        value: 'Claim rejected',
        detail: 'No distribution receipt is written for the duplicate attempt.',
        accent: 'slate'
      }
    ];
  }

  return [
    {
      title: 'Lot trace',
      value: 'LOT-RICE-2026-001',
      detail: 'The rice lot moved through all custody points successfully.',
      accent: 'emerald'
    },
    {
      title: 'Delivery',
      value: '25 kg',
      detail: 'Beneficiary entitlement was validated before issue.',
      accent: 'emerald'
    },
    {
      title: 'Ledger status',
      value: 'Receipt committed',
      detail: 'A tamper-evident transaction is available for audit.',
      accent: 'slate'
    }
  ];
}
