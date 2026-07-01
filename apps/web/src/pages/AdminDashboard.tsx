import { useCallback, useEffect, useState } from 'react';
import type { AuditAlert } from '@pds/shared-types';
import {
  getStoredAdminToken,
  loadAdminOverview,
  setStoredAdminToken,
  type AdminOverview
} from '@/admin-api.js';
import { probeApi } from '@/api.js';
import { RuntimeCard } from '@/components/RuntimeCard.js';
import { Panel } from '@/components/Panel.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table.js';
import { CardTopline, DefinitionList, EntityCard } from '@/components/Entity.js';
import { cn } from '@/lib/utils.js';

const alertTone: Record<AuditAlert['riskLevel'], 'low' | 'medium' | 'high'> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

const healthTone: Record<string, string> = {
  ok: 'status-dot-live',
  degraded: 'status-dot-demo',
  unavailable: 'status-dot-offline'
};

const metricCards = (overview: AdminOverview): Array<[string, string]> => [
  ['Stakeholders', overview.metrics.stakeholders.toString()],
  ['Lots', overview.metrics.lots.toString()],
  ['Transfers', overview.metrics.transfers.toString()],
  ['Distributions', overview.metrics.distributions.toString()],
  ['Ledger events', overview.metrics.ledgerEvents.toString()],
  ['Open alerts', overview.metrics.openAuditAlerts.toString()]
];

export function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [tokenInput, setTokenInput] = useState(getStoredAdminToken());
  const [apiOnline, setApiOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const online = await probeApi();
    setApiOnline(online);

    if (!online) {
      setOverview(null);
      setError('API is offline. Start the backend to load the admin dashboard.');
      setLoading(false);
      return;
    }

    try {
      const payload = await loadAdminOverview();
      setOverview(payload);
    } catch (caught) {
      setOverview(null);
      setError(caught instanceof Error ? caught.message : 'Failed to load admin overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveToken = () => {
    setStoredAdminToken(tokenInput.trim());
    void refresh();
  };

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-10">
      <a href="#admin-main" className="skip-link">
        Skip to admin content
      </a>
      <section id="admin-main" className="mb-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
        <div className="surface-blur rounded-3xl p-8">
          <p className="eyebrow">PDS-Chain operator console</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Monitor ledger health, network status, and recent activity.
          </h1>
          <p className="mt-4 max-w-[66ch] leading-relaxed text-muted-foreground">
            Read-only admin view for demo and Fabric deployments. Protected endpoints require an
            admin token when configured on the API.
          </p>
          <div className="mt-5 flex flex-wrap justify-start gap-3">
            <Button variant="secondary" asChild>
              <a href="/">Back to demo workspace</a>
            </Button>
          </div>
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

      <Panel eyebrow="Access" title="Admin token" wide>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="admin-token">X-Admin-Token</Label>
            <Input
              id="admin-token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Optional in demo mode"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={saveToken}>
              Save token
            </Button>
            <Button type="button" variant="secondary" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
        </div>
      </Panel>

      {loading && (
        <Panel eyebrow="Status" title="Loading admin overview" wide className="mt-4">
          <p className="leading-relaxed text-muted-foreground">Loading admin overview…</p>
        </Panel>
      )}

      {!loading && error && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && overview && (
        <>
          <section
            className="mb-4 mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6"
            aria-label="Admin metrics"
          >
            {metricCards(overview).map(([label, value]) => (
              <div key={label} className="surface-blur rounded-3xl p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <strong className="mt-2 block text-3xl font-semibold tracking-tight">{value}</strong>
              </div>
            ))}
          </section>

          <section className="grid gap-4">
            <Panel
              eyebrow="Network"
              title="Ledger and persistence"
              pill={overview.network.ledgerMode}
            >
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
                  <article
                    key={check.name}
                    className="rounded-3xl border border-border bg-card/55 p-4"
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <strong>{check.name}</strong>
                      <span
                        className={cn(
                          'status-dot inline-block h-2.5 w-2.5',
                          healthTone[check.status] ?? 'status-dot-demo'
                        )}
                      />
                    </div>
                    <p className="text-muted-foreground">{check.detail}</p>
                  </article>
                ))}
              </div>
            </Panel>

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

            {overview.stakeholders.fabricOrgMapping.length > 0 && (
              <Panel
                eyebrow="Fabric network"
                title="Channel organizations"
                pill={overview.network.fabric?.channel}
              >
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                  {overview.stakeholders.fabricOrgMapping.map((org) => (
                    <EntityCard key={org.mspId} className="space-y-1">
                      <strong className="block">{org.orgName}</strong>
                      <span className="block text-sm text-muted-foreground">{org.role}</span>
                      <code className="mt-3 block text-secondary">{org.mspId}</code>
                    </EntityCard>
                  ))}
                </div>
              </Panel>
            )}

            <Panel
              eyebrow="Activity"
              title="Recent ledger events"
              pill={`${overview.activity.eventCount} total`}
              wide
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Timestamp</TableHead>
                    <TableHead scope="col">Event</TableHead>
                    <TableHead scope="col">Entity</TableHead>
                    <TableHead scope="col">Tx ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.activity.recentEvents.map((event) => (
                    <TableRow key={event.ledgerTxId}>
                      <TableCell>{event.timestamp}</TableCell>
                      <TableCell>{event.eventType}</TableCell>
                      <TableCell>
                        {event.entityType}/{event.entityId}
                      </TableCell>
                      <TableCell>
                        <code>{event.ledgerTxId}</code>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>

            <Panel eyebrow="Audit alerts" title="Open signals" pill={`${overview.auditAlerts.open} open`} wide>
              <div className="grid gap-3 md:grid-cols-2">
                {overview.auditAlerts.recent.map((alert) => (
                  <EntityCard key={alert.alertId} tone={alertTone[alert.riskLevel]}>
                    <CardTopline
                      left={alert.alertType}
                      right={alert.riskLevel}
                      tone={alertTone[alert.riskLevel]}
                    />
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
          </section>
        </>
      )}
    </main>
  );
}
