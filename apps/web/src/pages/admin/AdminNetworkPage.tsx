import { Panel } from '@/components/Panel.js';
import { cn } from '@/lib/utils.js';
import { AdminStateGate } from '@/pages/admin/AdminStateGate.js';

const healthTone: Record<string, string> = {
  ok: 'status-dot-live',
  degraded: 'status-dot-demo',
  unavailable: 'status-dot-offline'
};

export function AdminNetworkPage() {
  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="eyebrow"><span className="brand-name">ViksitPDS</span></p>
        <h2 className="text-3xl font-semibold tracking-tight">Network &amp; health</h2>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          Ledger mode, persistence backend, and subsystem checks for the running deployment.
        </p>
      </header>

      <AdminStateGate>
        {(overview) => (
          <>
            <Panel eyebrow="Network" title="Ledger and persistence" pill={overview.network.ledgerMode}>
              <dl className="grid gap-3">
                <div className="grid gap-1">
                  <dt className="text-sm uppercase tracking-wide text-muted-foreground">Persistence</dt>
                  <dd>{overview.network.persistenceBackend}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-sm uppercase tracking-wide text-muted-foreground">Backend mode</dt>
                  <dd>{overview.network.legacyBackendMode}</dd>
                </div>
                {overview.network.demo && (
                  <>
                    <div className="grid gap-1">
                      <dt className="text-sm uppercase tracking-wide text-muted-foreground">
                        In-process chaincode
                      </dt>
                      <dd>{overview.network.demo.inProcessChaincode ? 'Yes' : 'No'}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-sm uppercase tracking-wide text-muted-foreground">
                        Journal path
                      </dt>
                      <dd>
                        <code>{overview.network.demo.journalPath}</code>
                      </dd>
                    </div>
                  </>
                )}
                {overview.network.fabric && (
                  <>
                    <div className="grid gap-1">
                      <dt className="text-sm uppercase tracking-wide text-muted-foreground">Channel</dt>
                      <dd>{overview.network.fabric.channel}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-sm uppercase tracking-wide text-muted-foreground">Chaincode</dt>
                      <dd>{overview.network.fabric.chaincode}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-sm uppercase tracking-wide text-muted-foreground">Client org</dt>
                      <dd>{overview.network.fabric.clientOrg}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-sm uppercase tracking-wide text-muted-foreground">Peer</dt>
                      <dd>{overview.network.fabric.peerEndpoint}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-sm uppercase tracking-wide text-muted-foreground">
                        Connectivity
                      </dt>
                      <dd>{overview.network.fabric.connectivityDetail}</dd>
                    </div>
                  </>
                )}
              </dl>
            </Panel>

            <Panel eyebrow="Health" title="Subsystem checks">
              <div className="grid gap-3">
                {overview.health.map((check) => (
                  <article key={check.name} className="rounded-3xl border border-border bg-card/55 p-4">
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <strong>{check.name}</strong>
                      <span
                        className={cn('status-dot inline-block h-2.5 w-2.5', healthTone[check.status] ?? 'status-dot-demo')}
                      />
                    </div>
                    <p className="text-muted-foreground">{check.detail}</p>
                  </article>
                ))}
              </div>
            </Panel>

            {overview.stakeholders.fabricOrgMapping.length > 0 && (
              <Panel
                eyebrow="Fabric network"
                title="Channel organizations"
                pill={overview.network.fabric?.channel}
              >
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                  {overview.stakeholders.fabricOrgMapping.map((org) => (
                    <article key={org.mspId} className="rounded-3xl border border-border bg-card/75 p-4 space-y-1">
                      <strong className="block">{org.orgName}</strong>
                      <span className="block text-sm text-muted-foreground">{org.role}</span>
                      <code className="mt-3 block text-secondary">{org.mspId}</code>
                    </article>
                  ))}
                </div>
              </Panel>
            )}
          </>
        )}
      </AdminStateGate>
    </div>
  );
}
