import type {
  AuditAlert,
  AuthTransaction,
  DashboardSummary,
  CommodityLot,
  FPSAllocation,
  DistributionTransaction,
  MonthlyEntitlement,
  TransferOrder,
  Stakeholder
} from '@pds/shared-types';
import { AlertType, AuthMode, AuthResult, LotStatus, StakeholderStatus, StakeholderType, TransferStatus } from '@pds/shared-types';

export type DemoRole = 'DEPARTMENT' | 'PROCUREMENT' | 'GODOWN' | 'FPS' | 'AUDITOR';
export type DemoScenario = 'happy-path' | 'short-receipt' | 'duplicate-claim';
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

export const demoSummaryFallback: DashboardSummary = {
  trackedStockKg: 10700,
  activeLots: 1,
  completedDistributions: 1,
  pendingReceipts: 0,
  openAlerts: 1,
  highRiskFps: ['FPS-101']
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

export const demoStakeholders: Stakeholder[] = [
  {
    stakeholderId: 'PROC-001',
    stakeholderType: StakeholderType.PROCUREMENT_CENTER,
    name: 'Procurement Centre 01',
    district: 'Demo District',
    licenseNo: 'PROC-LIC-001',
    status: StakeholderStatus.ACTIVE
  },
  {
    stakeholderId: 'MLL-001',
    stakeholderType: StakeholderType.MILLER,
    name: 'Miller 01',
    district: 'Demo District',
    licenseNo: 'MLL-LIC-001',
    status: StakeholderStatus.ACTIVE
  },
  {
    stakeholderId: 'GODOWN-S-001',
    stakeholderType: StakeholderType.STATE_GODOWN,
    name: 'State Godown 01',
    district: 'Demo District',
    licenseNo: 'SG-LIC-001',
    status: StakeholderStatus.ACTIVE
  },
  {
    stakeholderId: 'GODOWN-B-001',
    stakeholderType: StakeholderType.BLOCK_GODOWN,
    name: 'Block Godown 01',
    district: 'Demo District',
    licenseNo: 'BG-LIC-001',
    status: StakeholderStatus.ACTIVE
  },
  {
    stakeholderId: 'FPS-101',
    stakeholderType: StakeholderType.FAIR_PRICE_SHOP,
    name: 'FPS 101',
    district: 'Demo District',
    licenseNo: 'FPS-LIC-101',
    status: StakeholderStatus.ACTIVE
  }
];

export const demoLots: CommodityLot[] = [
  {
    lotId: 'LOT-RICE-2026-001',
    commodity: 'Rice',
    season: 'Kharif 2026',
    quantityKg: 10000,
    qualityGrade: 'A',
    source: 'Procurement Centre 01',
    currentOwner: 'GODOWN-B-001',
    currentLocation: 'Block Godown 01',
    status: LotStatus.RECEIVED
  },
  {
    lotId: 'LOT-RICE-2026-002',
    commodity: 'Rice',
    season: 'Kharif 2026',
    quantityKg: 2500,
    qualityGrade: 'A',
    source: 'Procurement Centre 01',
    currentOwner: 'FPS-101',
    currentLocation: 'FPS 101',
    status: LotStatus.DISPATCHED
  }
];

export const demoTransfers: TransferOrder[] = [
  {
    transferId: 'TRANSFER-001',
    lotId: 'LOT-RICE-2026-001',
    fromOrg: 'GODOWN-S-001',
    toOrg: 'GODOWN-B-001',
    dispatchedQtyKg: 1000,
    receivedQtyKg: 1000,
    vehicleNo: 'KA01AB1234',
    status: TransferStatus.RECEIVED,
    dispatchTimestamp: '2026-06-09T08:15:00.000Z',
    receiveTimestamp: '2026-06-09T09:00:00.000Z'
  }
];

export const demoAllocations: FPSAllocation[] = [
  {
    allocationId: 'ALLOC-2026-001',
    fpsId: 'FPS-101',
    commodity: 'Rice',
    allocatedQtyKg: 1000,
    receivedQtyKg: 1000,
    month: '2026-06',
    sourceGodownId: 'GODOWN-B-001',
    status: 'RECEIVED'
  },
  {
    allocationId: 'ALLOC-2026-002',
    fpsId: 'FPS-101',
    commodity: 'Rice',
    allocatedQtyKg: 500,
    month: '2026-07',
    sourceGodownId: 'GODOWN-B-001',
    status: 'ALLOCATED'
  }
];

export const demoDistribution: DistributionTransaction = {
  distributionId: 'DIST-2026-001',
  fpsId: 'FPS-101',
  rationCardHash: 'demo-ration-card-hash',
  beneficiaryRefHash: 'demo-beneficiary-ref-hash',
  commodity: 'Rice',
  deliveredKg: 25,
  authMode: AuthMode.MOCK_OTP,
  authResult: AuthResult.SUCCESS,
  authTxnRefHash: 'auth-ref-2026-001',
  dealerId: 'FPS-DEALER-101',
  timestamp: '2026-06-09T10:10:00.000Z',
  ledgerTxId: 'ledger-tx-dist-001'
};

export const demoDistributions: DistributionTransaction[] = [demoDistribution];

export const demoAuthTransactions: AuthTransaction[] = [
  {
    authTxnId: 'AUTH-2026-001',
    beneficiaryRefHash: 'demo-beneficiary-ref-hash',
    rationCardHash: 'demo-ration-card-hash',
    authMode: AuthMode.MOCK_OTP,
    authResult: AuthResult.SUCCESS,
    authTxnRefHash: 'auth-ref-2026-001',
    timestamp: '2026-06-09T10:05:00.000Z'
  }
];

export const demoEntitlements: MonthlyEntitlement[] = [
  {
    rationCardHash: 'demo-ration-card-hash',
    commodity: 'Rice',
    month: '2026-06',
    monthlyEntitlementKg: 25,
    alreadyLiftedKg: 25,
    availableBalanceKg: 0,
    active: true
  }
];

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
  switch (scenario) {
    case 'short-receipt':
      return 'Short receipt exception';
    case 'duplicate-claim':
      return 'Duplicate claim block';
    default:
      return 'Happy-path distribution';
  }
}

