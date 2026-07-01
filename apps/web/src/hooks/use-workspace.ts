import { useCallback, useEffect, useState } from 'react';
import type {
  AuditAlert,
  AuthTransaction,
  CommodityLot,
  DashboardSummary,
  DistributionTransaction,
  FPSAllocation,
  MonthlyEntitlement,
  Stakeholder,
  LedgerEvent,
  TransferOrder
} from '@pds/shared-types';
import { loadWorkspaceData, probeApi } from '@/api.js';
import type { DemoScenario } from '@/demo-model.js';
import {
  demoAllocations,
  demoAuthTransactions,
  demoDistributions,
  demoEntitlements,
  demoLots,
  demoStakeholders,
  demoSummaryFallback,
  demoTransfers,
  getScenarioAlerts,
  getScenarioMetrics
} from '@/demo-model.js';

export type WorkspaceState = {
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
  apiOnline: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  applyMockResult: (result: {
    context: {
      lots: CommodityLot[];
      transfers: TransferOrder[];
      allocations: FPSAllocation[];
      authTransactions: AuthTransaction[];
      entitlements?: MonthlyEntitlement[];
      distributions: DistributionTransaction[];
      alerts: AuditAlert[];
      ledgerEvents: LedgerEvent[];
    };
  }) => void;
};

export function useWorkspace(scenario: DemoScenario): WorkspaceState {
  const [summary, setSummary] = useState<DashboardSummary>(demoSummaryFallback);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(demoStakeholders);
  const [lots, setLots] = useState<CommodityLot[]>(demoLots);
  const [allocations, setAllocations] = useState<FPSAllocation[]>(demoAllocations);
  const [authTransactions, setAuthTransactions] = useState<AuthTransaction[]>(demoAuthTransactions);
  const [entitlements, setEntitlements] = useState<MonthlyEntitlement[]>(demoEntitlements);
  const [distributions, setDistributions] = useState<DistributionTransaction[]>(demoDistributions);
  const [transfers, setTransfers] = useState<TransferOrder[]>(demoTransfers);
  const [alerts, setAlerts] = useState<AuditAlert[]>(getScenarioAlerts(scenario));
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);
  const [apiOnline, setApiOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const apiStatus = await probeApi();
    setApiOnline(apiStatus);

    const workspace = await loadWorkspaceData(scenario);
    setSummary(workspace.summary);
    setStakeholders(workspace.stakeholders);
    setLots(workspace.lots);
    setTransfers(workspace.transfers);
    setAllocations(workspace.allocations);
    setAuthTransactions(workspace.authTransactions);
    setEntitlements(workspace.entitlements);
    setDistributions(workspace.distributions);
    setAlerts(workspace.alerts);
    setLedgerEvents(workspace.ledgerEvents ?? []);
    setLoading(false);
  }, [scenario]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyMockResult: WorkspaceState['applyMockResult'] = useCallback((result) => {
    setLots(result.context.lots);
    setTransfers(result.context.transfers);
    setAllocations(result.context.allocations);
    setAuthTransactions(result.context.authTransactions);
    setEntitlements(result.context.entitlements ?? entitlements);
    setDistributions(result.context.distributions);
    setAlerts(result.context.alerts);
    setLedgerEvents(result.context.ledgerEvents);
  }, [entitlements]);

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
    apiOnline,
    loading,
    refresh,
    applyMockResult
  };
}

export function useLiveScenarioView(
  scenario: DemoScenario,
  workspace: Pick<WorkspaceState, 'apiOnline' | 'summary' | 'alerts'>
) {
  const liveSummary = workspace.apiOnline ? workspace.summary : getScenarioMetrics(scenario);
  const visibleAlerts = workspace.apiOnline ? workspace.alerts : getScenarioAlerts(scenario);
  return { liveSummary, visibleAlerts };
}
