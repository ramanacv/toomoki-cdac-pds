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
import { AuthMode, AuthResult } from '@pds/shared-types';
import {
  demoAuthTransactions,
  demoAllocations,
  demoDistributions,
  demoEntitlements,
  demoLots,
  demoStakeholders,
  demoSummaryFallback,
  demoTransfers,
  getScenarioAlerts,
  type DemoScenario
} from './demo-model.js';
import type { WorkflowActionRequest } from './workflow-actions.js';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';

export type WorkspaceData = {
  summary: DashboardSummary;
  stakeholders: Stakeholder[];
  lots: CommodityLot[];
  transfers: TransferOrder[];
  allocations: FPSAllocation[];
  authTransactions: AuthTransaction[];
  entitlements: MonthlyEntitlement[];
  distributions: DistributionTransaction[];
  alerts: AuditAlert[];
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed for ${path}`);
  }

  return (await response.json()) as T;
}

export async function loadDashboardSummary(): Promise<DashboardSummary> {
  try {
    return await fetchJson<DashboardSummary>('/dashboard/summary');
  } catch {
    return demoSummaryFallback;
  }
}

export async function loadStakeholders(): Promise<Stakeholder[]> {
  try {
    return await fetchJson<Stakeholder[]>('/stakeholders');
  } catch {
    return demoStakeholders;
  }
}

export async function loadLots(): Promise<CommodityLot[]> {
  try {
    return await fetchJson<CommodityLot[]>('/lots');
  } catch {
    return demoLots;
  }
}

export async function loadTransfers(): Promise<TransferOrder[]> {
  try {
    return await fetchJson<TransferOrder[]>('/transfers');
  } catch {
    return demoTransfers;
  }
}

export async function loadAllocations(): Promise<FPSAllocation[]> {
  try {
    return await fetchJson<FPSAllocation[]>('/fps-allocations');
  } catch {
    return demoAllocations;
  }
}

export async function loadAuthTransactions(): Promise<AuthTransaction[]> {
  try {
    return await fetchJson<AuthTransaction[]>('/auth/transactions');
  } catch {
    return demoAuthTransactions;
  }
}

export async function loadEntitlements(): Promise<MonthlyEntitlement[]> {
  try {
    return await fetchJson<MonthlyEntitlement[]>('/entitlements');
  } catch {
    return demoEntitlements;
  }
}

export async function loadDistributions(): Promise<DistributionTransaction[]> {
  try {
    return await fetchJson<DistributionTransaction[]>('/distributions');
  } catch {
    return demoDistributions;
  }
}

export async function loadAlerts(scenario: DemoScenario): Promise<AuditAlert[]> {
  try {
    return await fetchJson<AuditAlert[]>('/audit-alerts');
  } catch {
    return getScenarioAlerts(scenario);
  }
}

export async function probeApi(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function loadWorkspaceData(scenario: DemoScenario): Promise<WorkspaceData> {
  const [summary, stakeholders, lots, transfers, allocations, authTransactions, entitlements, distributions, alerts] =
    await Promise.all([
      loadDashboardSummary(),
      loadStakeholders(),
      loadLots(),
      loadTransfers(),
      loadAllocations(),
      loadAuthTransactions(),
      loadEntitlements(),
      loadDistributions(),
      loadAlerts(scenario)
    ]);

  return {
    summary,
    stakeholders,
    lots,
    transfers,
    allocations,
    authTransactions,
    entitlements,
    distributions,
    alerts
  };
}

export async function executeWorkflowAction(request: WorkflowActionRequest): Promise<unknown> {
  switch (request.kind) {
    case 'dispatch':
      return postJson('/transfers', request.payload);
    case 'receive':
      return postJson(`/transfers/${request.transferId}/receive`, { receivedQtyKg: request.receivedQtyKg });
    case 'allocate':
      return postJson('/fps-allocations', request.payload);
    case 'fps-receipt':
      return postJson(`/fps-allocations/${request.allocationId}/receipt`, { receivedQtyKg: request.receivedQtyKg });
    case 'auth':
      return postJson('/auth/mock-otp', request.payload);
    case 'distribute':
      return postJson('/distributions', request.payload);
    case 'duplicate-distribute':
      return postJson('/distributions', request.payload);
    default:
      throw new Error('Unsupported workflow action');
  }
}

export const runShortReceiptDemo = async (): Promise<TransferOrder> => {
  await postJson('/transfers', {
    transferId: 'TR-UI-SHORT-001',
    lotId: 'LOT-RICE-2026-001',
    fromOrg: 'PROC-001',
    toOrg: 'MLL-001',
    dispatchedQtyKg: 1000,
    vehicleNo: 'KA01AB9001'
  });
  return postJson<TransferOrder>('/transfers/TR-UI-SHORT-001/receive', { receivedQtyKg: 800 });
};

export const authenticateBeneficiary = async (authTxnId: string) =>
  postJson<AuthTransaction>('/auth/mock-otp', {
    authTxnId,
    beneficiaryRefHash: 'beneficiary-hash',
    rationCardHash: 'demo-ration-card-hash',
    authResult: AuthResult.SUCCESS
  });

export const recordDistribution = async (input: {
  distributionId: string;
  authTxnRefHash: string;
  authMode: AuthMode;
  authResult: AuthResult;
  deliveredKg: number;
}) =>
  postJson<DistributionTransaction>('/distributions', {
    distributionId: input.distributionId,
    fpsId: 'FPS-101',
    rationCardHash: 'demo-ration-card-hash',
    beneficiaryRefHash: 'beneficiary-hash',
    commodity: 'Rice',
    deliveredKg: input.deliveredKg,
    authMode: input.authMode,
    authResult: input.authResult,
    authTxnRefHash: input.authTxnRefHash,
    dealerId: 'FPS-DEALER-101'
  });

export function buildApiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}
