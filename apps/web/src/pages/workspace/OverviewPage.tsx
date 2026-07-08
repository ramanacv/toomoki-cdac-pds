import { buildWorkflowSteps, getRoleProfile } from '@/demo-model.js';
import { roleSummaryCards } from '@/lib/role-summary.js';
import { SummaryCards } from '@/components/SummaryCards.js';
import { WorkflowTimeline } from '@/components/WorkflowTimeline.js';
import { AlertsSummary } from '@/components/AlertsSummary.js';
import { getRoleScreens } from '@/demo-model.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function OverviewPage() {
  const { role, scenario, workspace, liveSummary, visibleAlerts } = useWorkspaceContext();
  const roleProfile = getRoleProfile(role);

  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="eyebrow">ViksitPDS</p>
        <h2 className="text-3xl font-semibold tracking-tight">Overview</h2>
        <p className="mt-1 leading-relaxed text-muted-foreground">{roleProfile.summary}</p>
      </header>
      <SummaryCards cards={roleSummaryCards(role, workspace, liveSummary)} />
      <WorkflowTimeline steps={buildWorkflowSteps(scenario)} />
      <AlertsSummary
        alerts={visibleAlerts}
        canViewAudit={getRoleScreens(role).includes('audit-alerts')}
      />
    </div>
  );
}
