import { AlertsPanel } from '@/components/DataPanels.js';
import { getRoleQueue } from '@/workflow-actions.js';
import { WorkflowActions } from '@/pages/workspace/WorkflowActions.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function AuditAlertsPage() {
  const { role, workspace, visibleAlerts } = useWorkspaceContext();

  // The auditor's only action is the duplicate-claim probe; surface it here
  // (auditors have no workbench) and only while it is actually runnable.
  const auditorQueue =
    role === 'AUDITOR'
      ? getRoleQueue(
          {
            lots: workspace.lots,
            transfers: workspace.transfers,
            allocations: workspace.allocations,
            authTransactions: workspace.authTransactions,
            distributions: workspace.distributions,
            entitlements: workspace.entitlements,
            alerts: workspace.alerts,
            ledgerEvents: workspace.ledgerEvents
          },
          role
        )
      : [];

  return (
    <div className="grid gap-4">
      {auditorQueue.length > 0 && <WorkflowActions />}
      <AlertsPanel alerts={visibleAlerts} />
    </div>
  );
}
