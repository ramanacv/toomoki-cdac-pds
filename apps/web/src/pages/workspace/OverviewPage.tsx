import { buildWorkflowSteps, getRoleProfile } from '@/demo-model.js';
import { roleSummaryCards } from '@/lib/role-summary.js';
import { SummaryCards } from '@/components/SummaryCards.js';
import { WorkflowTimeline } from '@/components/WorkflowTimeline.js';
import { AlertsSummary } from '@/components/AlertsSummary.js';
import { getRoleScreens } from '@/demo-model.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';
import { getCurrentIdentity } from '@/auth-token.js';
import { Panel } from '@/components/Panel.js';

export function OverviewPage() {
  const { role, scenario, workspace, liveSummary, visibleAlerts } = useWorkspaceContext();
  const roleProfile = getRoleProfile(role);
  const identity = getCurrentIdentity();
  const fpsId = identity?.stakeholderId ?? (role === 'FPS' ? 'FPS-101' : undefined);
  const fpsAllocations = fpsId ? workspace.allocations.filter((item) => item.fpsId === fpsId) : [];
  const fpsDistributions = fpsId ? workspace.distributions.filter((item) => item.fpsId === fpsId) : [];

  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="eyebrow">ViksitPDS</p>
        <h2 className="text-3xl font-semibold tracking-tight">Overview</h2>
        <p className="mt-1 leading-relaxed text-muted-foreground">{roleProfile.summary}</p>
      </header>
      <SummaryCards cards={roleSummaryCards(role, workspace, liveSummary)} />
      {role === 'FPS' && (
        <Panel eyebrow="Assigned-shop security boundary" title={fpsId ?? 'No active FPS assignment'} pill="Controlled PoC">
          <p className="text-sm text-muted-foreground">
            Simulated device mapping: ACTIVE. In a state deployment, shop/device-bound authentication and ration issue
            remain in the authorized AePDS/ePoS system; ViksitPDS consumes the resulting non-sensitive event.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Pending receipts</dt><dd className="font-semibold">{fpsAllocations.filter((item) => item.status === 'ALLOCATED').length}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Recent simulated distributions</dt><dd className="font-semibold">{fpsDistributions.length}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Reconciliation exceptions</dt><dd className="font-semibold">{visibleAlerts.filter((item) => item.entityId === fpsId || fpsAllocations.some((allocation) => allocation.allocationId === item.entityId)).length}</dd></div>
          </dl>
        </Panel>
      )}
      <WorkflowTimeline steps={buildWorkflowSteps(scenario)} />
      <AlertsSummary
        alerts={visibleAlerts}
        canViewAudit={getRoleScreens(role).includes('audit-alerts')}
      />
    </div>
  );
}
