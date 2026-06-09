import type { AuditAlert, AuthTransaction, CommodityLot, DashboardSummary, DistributionTransaction, FPSAllocation, MonthlyEntitlement, Stakeholder, TransferOrder } from '@pds/shared-types';
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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
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

export function buildApiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}
