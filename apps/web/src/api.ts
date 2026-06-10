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
import { getWorkspaceSnapshot, type DemoScenario } from '@pds/fixtures';
import { getDataSourceMode, usesMockData } from './data-source.js';
import { getScenarioAlerts } from './demo-model.js';
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

const mockWorkspace = (scenario: DemoScenario): WorkspaceData => getWorkspaceSnapshot(scenario);

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

async function loadFromApiOrMock<T>(
  path: string,
  mockValue: T,
  apiOnline: boolean
): Promise<T> {
  if (usesMockData(apiOnline)) {
    return mockValue;
  }

  return fetchJson<T>(path);
}

export async function loadDashboardSummary(apiOnline = true): Promise<DashboardSummary> {
  return loadFromApiOrMock('/dashboard/summary', mockWorkspace('happy-path').summary, apiOnline);
}

export async function loadStakeholders(apiOnline = true): Promise<Stakeholder[]> {
  return loadFromApiOrMock('/stakeholders', mockWorkspace('happy-path').stakeholders, apiOnline);
}

export async function loadLots(apiOnline = true): Promise<CommodityLot[]> {
  return loadFromApiOrMock('/lots', mockWorkspace('happy-path').lots, apiOnline);
}

export async function loadTransfers(apiOnline = true): Promise<TransferOrder[]> {
  return loadFromApiOrMock('/transfers', mockWorkspace('happy-path').transfers, apiOnline);
}

export async function loadAllocations(apiOnline = true): Promise<FPSAllocation[]> {
  return loadFromApiOrMock('/fps-allocations', mockWorkspace('happy-path').allocations, apiOnline);
}

export async function loadAuthTransactions(apiOnline = true): Promise<AuthTransaction[]> {
  return loadFromApiOrMock('/auth/transactions', mockWorkspace('happy-path').authTransactions, apiOnline);
}

export async function loadEntitlements(apiOnline = true): Promise<MonthlyEntitlement[]> {
  return loadFromApiOrMock('/entitlements', mockWorkspace('happy-path').entitlements, apiOnline);
}

export async function loadDistributions(apiOnline = true): Promise<DistributionTransaction[]> {
  return loadFromApiOrMock('/distributions', mockWorkspace('happy-path').distributions, apiOnline);
}

export async function loadAlerts(scenario: DemoScenario, apiOnline = true): Promise<AuditAlert[]> {
  return loadFromApiOrMock('/audit-alerts', getScenarioAlerts(scenario), apiOnline);
}

export async function probeApi(): Promise<boolean> {
  if (getDataSourceMode() === 'mock') {
    return false;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function loadWorkspaceData(scenario: DemoScenario): Promise<WorkspaceData> {
  const apiOnline = await probeApi();

  if (usesMockData(apiOnline)) {
    return mockWorkspace(scenario);
  }

  const [summary, stakeholders, lots, transfers, allocations, authTransactions, entitlements, distributions, alerts] =
    await Promise.all([
      loadDashboardSummary(apiOnline),
      loadStakeholders(apiOnline),
      loadLots(apiOnline),
      loadTransfers(apiOnline),
      loadAllocations(apiOnline),
      loadAuthTransactions(apiOnline),
      loadEntitlements(apiOnline),
      loadDistributions(apiOnline),
      loadAlerts(scenario, apiOnline)
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
