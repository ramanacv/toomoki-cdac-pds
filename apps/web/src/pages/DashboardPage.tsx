import { useEffect, useState } from 'react';
import type { DemoRole, DemoScreen, DemoScenario } from '@/demo-model.js';
import {
  buildWorkflowSteps,
  getDefaultScreen,
  getRoleProfile,
  getRoleScreens,
  getScenarioTagline,
  getScenarioTitle,
  getTraceCards
} from '@/demo-model.js';
import { useWorkspace, useLiveScenarioView } from '@/hooks/use-workspace.js';
import { summaryCardData } from '@/lib/constants.js';
import { RoleTabs } from '@/components/RoleTabs.js';
import { RuntimeCard } from '@/components/RuntimeCard.js';
import { SummaryCards } from '@/components/SummaryCards.js';
import { ScreenNav } from '@/components/ScreenNav.js';
import { LoginBanner } from '@/components/LoginBanner.js';
import { ScenarioSelector } from '@/components/ScenarioSelector.js';
import { WorkflowTimeline } from '@/components/WorkflowTimeline.js';
import { TraceExplorer } from '@/components/TraceExplorer.js';
import { WorkflowActionPanel } from '@/components/WorkflowActionPanel.js';
import {
  AlertsPanel,
  AllocationPanel,
  AuthLedgerPanel,
  DistributionPanel,
  EntitlementsPanel,
  StakeholdersPanel,
  TransfersPanel
} from '@/components/DataPanels.js';

type DashboardPageProps = {
  initialRole: DemoRole;
  initialScenario: DemoScenario;
  operatorName: string;
  onLogout: () => void;
  adminHref: string;
};

export function DashboardPage({
  initialRole,
  initialScenario,
  operatorName,
  onLogout,
  adminHref
}: DashboardPageProps) {
  const [role, setRole] = useState<DemoRole>(initialRole);
  const [scenario, setScenario] = useState<DemoScenario>(initialScenario);
  const [screen, setScreen] = useState<DemoScreen>('dashboard');
  const [selectedLotId, setSelectedLotId] = useState('LOT-RICE-2026-001');
  const [selectedDistributionId, setSelectedDistributionId] = useState('DIST-2026-001');

  const workspace = useWorkspace(scenario);
  const { apiOnline } = workspace;
  const { liveSummary, visibleAlerts } = useLiveScenarioView(scenario, workspace);

  useEffect(() => {
    const allowedScreens = getRoleScreens(role);
    if (!allowedScreens.includes(screen)) {
      setScreen(getDefaultScreen(role));
    }
  }, [role, screen]);

  const workflow = buildWorkflowSteps(scenario);
  const traceCards = getTraceCards(scenario);
  const roleProfile = getRoleProfile(role);
  const scenarioTitle = getScenarioTitle(scenario);
  const scenarioTagline = getScenarioTagline(scenario);

  const allowedScreens = getRoleScreens(role);
  const activeScreen = allowedScreens.includes(screen) ? screen : getDefaultScreen(role);

  return (
    <main id="main" className="mx-auto w-full max-w-[1240px] px-4 py-10">
      <section className="mb-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
        <div className="surface-blur relative overflow-hidden rounded-3xl p-8">
          <p className="eyebrow">PDS-Chain MVP control room</p>
          <h1 className="max-w-[13ch] text-4xl font-semibold leading-[0.95] tracking-tight md:text-5xl">
            Trace the ration journey from procurement to household delivery.
          </h1>
          <p className="mt-4 max-w-[66ch] leading-relaxed text-muted-foreground">
            The demo pairs immutable custody events with privacy-preserving beneficiary receipts,
            anomaly alerts, and role-aware workflow controls for the public distribution system.
          </p>
          <RoleTabs role={role} onChange={setRole} />
        </div>
        <RuntimeCard
          apiOnline={apiOnline}
          title="Runtime"
          onlineLabel="Live API available"
          offlineLabel="Demo fallback active"
          onlineDetail="Connected to the backend contract."
          offlineDetail="Using seeded operational data and local scenario logic."
        />
      </section>

      <SummaryCards cards={summaryCardData(liveSummary)} />

      <ScreenNav role={role} activeScreen={activeScreen} onSelect={setScreen} />

      <section className="grid gap-4">
        <LoginBanner
          operatorName={operatorName}
          roleTitle={roleProfile.title}
          onLogout={onLogout}
          adminHref={adminHref}
        />

        {(activeScreen === 'workbench' ||
          activeScreen === 'dashboard' ||
          activeScreen === 'transfers' ||
          activeScreen === 'distribution') && (
          <WorkflowActionPanel
            apiOnline={apiOnline}
            role={role}
            lots={workspace.lots}
            transfers={workspace.transfers}
            allocations={workspace.allocations}
            authTransactions={workspace.authTransactions}
            distributions={workspace.distributions}
            alerts={workspace.alerts}
            ledgerEvents={workspace.ledgerEvents}
            onComplete={workspace.refresh}
            onMockComplete={workspace.applyMockResult}
          />
        )}

        {activeScreen === 'dashboard' && (
          <>
            <ScenarioSelector
              scenario={scenario}
              scenarioTitle={scenarioTitle}
              scenarioTagline={scenarioTagline}
              roleTitle={roleProfile.title}
              apiOnline={apiOnline}
              onChange={setScenario}
            />
            <WorkflowTimeline steps={workflow} />
          </>
        )}

        {(activeScreen === 'stakeholders' || activeScreen === 'dashboard') && (
          <StakeholdersPanel stakeholders={workspace.stakeholders} />
        )}

        {(activeScreen === 'lots' || activeScreen === 'verify' || activeScreen === 'dashboard') && (
          <TraceExplorer
            lots={workspace.lots}
            transfers={workspace.transfers}
            distributions={workspace.distributions}
            traceCards={traceCards}
            selectedLotId={selectedLotId}
            selectedDistributionId={selectedDistributionId}
            onLotChange={setSelectedLotId}
            onDistributionChange={setSelectedDistributionId}
          />
        )}

        {(activeScreen === 'transfers' || activeScreen === 'dashboard') && (
          <TransfersPanel transfers={workspace.transfers} />
        )}

        {(activeScreen === 'allocations' ||
          activeScreen === 'dashboard' ||
          activeScreen === 'distribution') && (
          <AuthLedgerPanel authTransactions={workspace.authTransactions} />
        )}

        {(activeScreen === 'allocations' ||
          activeScreen === 'dashboard' ||
          activeScreen === 'distribution') && (
          <AllocationPanel allocations={workspace.allocations} />
        )}

        {(activeScreen === 'distribution' || activeScreen === 'dashboard') && (
          <EntitlementsPanel entitlements={workspace.entitlements} />
        )}

        {(activeScreen === 'distribution' || activeScreen === 'dashboard') && (
          <DistributionPanel distributions={workspace.distributions} />
        )}

        {(activeScreen === 'audit-alerts' ||
          activeScreen === 'dashboard' ||
          activeScreen === 'verify') && <AlertsPanel alerts={visibleAlerts} />}
      </section>
    </main>
  );
}
