import type { AuditAlert, DashboardSummary, LedgerEvent } from '@pds/shared-types';

export type AdminHealthCheck = {
  name: string;
  status: 'ok' | 'degraded' | 'unavailable';
  detail: string;
};

export type AdminFabricOrg = {
  name: string;
  mspId: string;
  role: string;
  peerHost: string;
  peerPort: number;
};

export type AdminNetworkInfo = {
  ledgerMode: 'demo' | 'fabric';
  persistenceBackend: 'file' | 'postgres';
  legacyBackendMode: string;
  demo?: {
    inProcessChaincode: boolean;
    worldStateSummary: {
      stakeholders: number;
      lots: number;
      transfers: number;
      allocations: number;
      distributions: number;
      events: number;
      stockPositions: number;
    };
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
    organizations: AdminFabricOrg[];
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

export type AdminStakeholderSummary = {
  byType: Array<{ stakeholderType: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  fabricOrgMapping: Array<{ orgName: string; role: string; mspId: string }>;
};

export type AdminActivityFeed = {
  recentEvents: LedgerEvent[];
  eventCount: number;
};

export type AdminOverview = {
  generatedAt: string;
  readOnly: true;
  dashboard: DashboardSummary;
  metrics: AdminMetrics;
  network: AdminNetworkInfo;
  stakeholders: AdminStakeholderSummary;
  activity: AdminActivityFeed;
  auditAlerts: {
    total: number;
    open: number;
    byRiskLevel: Record<string, number>;
    recent: AuditAlert[];
  };
  health: AdminHealthCheck[];
  links: {
    health: string;
    openapi: string;
    traceExample: string;
    auditAlerts: string;
  };
};
