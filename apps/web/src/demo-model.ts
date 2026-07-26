import type { DashboardSummary } from '@pds/shared-types';
import {
  allocations as demoAllocations,
  authTransactions as demoAuthTransactions,
  dashboardSummary as demoSummaryFallback,
  distributions as demoDistributions,
  entitlements as demoEntitlements,
  demoQuantities,
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
  | 'BLOCK_OFFICE'
  | 'FCI_DEPOT'
  | 'FPS'
  | 'AUDITOR'
  | 'GODOWN';

export const oidcRoleToDemoRole = (roles: readonly string[]): DemoRole | null => {
  const mappings: Array<[string, DemoRole]> = [
    ['management', 'MANAGEMENT'],
    ['department', 'CONTROL_OFFICE'],
    ['block-office', 'BLOCK_OFFICE'],
    ['procurement', 'FCI_DEPOT'],
    ['fci', 'FCI_DEPOT'],
    ['godown', 'GODOWN'],
    ['fps', 'FPS'],
    ['auditor', 'AUDITOR']
  ];
  return mappings.find(([role]) => roles.includes(role))?.[1] ?? null;
};
export type DemoScreen =
  | 'dashboard'
  | 'workbench'
  | 'stakeholders'
  | 'lots'
  | 'transfers'
  | 'allocations'
  | 'distribution'
  | 'audit-alerts'
  | 'eligibility-review'
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
    title: 'District Supply Officer (DSO)',
    summary: 'Authorize Stage-II Release Orders from the state godown to the block godown.',
    modules: ['Pending RO approvals', 'Stage-II movement review', 'Blocked dispatches']
  },
  BLOCK_OFFICE: {
    title: 'Block Supply Officer (BSO)',
    summary: 'Allot block-godown stock to Fair Price Shops and monitor block supply.',
    modules: ['FPS allotment', 'Block monitoring', 'Allocation status']
  },
  FCI_DEPOT: {
    title: 'FCI Depot Officer',
    summary: 'Originate central lots and dispatch Stage-I stock to the state godown.',
    modules: ['Lot creation', 'Stage-I dispatch', 'Transport proof']
  },
  GODOWN: {
    title: 'Godown Operator',
    summary: 'Receive and dispatch stock at state and block godowns.',
    modules: ['Receipt confirmation', 'Stage-I/II dispatch', 'Shortage alerts']
  },
  FPS: {
    title: 'FPS Dealer',
    summary: 'Confirm shop receipt and simulate AePDS/ePoS authentication and distribution for the assigned shop.',
    modules: ['Assigned FPS stock', 'Simulated ePoS events', 'Proof status']
  },
  AUDITOR: {
    title: 'Auditor',
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
  { id: 'allocations', label: 'Allocations', description: 'FPS allotment and receipt tracking.' },
  { id: 'distribution', label: 'Distribution', description: 'Beneficiary issue and receipt proof.' },
  { id: 'audit-alerts', label: 'Audit alerts', description: 'Exceptions, severity, and resolution.' },
  { id: 'eligibility-review', label: 'Eligibility review', description: 'Synthetic external screening and guided RCMS review.' },
  { id: 'verify', label: 'Verify', description: 'Trace and receipt lookup views.' }
];

export const roleScreens: Record<DemoRole, DemoScreen[]> = {
  MANAGEMENT: ['dashboard', 'workbench', 'stakeholders', 'transfers', 'distribution', 'audit-alerts', 'eligibility-review', 'verify'],
  CONTROL_OFFICE: ['dashboard', 'workbench', 'transfers', 'audit-alerts', 'eligibility-review', 'verify'],
  BLOCK_OFFICE: ['dashboard', 'workbench', 'allocations', 'transfers', 'verify'],
  FCI_DEPOT: ['dashboard', 'workbench', 'lots', 'transfers', 'verify'],
  GODOWN: ['dashboard', 'workbench', 'lots', 'transfers', 'audit-alerts', 'verify'],
  FPS: ['dashboard', 'workbench', 'allocations', 'distribution', 'verify'],
  AUDITOR: ['dashboard', 'stakeholders', 'lots', 'transfers', 'allocations', 'distribution', 'audit-alerts', 'eligibility-review', 'verify']
};

export const getRoleScreens = (role: DemoRole): DemoScreen[] => roleScreens[role];

export const getDefaultScreen = (role: DemoRole): DemoScreen => {
  const screens = getRoleScreens(role);
  const fallbackScreen = screens[0] ?? 'dashboard';
  return role === 'MANAGEMENT' || role === 'AUDITOR'
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
    title: 'FCI origin',
    detail: 'FCI Depot Officer originates the lot and dispatches Stage-I stock to the state godown.',
    state: 'complete'
  },
  {
    id: 'ro-lite',
    title: 'DSO Release Order',
    detail: 'District Supply Officer (DSO) authorizes Stage-II movement to the block godown.',
    state: 'complete'
  },
  {
    id: 'block-receipt',
    title: 'Block godown receipt',
    detail: 'Godown Operator receives Stage-II stock at the block godown.',
    state: 'complete'
  },
  {
    id: 'fps-allocation',
    title: 'BSO FPS allotment',
    detail: 'Block Supply Officer (BSO) allots block-godown stock to the Fair Price Shop.',
    state: 'complete'
  },
  {
    id: 'fps-receipt',
    title: 'FPS receipt',
    detail: 'FPS Dealer confirms receipt of the allotted stock at the shop.',
    state: 'complete'
  },
  {
    id: 'authentication',
    title: 'Beneficiary authentication',
    detail: 'A clearly labelled fixture simulates the non-sensitive outcome of authoritative AePDS/ePoS authentication.',
    state: 'complete'
  },
  {
    id: 'distribution',
    title: 'Commodity delivery',
    detail: 'A simulated AePDS/ePoS distribution event is correlated; ViksitPDS is not the ration-sale terminal.',
    state: 'complete'
  }
];

export function buildWorkflowSteps(scenario: DemoScenario): WorkflowStep[] {
  if (scenario === 'short-receipt') {
    return baseWorkflow.map((step) =>
      step.id === 'fps-receipt'
        ? {
            ...step,
            state: 'blocked',
            detail: 'FPS receipt was short, which triggers an audit alert.'
          }
        : step.id === 'authentication' || step.id === 'distribution'
          ? { ...step, state: 'pending' }
          : step
    );
  }

  if (scenario === 'duplicate-claim') {
    return baseWorkflow.map((step) =>
      step.id === 'distribution'
        ? {
            ...step,
            state: 'blocked',
            detail: 'A second lift attempt in the same month is blocked with audit evidence.'
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
        detail: 'Lot history shows a shortage on receipt at the issue point.',
        accent: 'amber'
      },
      {
        title: 'Shortage',
        value: `${demoQuantities.shortReceiptDispatchKg - demoQuantities.shortReceiptReceivedKg} kg`,
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
      value: `${demoQuantities.citizenDistributionKg} kg`,
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
