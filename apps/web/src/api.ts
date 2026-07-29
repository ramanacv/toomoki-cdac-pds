import type {
  AuditAlert,
  AuthTransaction,
  CommodityLot,
  DashboardSummary,
  DistributionTransaction,
  FPSAllocation,
  LedgerEvent,
  LedgerProofAnalyticsResponse,
  LedgerProofDetailResponse,
  LedgerProofStatusResponse,
  MonthlyEntitlement,
  Stakeholder,
  TransferOrder,
  EligibilityCase,
  EligibilitySummary,
  BeneficiaryLifecycleEvent,
  BeneficiaryLifecycleEventResult,
  BeneficiaryRegistrySummary,
  BeneficiaryRemovalReason,
  BeneficiaryRemovalResponse
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

export async function readApiError(response: Response, path: string): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string };
    if (response.status === 401) {
      return 'Your identity session is missing or expired. Sign in again.';
    }
    if (response.status === 403) {
      const reason = body.message ?? 'Your authenticated role is not permitted to perform this operation.';
      return `Access denied while loading ${path}: ${reason}`;
    }
    if (response.status === 429) {
      return `Rate limit exceeded while loading ${path}. Wait about a minute before switching personas again (demo Compose defaults are higher than production).`;
    }
    return body.message ?? text ?? `Request failed for ${path}`;
  } catch {
    if (response.status === 429) {
      return `Rate limit exceeded while loading ${path}. Wait about a minute before switching personas again.`;
    }
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

export async function fetchAssignedFpsId(): Promise<string> {
  const assignment = await fetchJson<{ fpsId: string }>('/auth/fps-assignment');
  return assignment.fpsId;
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

export async function loadLedgerProofAnalytics(apiOnline = true): Promise<LedgerProofAnalyticsResponse | null> {
  if (!apiOnline || usesMockData(apiOnline)) {
    return null;
  }
  return fetchJson('/ledger-proofs/analytics');
}

export async function loadLedgerProofDetail(eventId: string): Promise<LedgerProofDetailResponse> {
  return fetchJson(`/ledger-proofs/${encodeURIComponent(eventId)}/detail`);
}

export const loadEligibilitySummary = (): Promise<EligibilitySummary> =>
  fetchJson('/eligibility/v1/summary');

export const loadEligibilityCases = (): Promise<EligibilityCase[]> =>
  fetchJson('/eligibility/v1/cases');

export const loadBeneficiaryRegistrySummary = (): Promise<BeneficiaryRegistrySummary> =>
  fetchJson('/beneficiary-registry/v1/summary');

export const submitBeneficiaryLifecycleEvent = (
  event: BeneficiaryLifecycleEvent
): Promise<BeneficiaryLifecycleEventResult> =>
  postJson('/beneficiary-registry/v1/events', event);

export const runEligibilityScreening = (
  demoBeneficiaryId: string,
  screeningRequestId: string
): Promise<{ screening: EligibilityCase['screening']; case: EligibilityCase | null; entitlementPreserved: boolean }> =>
  postJson('/eligibility/v1/screenings', {
    demoBeneficiaryId,
    screeningRequestId,
    checks: ['DEATH', 'ACTIVITY', 'ECONOMIC', 'LAND']
  });

export const performEligibilityAction = (
  caseId: string,
  action: 'notice' | 'verification' | 'recommendation' | 'decision' | 'appeals' | 'reinstate',
  body: Record<string, unknown>
): Promise<EligibilityCase> => postJson(`/eligibility/v1/cases/${encodeURIComponent(caseId)}/${action}`, body);

export const checkEligibilityGate = (
  demoBeneficiaryId: string,
  requestedQtyKg = 1
): Promise<{
  allowed: boolean;
  rcmsStatus: string;
  monthlyEntitlementKg: number;
  alreadyLiftedKg: number;
  availableBalanceKg: number;
  reason: string;
}> => postJson('/eligibility/v1/entitlement-gate', { demoBeneficiaryId, requestedQtyKg });

/** Officer bulk removal of beneficiaries from the active list (fraud/duplicate). */
export const removeBeneficiaries = (
  demoBeneficiaryIds: string[],
  reasonCode: BeneficiaryRemovalReason,
  idempotencyKey: string,
  note?: string
): Promise<BeneficiaryRemovalResponse> =>
  postJson('/eligibility/v1/beneficiaries/removals', {
    idempotencyKey,
    reasonCode,
    demoBeneficiaryIds,
    ...(note ? { note } : {})
  });

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
    case 'duplicate-distribute':
      return distributeWithAuth(request.payload, '/auth/mock-otp');
    case 'supervisor-exception-distribute':
      return distributeWithAuth(request.payload, '/auth/supervisor-exception');
    default:
      throw new Error('Unsupported workflow action');
  }
}

/** Persist the Auth Ledger row before issue so Allocations/Distribution show beneficiary auth. */
const distributeWithAuth = async (
  payload: {
    distributionId: string;
    rationCardHash: string;
    beneficiaryRefHash: string;
    authMode: AuthMode;
    authResult: AuthResult;
    authTxnRefHash: string;
    approvedBy?: string;
    fpsId?: string;
    dealerId?: string;
  },
  authPath: '/auth/mock-otp' | '/auth/supervisor-exception'
) => {
  const authTxnId = `AUTH-${payload.distributionId}`;
  const authBody: Record<string, string> = {
    authTxnId,
    beneficiaryRefHash: payload.beneficiaryRefHash,
    rationCardHash: payload.rationCardHash,
    aadhaarRefHash: payload.beneficiaryRefHash,
    authResult: payload.authResult
  };
  if (authPath === '/auth/supervisor-exception') {
    authBody.approvedBy = payload.approvedBy ?? 'SUPERVISOR-101';
  }
  try {
    await postJson(authPath, authBody);
  } catch (error) {
    // Identical auth replay is acceptable when retrying a failed distribute.
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists|409|conflict/i.test(message)) {
      throw error;
    }
  }
  return postJson('/distributions', withoutCallerControlledFpsIdentity(payload));
};

const withoutCallerControlledFpsIdentity = <T extends { fpsId?: string; dealerId?: string }>(
  payload: T
): Omit<T, 'fpsId' | 'dealerId'> => {
  const serverDerived = { ...payload } as T & { fpsId?: string; dealerId?: string };
  delete serverDerived.fpsId;
  delete serverDerived.dealerId;
  return serverDerived;
};

export const runShortReceiptDemo = async (): Promise<TransferOrder> => {
  await postJson('/transfers', {
    transferId: 'TR-UI-SHORT-001',
    lotId: 'LOT-RICE-2026-001',
    fromOrg: 'GODOWN-S-001',
    toOrg: 'GODOWN-B-001',
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
