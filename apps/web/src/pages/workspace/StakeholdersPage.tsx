import { StakeholdersPanel } from '@/components/DataPanels.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function StakeholdersPage() {
  const { workspace } = useWorkspaceContext();
  return <StakeholdersPanel stakeholders={workspace.stakeholders} />;
}
