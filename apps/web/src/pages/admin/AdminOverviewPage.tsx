import type { AdminOverview } from '@/admin-api.js';
import { RuntimeCard } from '@/components/RuntimeCard.js';
import { useAdminContext } from '@/hooks/use-admin-context.js';
import { AdminStateGate } from '@/pages/admin/AdminStateGate.js';

const metricCards = (overview: AdminOverview): Array<[string, string]> => [
  ['Stakeholders', overview.metrics.stakeholders.toString()],
  ['Lots', overview.metrics.lots.toString()],
  ['Transfers', overview.metrics.transfers.toString()],
  ['Distributions', overview.metrics.distributions.toString()],
  ['Ledger events', overview.metrics.ledgerEvents.toString()],
  ['Open alerts', overview.metrics.openAuditAlerts.toString()]
];

export function AdminOverviewPage() {
  const { overview, apiOnline } = useAdminContext();

  return (
    <div className="grid gap-4">
      <section className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
        <div className="surface-blur rounded-3xl p-8">
          <p className="eyebrow">ViksitPDS operator console</p>
          <h2 className="text-3xl font-semibold tracking-tight">
            Monitor ledger health, network status, and recent activity.
          </h2>
          <p className="mt-4 max-w-[66ch] leading-relaxed text-muted-foreground">
            Admin view for demo and Fabric deployments, with test-data controls for topping up
            stock and resetting the ledger. Protected endpoints require an admin token when
            configured on the API.
          </p>
        </div>
        <RuntimeCard
          apiOnline={apiOnline}
          title="Runtime"
          onlineLabel="API connected"
          offlineLabel="API offline"
          onlineDetail={overview ? `Ledger mode: ${overview.network.ledgerMode}` : 'Waiting for admin overview'}
          offlineDetail={overview ? `Ledger mode: ${overview.network.ledgerMode}` : 'Waiting for admin overview'}
        />
      </section>

      <AdminStateGate>
        {(loaded) => (
          <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6" aria-label="Admin metrics">
            {metricCards(loaded).map(([label, value]) => (
              <div key={label} className="surface-blur rounded-3xl p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <strong className="mt-2 block text-3xl font-semibold tracking-tight">{value}</strong>
              </div>
            ))}
          </section>
        )}
      </AdminStateGate>
    </div>
  );
}
