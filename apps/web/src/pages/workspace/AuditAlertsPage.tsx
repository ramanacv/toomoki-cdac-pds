import { AlertsPanel } from '@/components/DataPanels.js';
import { useWorkspaceContext } from '@/hooks/use-workspace-context.js';

export function AuditAlertsPage() {
  const { visibleAlerts } = useWorkspaceContext();
  return <AlertsPanel alerts={visibleAlerts} />;
}
