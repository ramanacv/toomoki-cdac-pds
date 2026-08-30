import type { AuditAlert, DashboardSummary, LedgerEvent, LedgerProofSummaryResponse } from '@pds/shared-types';
import { buildApiUrl } from './api.js';
import { authHeaders } from './auth-token.js';

export type AdminHealthCheck = {
  name: string;
  status: 'ok' | 'degraded' | 'unavailable';
  detail: string;
};

export type AdminNetworkInfo = {
  ledgerMode: 'demo' | 'fabric';
  persistenceBackend: 'file' | 'postgres';
  legacyBackendMode: string;
  demo?: {
    inProcessChaincode: boolean;
    worldStateSummary: Record<string, number>;
    statePath: string;
    journalPath: string;
    chaincodeStatePath: string;
  };
  fabric?: {
    network: string;
    channel: string;
    chaincode: string;
    clientOrg: string;
    mspId: string;
    peerEndpoint: string;
    peerHostAlias: string;
    connectionProfilePath: string;
    connectivity: 'ok' | 'unavailable' | 'not_checked';
    connectivityDetail: string;
    organizations: Array<{
      name: string;
      mspId: string;
      role: string;
      peerHost: string;
      peerPort: number;
      deploymentStatus: 'DEPLOYED' | 'PLANNED';
    }>;
  };
};

export type AdminStockPosition = {
  entityId: string;
  commodity: string;
  quantityKg: number;
};

export type AdminEntitlementSummary = {
  totalMonthlyEntitlementKg: number;
  totalLiftedKg: number;
  totalAvailableKg: number;
  utilizationPct: number;
  activeCount: number;
  recordCount: number;
};

export type AdminMetrics = {
  stakeholders: number;
  lots: number;
  transfers: number;
  allocations: number;
  entitlements: number;
  authTransactions: number;
  distributions: number;
  auditAlerts: number;
  openAuditAlerts: number;
  ledgerEvents: number;
};

export type AdminOverview = {
  generatedAt: string;
  readOnly: true;
  dashboard: DashboardSummary;
  metrics: AdminMetrics;
  network: AdminNetworkInfo;
  stakeholders: {
    byType: Array<{ stakeholderType: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    fabricOrgMapping: Array<{
      orgName: string;
      role: string;
      mspId: string;
      deploymentStatus: 'DEPLOYED' | 'PLANNED';
    }>;
  };
  activity: {
    recentEvents: LedgerEvent[];
    eventCount: number;
  };
  auditAlerts: {
    total: number;
    open: number;
    byRiskLevel: Record<string, number>;
    recent: AuditAlert[];
  };
  stock: AdminStockPosition[];
  entitlementSummary: AdminEntitlementSummary;
  health: AdminHealthCheck[];
  links: Record<string, string>;
  proofSummary?: LedgerProofSummaryResponse;
};

export type AdminResetResult = {
  ledgerTxId: string;
  message: string;
  seriesId: string;
  lots: Array<{ lotId: string; commodity: string; quantityKg: number }>;
};

async function fetchAdminJson<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), { headers: authHeaders() });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Admin request failed for ${path}`);
  }
  return (await response.json()) as T;
}

async function postAdminJson<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Admin request failed for ${path}`);
  }
  return (await response.json()) as T;
}

export const loadAdminOverview = async (): Promise<AdminOverview> => {
  const [overview, proofSummary] = await Promise.all([
    fetchAdminJson<AdminOverview>('/admin/overview'),
    fetchAdminJson<LedgerProofSummaryResponse>('/admin/proofs/summary')
  ]);
  return { ...overview, proofSummary };
};

export const loadAdminNetwork = (): Promise<AdminNetworkInfo> => fetchAdminJson('/admin/network');

export const loadAdminActivity = (): Promise<AdminOverview['activity']> => fetchAdminJson('/admin/activity');

export const loadAdminStakeholderSummary = (): Promise<AdminOverview['stakeholders']> =>
  fetchAdminJson('/admin/stakeholders/summary');

export const resetAdminLedger = (commodity?: string): Promise<AdminResetResult> =>
  postAdminJson('/admin/reset', commodity ? { commodity } : undefined);
