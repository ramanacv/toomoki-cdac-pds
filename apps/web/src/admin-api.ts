import type { AuditAlert, DashboardSummary, LedgerEvent } from '@pds/shared-types';
import { buildApiUrl } from './api.js';

const ADMIN_TOKEN_STORAGE_KEY = 'pds_admin_token';

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
    }>;
  };
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
    fabricOrgMapping: Array<{ orgName: string; role: string; mspId: string }>;
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
  health: AdminHealthCheck[];
  links: Record<string, string>;
};

export const getStoredAdminToken = (): string => {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_ADMIN_TOKEN ?? '';
  }
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? import.meta.env.VITE_ADMIN_TOKEN ?? '';
};

export const setStoredAdminToken = (token: string): void => {
  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
};

const adminHeaders = (): HeadersInit => {
  const token = getStoredAdminToken();
  return token ? { 'X-Admin-Token': token } : {};
};

async function fetchAdminJson<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), { headers: adminHeaders() });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Admin request failed for ${path}`);
  }
  return (await response.json()) as T;
}

export const loadAdminOverview = (): Promise<AdminOverview> => fetchAdminJson('/admin/overview');

export const loadAdminNetwork = (): Promise<AdminNetworkInfo> => fetchAdminJson('/admin/network');

export const loadAdminActivity = (): Promise<AdminOverview['activity']> => fetchAdminJson('/admin/activity');

export const loadAdminStakeholderSummary = (): Promise<AdminOverview['stakeholders']> =>
  fetchAdminJson('/admin/stakeholders/summary');
