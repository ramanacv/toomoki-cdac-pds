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
  ,LedgerProofStatusResponse
} from '@pds/shared-types';
import { AuthMode, AuthResult } from '@pds/shared-types';
import { demoQuantities, getWorkspaceSnapshot, type DemoScenario } from '@pds/fixtures';
import { authHeaders, getCurrentIdentity, type WebRole } from './auth-token.js';
import { getDataSourceMode, usesMockData } from './data-source.js';
import { getScenarioAlerts } from './demo-model.js';
import type { WorkflowActionRequest } from './workflow-actions.js';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';

export type LedgerMode = 'demo' | 'fabric';

export type ApiHealth = {
  ok: boolean;
};

export type StockPosition = {
  entityId: string;
  commodity: string;
  quantityKg: number;
};

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
  ledgerEvents: LedgerEvent[];
  stockPositions: StockPosition[];
};

export type RestrictedWorkspaceCollection = 'authTransactions' | 'entitlements' | 'distributions' | 'alerts';

// Keep this map aligned with the API controllers' GET policies. Expected RBAC
// denials are represented as unavailable collections, not service outages.
const restrictedCollectionRoles: Record<RestrictedWorkspaceCollection, readonly WebRole[]> = {
  authTransactions: ['fps', 'department', 'auditor'],
  entitlements: ['fps', 'department', 'auditor'],
  distributions: ['fps', 'department', 'auditor', 'management'],
  alerts: ['auditor']
};

export const canReadWorkspaceCollection = (
  collection: RestrictedWorkspaceCollection,
  roles: readonly WebRole[]
): boolean => restrictedCollectionRoles[collection].some((role) => roles.includes(role));

const mockWorkspace = (scenario: DemoScenario): WorkspaceData => ({
  ...getWorkspaceSnapshot(scenario),
  ledgerEvents: [],
  stockPositions: []
});

async function readApiError(response: Response, path: string): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string };
    if (response.status === 401) {
      return 'Your identity session is missing or expired. Sign in again.';
    }
    if (response.status === 403) {
      return 'Your authenticated role is not permitted to perform this operation.';
    }
    return body.message ?? text ?? `Request failed for ${path}`;
  } catch {
    return text || `Request failed for ${path}`;
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(await readApiError(response, path));
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(await readApiError(response, path));
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

export async function loadLedgerEvents(apiOnline = true): Promise<LedgerEvent[]> {
  return loadFromApiOrMock('/ledger-events', [], apiOnline);
}

export async function loadStockPositions(apiOnline = true): Promise<StockPosition[]> {
  return loadFromApiOrMock('/stock', [], apiOnline);
}

export async function loadLedgerProofStatus(eventId: string): Promise<LedgerProofStatusResponse> {
  return fetchJson(`/ledger-proofs/${encodeURIComponent(eventId)}`);
}

export async function fetchApiHealth(): Promise<ApiHealth> {
  if (getDataSourceMode() === 'mock') {
    return { ok: false };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/health`);
    if (!response.ok) {
      return { ok: false };
    }
    return (await response.json()) as ApiHealth;
  } catch {
    return { ok: false };
  }
}

export async function probeApi(): Promise<boolean> {
  const health = await fetchApiHealth();
  return health.ok;
}

export async function loadWorkspaceData(scenario: DemoScenario): Promise<WorkspaceData> {
  const apiOnline = await probeApi();

  if (usesMockData(apiOnline)) {
    return mockWorkspace(scenario);
  }

  const roles = getCurrentIdentity()?.roles ?? [];
  const [summary, stakeholders, lots, transfers, allocations, authTransactions, entitlements, distributions, alerts, ledgerEvents, stockPositions] =
    await Promise.all([
      loadDashboardSummary(apiOnline),
      loadStakeholders(apiOnline),
      loadLots(apiOnline),
      loadTransfers(apiOnline),
      loadAllocations(apiOnline),
      canReadWorkspaceCollection('authTransactions', roles) ? loadAuthTransactions(apiOnline) : Promise.resolve([]),
      canReadWorkspaceCollection('entitlements', roles) ? loadEntitlements(apiOnline) : Promise.resolve([]),
      canReadWorkspaceCollection('distributions', roles) ? loadDistributions(apiOnline) : Promise.resolve([]),
      canReadWorkspaceCollection('alerts', roles) ? loadAlerts(scenario, apiOnline) : Promise.resolve([]),
      loadLedgerEvents(apiOnline),
      loadStockPositions(apiOnline)
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
    alerts,
    ledgerEvents,
    stockPositions
  };
}

export async function executeWorkflowAction(request: WorkflowActionRequest): Promise<unknown> {
  switch (request.kind) {
    case 'authorize-movement':
      return postJson(`/transfers/${request.transferId}/authorize`, {
        authorizedBy: request.authorizedBy,
        authorizedAt: request.authorizedAt,
        roRef: request.roRef,
        remarks: request.remarks
      });
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
    case 'supervisor-exception-distribute':
      return postJson('/distributions', request.payload);
    default:
      throw new Error('Unsupported workflow action');
  }
}

export const runShortReceiptDemo = async (): Promise<TransferOrder> => {
  await postJson('/transfers', {
    transferId: 'TR-UI-SHORT-001',
    lotId: 'LOT-RICE-2026-001',
    fromOrg: 'GODOWN-S-001',
    toOrg: 'ISSUE-001',
    dispatchedQtyKg: demoQuantities.shortReceiptDispatchKg,
    vehicleNo: 'KA01AB9001'
  });
  return postJson<TransferOrder>('/transfers/TR-UI-SHORT-001/receive', {
    receivedQtyKg: demoQuantities.shortReceiptReceivedKg
  });
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

export const createStockLot = async (input: {
  commodity: string;
  quantityKg: number;
  qualityGrade: string;
  currentOwner: string;
  currentLocation: string;
  season?: string;
  source?: string;
}): Promise<CommodityLot> =>
  postJson('/lots', {
    lotId: `LOT-${input.commodity.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-${Date.now()}`,
    commodity: input.commodity,
    season: input.season ?? 'Manual top-up',
    quantityKg: input.quantityKg,
    qualityGrade: input.qualityGrade,
    source: input.source ?? 'Admin top-up',
    currentOwner: input.currentOwner,
    currentLocation: input.currentLocation
  });

export function buildApiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}
