import type { AuditAlert, DashboardSummary } from '@pds/shared-types';
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

export type DemoRole = 'DEPARTMENT' | 'PROCUREMENT' | 'GODOWN' | 'FPS' | 'AUDITOR';
export type DemoScreen =
  | 'dashboard'
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
  { id: 'stakeholders', label: 'Stakeholders', description: 'Registered PDS actors and identities.' },
  { id: 'lots', label: 'Lots', description: 'Commodity lots and custody history.' },
  { id: 'transfers', label: 'Transfers', description: 'Movement log across the supply chain.' },
  { id: 'allocations', label: 'Allocations', description: 'FPS allocation and receipt tracking.' },
  { id: 'distribution', label: 'Distribution', description: 'Beneficiary issue and receipt proof.' },
  { id: 'audit-alerts', label: 'Audit alerts', description: 'Exceptions, severity, and resolution.' },
  { id: 'verify', label: 'Verify', description: 'Trace and receipt lookup views.' }
];

export const roleScreens: Record<DemoRole, DemoScreen[]> = {
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
  return screens.includes('dashboard') ? 'dashboard' : fallbackScreen;
};

const baseWorkflow: WorkflowStep[] = [
  {
    id: 'procurement',
    title: 'Procurement & milling',
    detail: 'Rice lot created and moved from procurement to the miller.',
    state: 'complete'
  },
  {
    id: 'state-godown',
    title: 'State godown receipt',
    detail: 'Bulk stock is received and custody is recorded on-ledger.',
    state: 'complete'
  },
  {
    id: 'block-godown',
    title: 'Block godown transfer',
    detail: 'Stock is pushed toward the local distribution buffer.',
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
      step.id === 'state-godown'
        ? {
            ...step,
            state: 'blocked',
            detail: 'Receipt was short by 300 kg, which triggers an audit alert.'
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
