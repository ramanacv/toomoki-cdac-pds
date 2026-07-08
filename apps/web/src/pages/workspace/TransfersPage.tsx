import { TransfersPanel } from '@/components/DataPanels.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function TransfersPage() {
  const { workspace } = useWorkspaceContext();
  return <TransfersPanel transfers={workspace.transfers} lots={workspace.lots} />;
}