export function getScenarioTagline(scenario: DemoScenario): string {
  switch (scenario) {
    case 'short-receipt':
      return 'A custody mismatch is detected when a transfer arrives short and the audit engine flags it.';
    case 'duplicate-claim':
      return 'A beneficiary attempts to lift the same monthly entitlement twice and the system blocks it.';
    default:
      return 'A seeded rice lot moves from procurement to the FPS with an auditable receipt trail.';
  }
}

export function getScenarioMetrics(scenario: DemoScenario): DashboardSummary {
  if (scenario === 'short-receipt') {
    return {
      ...demoSummaryFallback,
      openAlerts: 2,
      pendingReceipts: 1
    };
  }

  if (scenario === 'duplicate-claim') {
    return {
      ...demoSummaryFallback,
      openAlerts: 2,
      completedDistributions: 0
    };
  }

  return demoSummaryFallback;
}

export function getScenarioAlerts(scenario: DemoScenario): AuditAlert[] {
  const baseAlert: AuditAlert = {
    alertId: 'ALERT-DB-001',
    alertType: AlertType.DB_LEDGER_MISMATCH,
    entityId: 'FPS-101',
    riskLevel: 'MEDIUM',
    message: 'Dashboard state must be reconciled with the immutable ledger snapshot.',
    status: 'OPEN',
    evidence: {
      trackedStockKg: 10700,
      ledgerTxId: 'ledger-tx-dist-001'
    },
    createdAt: '2026-06-09T10:12:00.000Z'
  };

  if (scenario === 'short-receipt') {
    return [
      {
        alertId: 'ALERT-SHORT-001',
        alertType: AlertType.SHORT_RECEIPT,
        entityId: 'TRANSFER-002',
        riskLevel: 'HIGH',
        message: 'Received quantity is below dispatch quantity for the lot transfer.',
        status: 'OPEN',
        evidence: {
          dispatchedQtyKg: 1000,
          receivedQtyKg: 700,
          shortageQtyKg: 300
        },
        createdAt: '2026-06-09T09:40:00.000Z'
      },
      baseAlert
    ];
  }

  if (scenario === 'duplicate-claim') {
    return [
      {
        alertId: 'ALERT-DUP-001',
        alertType: AlertType.DUPLICATE_CLAIM,
        entityId: 'demo-ration-card-hash',
        riskLevel: 'HIGH',
        message: 'Beneficiary already lifted this month’s entitlement.',
        status: 'OPEN',
        evidence: {
          rationCardHash: 'demo-ration-card-hash',
          month: '2026-06',
          authTxnRefHash: 'auth-ref-2026-001'
        },
        createdAt: '2026-06-09T10:10:30.000Z'
      },
      baseAlert
    ];
  }

  return [baseAlert];
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
