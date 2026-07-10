import { AllocationPanel, AuthLedgerPanel } from '@/components/DataPanels.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function AllocationsPage() {
  const { workspace } = useWorkspaceContext();
  return (
    <div className="grid gap-4">
      <AuthLedgerPanel authTransactions={workspace.authTransactions} />
      <AllocationPanel allocations={workspace.allocations} />
    </div>
  );
}
