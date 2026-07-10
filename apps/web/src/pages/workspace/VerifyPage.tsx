import { AlertsPanel } from '@/components/DataPanels.js';
import { TraceSection } from '@/components/TraceSection.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function VerifyPage() {
  const { visibleAlerts } = useWorkspaceContext();
  return (
    <div className="grid gap-4">
      <TraceSection />
      <AlertsPanel alerts={visibleAlerts} />
    </div>
  );
}
