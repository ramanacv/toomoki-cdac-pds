import { WorkflowActionPanel } from '@/components/WorkflowActionPanel.js';
import { useAssignedFpsId } from '@/hooks/use-assigned-fps-id.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function WorkflowActions() {
  const { role, workspace } = useWorkspaceContext();
  const fpsId = useAssignedFpsId(role, workspace.apiOnline);
  return (
    <WorkflowActionPanel
      apiOnline={workspace.apiOnline}
      ledgerMode={workspace.ledgerMode}
      role={role}
      lots={workspace.lots}
      transfers={workspace.transfers}
      allocations={workspace.allocations}
      authTransactions={workspace.authTransactions}
      entitlements={workspace.entitlements}
      distributions={workspace.distributions}
      alerts={workspace.alerts}
      ledgerEvents={workspace.ledgerEvents}
      stockPositions={workspace.stockPositions}
      {...(fpsId ? { fpsId } : {})}
      onComplete={workspace.refresh}
      onMockComplete={workspace.applyMockResult}
    />
  );
}
