import { useCallback, useEffect, useState } from 'react';
import type { AuditAlert, AuthTransaction, CommodityLot, DashboardSummary, DistributionTransaction, FPSAllocation, MonthlyEntitlement, Stakeholder, TransferOrder } from '@pds/shared-types';
import { buildApiUrl, loadWorkspaceData, probeApi } from './api.js';
import { WorkflowActionPanel } from './WorkflowActionPanel.js';
import {
  demoDistributions,
  demoAllocations,
  demoAuthTransactions,
  demoLots,
  demoEntitlements,
  demoTransfers,
  demoSummaryFallback,
  demoStakeholders,
  DemoRole,
  DemoScreen,
  DemoScenario,
  getDefaultScreen,
  getRoleProfile,
  getRoleScreens,
  getScenarioAlerts,
  getScenarioMetrics,
  getScenarioTagline,
  getScenarioTitle,
  getTraceCards,
  buildWorkflowSteps,
  screenDefinitions,
  roleProfiles
} from './demo-model.js';

const roleOrder: DemoRole[] = ['DEPARTMENT', 'PROCUREMENT', 'GODOWN', 'FPS', 'AUDITOR'];
const scenarioOptions: Array<{ id: DemoScenario; label: string; short: string }> = [
  { id: 'happy-path', label: 'Happy path', short: 'All custody checkpoints clear.' },
  { id: 'short-receipt', label: 'Short receipt', short: 'Receipt mismatch raises alert.' },
  { id: 'duplicate-claim', label: 'Duplicate claim', short: 'Second lift is blocked.' }
];

const summaryCards = (summary: DashboardSummary) => [
  ['Tracked stock', `${summary.trackedStockKg.toLocaleString()} kg`],
  ['Active lots', summary.activeLots.toString()],
  ['Completed distributions', summary.completedDistributions.toString()],
  ['Pending receipts', summary.pendingReceipts.toString()]
];

