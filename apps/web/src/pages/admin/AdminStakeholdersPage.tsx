import { Panel } from '@/components/Panel.js';
import { EntityCard } from '@/components/Entity.js';
import { AdminStateGate } from '@/pages/admin/AdminStateGate.js';

export function AdminStakeholdersPage() {
  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="eyebrow">ViksitPDS</p>
        <h2 className="text-3xl font-semibold tracking-tight">Stakeholders</h2>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          Org type and status breakdown across registered PDS actors.
        </p>
      </header>

      <AdminStateGate>
        {(overview) => (
          <>
            <Panel eyebrow="Stakeholders" title="Org and role breakdown">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                {overview.stakeholders.byType.map((entry) => (
                  <EntityCard key={entry.stakeholderType} className="space-y-1">
                    <strong className="block">{entry.stakeholderType}</strong>
                    <span className="text-sm text-muted-foreground">{entry.count} registered</span>
                  </EntityCard>
                ))}
              </div>
            </Panel>

            <Panel eyebrow="Stakeholders" title="Status breakdown">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                {overview.stakeholders.byStatus.map((entry) => (
                  <EntityCard key={entry.status} className="space-y-1">
                    <strong className="block">{entry.status}</strong>
                    <span className="text-sm text-muted-foreground">{entry.count} stakeholders</span>
                  </EntityCard>
                ))}
              </div>
            </Panel>
          </>
        )}
      </AdminStateGate>
    </div>
  );
}
