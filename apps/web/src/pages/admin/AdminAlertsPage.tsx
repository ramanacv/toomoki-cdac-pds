import type { AuditAlert } from '@pds/shared-types';
import { Panel } from '@/components/Panel.js';
import { CardTopline, DefinitionList, EntityCard } from '@/components/Entity.js';
import { AdminStateGate } from '@/pages/admin/AdminStateGate.js';

const alertTone: Record<AuditAlert['riskLevel'], 'low' | 'medium' | 'high'> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export function AdminAlertsPage() {
  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="eyebrow">ViksitPDS</p>
        <h2 className="text-3xl font-semibold tracking-tight">Audit alerts</h2>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          Open risk signals raised across the network, most recent first.
        </p>
      </header>

      <AdminStateGate>
        {(overview) => (
          <Panel eyebrow="Audit alerts" title="Open signals" pill={`${overview.auditAlerts.open} open`} wide>
            <div className="grid gap-3 md:grid-cols-2">
              {overview.auditAlerts.recent.map((alert) => (
                <EntityCard key={alert.alertId} tone={alertTone[alert.riskLevel]}>
                  <CardTopline left={alert.alertType} right={alert.riskLevel} tone={alertTone[alert.riskLevel]} />
                  <p className="text-muted-foreground">{alert.message}</p>
                  <DefinitionList
                    entries={[
                      { label: 'Entity', value: alert.entityId },
                      { label: 'Status', value: alert.status }
                    ]}
                  />
                </EntityCard>
              ))}
            </div>
          </Panel>
        )}
      </AdminStateGate>
    </div>
  );
}