const alertTone: Record<AuditAlert['riskLevel'], string> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export function App() {
  const [summary, setSummary] = useState<DashboardSummary>(demoSummaryFallback);
  const [authenticated, setAuthenticated] = useState(false);
  const [operatorName, setOperatorName] = useState('Demo Officer');
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(demoStakeholders);
  const [lots, setLots] = useState<CommodityLot[]>(demoLots);
  const [allocations, setAllocations] = useState<FPSAllocation[]>(demoAllocations);
  const [authTransactions, setAuthTransactions] = useState<AuthTransaction[]>(demoAuthTransactions);
  const [entitlements, setEntitlements] = useState<MonthlyEntitlement[]>(demoEntitlements);
  const [distributions, setDistributions] = useState<DistributionTransaction[]>(demoDistributions);
  const [transfers, setTransfers] = useState<TransferOrder[]>(demoTransfers);
  const [alerts, setAlerts] = useState<AuditAlert[]>(getScenarioAlerts('happy-path'));
  const [role, setRole] = useState<DemoRole>('AUDITOR');
  const [scenario, setScenario] = useState<DemoScenario>('happy-path');
  const [screen, setScreen] = useState<DemoScreen>('dashboard');
  const [apiOnline, setApiOnline] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState('LOT-RICE-2026-001');
  const [selectedDistributionId, setSelectedDistributionId] = useState('DIST-2026-001');

  const refreshWorkspace = useCallback(async () => {
    const apiStatus = await probeApi();
    setApiOnline(apiStatus);

    if (!apiStatus) {
      setAlerts(getScenarioAlerts(scenario));
      return;
    }

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
  }, [scenario]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    const allowedScreens = getRoleScreens(role);
    if (!allowedScreens.includes(screen)) {
      setScreen(getDefaultScreen(role));
    }
  }, [role, screen]);

  const workflow = buildWorkflowSteps(scenario);
  const traceCards = getTraceCards(scenario);
  const roleProfile = getRoleProfile(role);
  const scenarioSummary = getScenarioMetrics(scenario);
  const scenarioTitle = getScenarioTitle(scenario);
  const scenarioTagline = getScenarioTagline(scenario);
  const liveSummary = apiOnline ? summary : scenarioSummary;
  const visibleAlerts = apiOnline ? alerts : getScenarioAlerts(scenario);
  const traceLot = lots.find((lot) => lot.lotId === selectedLotId) ?? lots[0];
  const visibleDistribution = distributions.find((item) => item.distributionId === selectedDistributionId) ?? distributions[0];
  const allowedScreens = getRoleScreens(role);
  const activeScreen = allowedScreens.includes(screen) ? screen : getDefaultScreen(role);

  const shell = (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">PDS-Chain MVP control room</p>
          <h1>Trace the ration journey from procurement to household delivery.</h1>
          <p className="lead">
            The demo pairs immutable custody events with privacy-preserving beneficiary receipts, anomaly alerts,
            and role-aware workflow controls for the public distribution system.
          </p>

          <div className="role-row" role="tablist" aria-label="Demo roles">
            {roleOrder.map((candidate) => {
              const active = candidate === role;
              return (
                <button
                  key={candidate}
                  type="button"
                  className={`role-chip ${active ? 'active' : ''}`}
                  onClick={() => setRole(candidate)}
                >
                  {roleProfiles[candidate].title}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="hero-card">
          <div className={`status-dot ${apiOnline ? 'live' : 'demo'}`} />
          <div>
            <p className="eyebrow compact">Runtime</p>
            <strong>{apiOnline ? 'Live API available' : 'Demo fallback active'}</strong>
            <p>{apiOnline ? 'Connected to the backend contract.' : 'Using seeded operational data and local scenario logic.'}</p>
          </div>
        </aside>
      </section>

      <section className="grid">
        {summaryCards(liveSummary).map(([label, value]) => (
          <article key={label} className="card">
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <nav className="screen-nav" aria-label="Demo screens">
        {screenDefinitions.map((definition) => {
          const visible = allowedScreens.includes(definition.id);
          const active = activeScreen === definition.id;
          return (
            <button
              key={definition.id}
              type="button"
              className={`screen-nav-item ${active ? 'active' : ''} ${visible ? '' : 'disabled'}`}
              disabled={!visible}
              onClick={() => setScreen(definition.id)}
            >
              <strong>{definition.label}</strong>
              <span>{definition.description}</span>
            </button>
          );
        })}
      </nav>

      <section className="workspace">
        <article className="panel panel-wide login-banner">
          <div className="panel-heading">
            <div>
              <p className="eyebrow compact">Signed in as</p>
              <h2>{operatorName}</h2>
            </div>
            <div className="login-actions">
              <button type="button" className="secondary" onClick={() => setAuthenticated(false)}>
                Log out
              </button>
              <span className="pill pill-soft">{roleProfile.title}</span>
            </div>
          </div>
          <p className="panel-lead">
            Navigation is role-aware. Use the tabs below to switch between the screens relevant to your role and the
            seeded demo data.
          </p>
        </article>

        {(activeScreen === 'dashboard' || activeScreen === 'transfers' || activeScreen === 'distribution') && (
          <WorkflowActionPanel
            apiOnline={apiOnline}
            role={role}
            lots={lots}
            transfers={transfers}
            allocations={allocations}
            authTransactions={authTransactions}
            distributions={distributions}
            allowDuplicateClaim={scenario === 'duplicate-claim'}
            onComplete={refreshWorkspace}
          />
        )}

        {activeScreen === 'dashboard' && (
          <>
            <article className="panel panel-wide">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow compact">Scenario</p>
                  <h2>{scenarioTitle}</h2>
                </div>
                <span className="pill pill-soft">{roleProfile.title}</span>
              </div>
              <p className="panel-lead">{scenarioTagline}</p>

              <div className="scenario-grid">
                {scenarioOptions.map((option) => {
                  const active = option.id === scenario;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`scenario-card ${active ? 'active' : ''}`}
                      onClick={() => setScenario(option.id)}
                    >
                      <strong>{option.label}</strong>
                      <span>{option.short}</span>
                    </button>
                  );
                })}
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow compact">Workflow</p>
                  <h2>Custody to delivery</h2>
                </div>
                <span className="pill">Audit-visible</span>
              </div>
              <ol className="timeline">
                {workflow.map((step) => (
                  <li key={step.id} className={`timeline-step ${step.state}`}>
                    <div className="timeline-marker" />
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          </>
        )}

        {(activeScreen === 'stakeholders' || activeScreen === 'dashboard') && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow compact">Stakeholders</p>
                <h2>Demo operating network</h2>
              </div>
              <span className="pill pill-soft">{stakeholders.length} parties</span>
            </div>

            <div className="stakeholder-grid">
              {stakeholders.map((stakeholder) => (
                <article key={stakeholder.stakeholderId} className="stakeholder-card">
                  <strong>{stakeholder.name}</strong>
                  <span>{stakeholder.stakeholderType}</span>
                  <p>{stakeholder.district}</p>
                  <code>{stakeholder.stakeholderId}</code>
                </article>
              ))}
            </div>
          </article>
        )}

        {(activeScreen === 'lots' || activeScreen === 'verify' || activeScreen === 'dashboard') && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow compact">Trace explorer</p>
                <h2>Lot and receipt evidence</h2>
              </div>
              <span className="pill pill-soft">{selectedLotId}</span>
            </div>

            <div className="field-row">
              <label>
                Lot ID
                <select value={selectedLotId} onChange={(event) => setSelectedLotId(event.target.value)}>
                  {lots.map((lot) => (
                    <option key={lot.lotId} value={lot.lotId}>
                      {lot.lotId}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Distribution ID
                <select value={selectedDistributionId} onChange={(event) => setSelectedDistributionId(event.target.value)}>
                  {distributions.map((distribution) => (
                    <option key={distribution.distributionId} value={distribution.distributionId}>
                      {distribution.distributionId}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="trace-grid">
              {traceCards.map((card) => (
                <article key={card.title} className={`trace-card ${card.accent}`}>
                  <p>{card.title}</p>
                  <strong>{card.value}</strong>
                  <span>{card.detail}</span>
                </article>
              ))}
            </div>

            <div className="code-row">
              <div>
                <span>Lot trace endpoint</span>
                <code>{buildApiUrl(`/trace/lots/${selectedLotId}`)}</code>
              </div>
              <div>
                <span>Distribution receipt endpoint</span>
                <code>{buildApiUrl(`/distributions/${selectedDistributionId}`)}</code>
              </div>
            </div>

            <div className="trace-footnote">
              <p>
                Selected lot: <strong>{traceLot?.commodity ?? 'Rice'}</strong> in {traceLot?.currentLocation ?? 'Block Godown 01'}.
              </p>
              <p>
                Selected receipt: <strong>{visibleDistribution?.deliveredKg ?? 25} kg</strong> for ration card hash{' '}
                {visibleDistribution?.rationCardHash ?? 'demo-ration-card-hash'}.
              </p>
            </div>
          </article>
        )}

        {(activeScreen === 'transfers' || activeScreen === 'dashboard') && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow compact">Transfers</p>
                <h2>Operational movement log</h2>
              </div>
              <span className="pill pill-soft">{transfers.length} records</span>
            </div>

            <div className="transfer-list">
              {transfers.map((transfer) => (
                <article key={transfer.transferId} className="transfer-card">
                  <div className="alert-topline">
                    <strong>{transfer.transferId}</strong>
                    <span>{transfer.status}</span>
                  </div>
                  <p>
                    {transfer.fromOrg} → {transfer.toOrg}
                  </p>
                  <dl>
                    <div>
                      <dt>Dispatched</dt>
                      <dd>{transfer.dispatchedQtyKg} kg</dd>
                    </div>
                    <div>
                      <dt>Received</dt>
                      <dd>{transfer.receivedQtyKg ?? 'Pending'} kg</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </article>
        )}

        {(activeScreen === 'allocations' || activeScreen === 'dashboard' || activeScreen === 'distribution') && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow compact">Auth ledger</p>
                <h2>Beneficiary authentication</h2>
              </div>
              <span className="pill pill-soft">{authTransactions.length} records</span>
            </div>

            <div className="auth-list">
              {authTransactions.map((auth) => (
                <article key={auth.authTxnId} className="auth-card">
                  <div className="alert-topline">
                    <strong>{auth.authTxnId}</strong>
                    <span>{auth.authResult}</span>
                  </div>
                  <p>{auth.authMode}</p>
                  <dl>
                    <div>
                      <dt>Beneficiary</dt>
                      <dd>{auth.beneficiaryRefHash}</dd>
                    </div>
                    <div>
                      <dt>Auth ref</dt>
                      <dd>{auth.authTxnRefHash}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </article>
        )}

        {(activeScreen === 'allocations' || activeScreen === 'dashboard' || activeScreen === 'distribution') && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow compact">Allocation desk</p>
                <h2>FPS allocation register</h2>
              </div>
              <span className="pill pill-soft">{allocations.length} allocations</span>
            </div>

            <div className="allocation-list">
              {allocations.map((allocation) => (
                <article key={allocation.allocationId} className="allocation-card">
                  <div className="alert-topline">
                    <strong>{allocation.allocationId}</strong>
                    <span>{allocation.status}</span>
                  </div>
                  <p>
                    {allocation.commodity} routed to {allocation.fpsId} from {allocation.sourceGodownId}
                  </p>
                  <dl>
                    <div>
                      <dt>Allocated</dt>
                      <dd>{allocation.allocatedQtyKg} kg</dd>
                    </div>
                    <div>
                      <dt>Received</dt>
                      <dd>{allocation.receivedQtyKg ?? 'Pending'} kg</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </article>
        )}

        {(activeScreen === 'distribution' || activeScreen === 'dashboard') && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow compact">Entitlements</p>
                <h2>Monthly balance ledger</h2>
              </div>
              <span className="pill pill-soft">{entitlements.length} entries</span>
            </div>

            <div className="entitlement-list">
              {entitlements.map((entitlement) => (
                <article key={`${entitlement.rationCardHash}:${entitlement.month}:${entitlement.commodity}`} className="entitlement-card">
                  <div className="alert-topline">
                    <strong>{entitlement.rationCardHash}</strong>
                    <span>{entitlement.month}</span>
                  </div>
                  <p>{entitlement.commodity}</p>
                  <dl>
                    <div>
                      <dt>Monthly quota</dt>
                      <dd>{entitlement.monthlyEntitlementKg} kg</dd>
                    </div>
                    <div>
                      <dt>Balance</dt>
                      <dd>{entitlement.availableBalanceKg} kg</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </article>
        )}

        {(activeScreen === 'distribution' || activeScreen === 'dashboard') && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow compact">Distribution</p>
                <h2>Citizen receipt proof</h2>
              </div>
              <span className="pill pill-soft">{distributions.length} receipts</span>
            </div>

            <div className="alert-list">
              {distributions.map((distribution) => (
                <article key={distribution.distributionId} className="alert-card low">
                  <div className="alert-topline">
                    <strong>{distribution.distributionId}</strong>
                    <span>{distribution.authResult}</span>
                  </div>
                  <p>
                    {distribution.deliveredKg} kg of {distribution.commodity} issued at {distribution.fpsId}
                  </p>
                  <dl>
                    <div>
                      <dt>Auth ref</dt>
                      <dd>{distribution.authTxnRefHash}</dd>
                    </div>
                    <div>
                      <dt>Ledger tx</dt>
                      <dd>{distribution.ledgerTxId ?? 'Pending'}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </article>
        )}

        {(activeScreen === 'audit-alerts' || activeScreen === 'dashboard' || activeScreen === 'verify') && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow compact">Alert inbox</p>
                <h2>Audit signals and evidence</h2>
              </div>
              <span className="pill">{visibleAlerts.length} open</span>
            </div>

            <div className="alert-list">
              {visibleAlerts.map((alert) => (
                <article key={alert.alertId} className={`alert-card ${alertTone[alert.riskLevel]}`}>
                  <div className="alert-topline">
                    <strong>{alert.alertType}</strong>
                    <span>{alert.riskLevel}</span>
                  </div>
                  <p>{alert.message}</p>
                  <dl>
                    <div>
                      <dt>Entity</dt>
                      <dd>{alert.entityId}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{alert.status}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </article>
        )}
      </section>
    </main>
  );

  return authenticated ? shell : (
    <main className="shell auth-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">PDS-Chain MVP login</p>
          <h1>Sign in to the role-aware demo workspace.</h1>
          <p className="lead">
            Use a demo role to open the screens relevant to your job: procurement, godown, FPS, department, or audit.
          </p>
        </div>
        <aside className="hero-card">
          <div className={`status-dot ${apiOnline ? 'live' : 'demo'}`} />
          <div>
            <p className="eyebrow compact">Runtime</p>
            <strong>{apiOnline ? 'Backend reachable' : 'Offline demo mode'}</strong>
            <p>{apiOnline ? 'Live API data will populate the workspace after sign in.' : 'Seeded data will be used after sign in.'}</p>
          </div>
        </aside>
      </section>

      <section className="panel login-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow compact">Operator</p>
            <h2>Choose a role to continue</h2>
          </div>
          <span className="pill pill-soft">{roleProfile.title}</span>
        </div>

        <div className="field-row">
          <label>
            Operator name
            <input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as DemoRole)}>
              {roleOrder.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {roleProfiles[candidate].title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="scenario-grid">
          {getRoleScreens(role).map((screenId) => {
            const definition = screenDefinitions.find((item) => item.id === screenId)!;
            return (
              <article key={screenId} className="scenario-card">
                <strong>{definition.label}</strong>
                <span>{definition.description}</span>
              </article>
            );
          })}
        </div>

        <div className="login-actions">
          <button type="button" className="primary" onClick={() => setAuthenticated(true)}>
            Enter demo workspace
          </button>
        </div>
      </section>
    </main>
  );
}
