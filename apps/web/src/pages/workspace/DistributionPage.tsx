import {
  AllocationPanel,
  AuthLedgerPanel,
  DistributionPanel,
  EntitlementsPanel
} from '@/components/DataPanels.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function DistributionPage() {
  const { workspace } = useWorkspaceContext();
  return (
    <div className="grid gap-4">
      <AuthLedgerPanel authTransactions={workspace.authTransactions} />
      <AllocationPanel allocations={workspace.allocations} />
      <EntitlementsPanel entitlements={workspace.entitlements} />
      <DistributionPanel distributions={workspace.distributions} />
    </div>
  );
}
