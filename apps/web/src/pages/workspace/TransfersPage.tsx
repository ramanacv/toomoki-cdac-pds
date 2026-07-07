import { TransfersPanel } from '@/components/DataPanels.js';
import { WorkflowActions } from '@/pages/workspace/WorkflowActions.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function TransfersPage() {
  const { workspace } = useWorkspaceContext();
  return (
    <div className="grid gap-4">
      <WorkflowActions />
      <TransfersPanel transfers={workspace.transfers} />
    </div>
  );
}
