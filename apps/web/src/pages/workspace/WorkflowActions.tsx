import { WorkflowActionPanel } from '@/components/WorkflowActionPanel.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function WorkflowActions() {
  const { role, workspace } = useWorkspaceContext();
  return (
    <WorkflowActionPanel
      apiOnline={workspace.apiOnline}
      role={role}
      lots={workspace.lots}
      transfers={workspace.transfers}
      allocations={workspace.allocations}
      authTransactions={workspace.authTransactions}
      entitlements={workspace.entitlements}
      distributions={workspace.distributions}
      alerts={workspace.alerts}
      ledgerEvents={workspace.ledgerEvents}
      onComplete={workspace.refresh}
      onMockComplete={workspace.applyMockResult}
    />
  );
}
