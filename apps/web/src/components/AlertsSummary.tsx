import { Link, useLocation } from 'react-router-dom';
import type { AuditAlert } from '@pds/shared-types';
import { Panel } from '@/components/Panel';
import { Badge } from '@/components/ui/badge';
import { screenPath } from '@/lib/screen-routes.js';

type AlertsSummaryProps = {
  alerts: AuditAlert[];
  canViewAudit: boolean;
};

const riskVariant: Record<AuditAlert['riskLevel'], 'secondary' | 'destructive'> = {
  LOW: 'secondary',
  MEDIUM: 'secondary',
  HIGH: 'destructive'
};

export function AlertsSummary({ alerts, canViewAudit }: AlertsSummaryProps) {
  const { search } = useLocation();
  const topAlerts = alerts.slice(0, 3);

  return (
    <Panel eyebrow="Alert inbox" title="Open alerts" pill={`${alerts.length}`}>
      {topAlerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open alerts.</p>
      ) : (
        <ul className="grid gap-2">
          {topAlerts.map((alert) => (
            <li
              key={alert.alertId}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3"
            >
              <strong className="text-sm">{alert.alertType}</strong>
              <Badge variant={riskVariant[alert.riskLevel]}>{alert.riskLevel}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {alert.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canViewAudit && alerts.length > 0 && (
        <Link
          to={screenPath('audit-alerts', search)}
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          View all {alerts.length} alert{alerts.length === 1 ? '' : 's'} →
        </Link>
      )}
    </Panel>
  );
}
