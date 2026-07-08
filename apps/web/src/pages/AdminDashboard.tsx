import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { COMMODITIES, type AuditAlert, type Stakeholder } from '@pds/shared-types';
import {
  getStoredAdminToken,
  loadAdminOverview,
  resetAdminLedger,
  setStoredAdminToken,
  type AdminOverview
} from '@/admin-api.js';
import { createStockLot, loadStakeholders, probeApi } from '@/api.js';
import { RuntimeCard } from '@/components/RuntimeCard.js';
import { Panel } from '@/components/Panel.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog.js';
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

const getCommodityDefaults = (commodity: string) =>
  COMMODITIES.find((item) => item.name === commodity) ?? COMMODITIES[0];

export function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [tokenInput, setTokenInput] = useState(getStoredAdminToken());
  const [apiOnline, setApiOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [stockCommodity, setStockCommodity] = useState('Rice');
  const [stockQuantityKg, setStockQuantityKg] = useState('10000');
  const [stockQualityGrade, setStockQualityGrade] = useState('A');
  const [stockOwner, setStockOwner] = useState('PROC-001');
  const [stockLocation, setStockLocation] = useState('Procurement Yard');
  const [stockSubmitting, setStockSubmitting] = useState(false);
  const [stockMessage, setStockMessage] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

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
      const [payload, stakeholderList] = await Promise.all([loadAdminOverview(), loadStakeholders(online)]);
      setOverview(payload);
      setStakeholders(stakeholderList);
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

  const selectCommodity = (commodity: string) => {
    const defaults = getCommodityDefaults(commodity);
    setStockCommodity(defaults.name);
    setStockQuantityKg(String(defaults.defaultTopUpQuantityKg));
    setStockQualityGrade(defaults.defaultQualityGrade);
  };

  const addStock = async () => {
    setStockSubmitting(true);
    setStockMessage(null);
    setStockError(null);
    try {
      const quantityKg = Number(stockQuantityKg);
      if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
        throw new Error('Quantity must be a positive number');
      }
      const lot = await createStockLot({
        commodity: stockCommodity.trim(),
        quantityKg,
        qualityGrade: stockQualityGrade.trim(),
        currentOwner: stockOwner,
        currentLocation: stockLocation.trim()
      });
      const message = `Created ${lot.lotId} — ${lot.quantityKg.toLocaleString()} kg of ${lot.commodity} at ${lot.currentOwner}.`;
      setStockMessage(message);
      toast.success('Stock added', { description: message });
      await refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to add stock';
      setStockError(message);
      toast.error('Failed to add stock', { description: message });
    } finally {
      setStockSubmitting(false);
    }
  };

  const resetLedger = async () => {
    setResetSubmitting(true);
    setResetMessage(null);
    setResetError(null);
    try {
      const result = await resetAdminLedger();
      setResetMessage(result.message);
      toast.success('Ledger reset', { description: result.message });
      await refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to reset ledger';
      setResetError(message);
      toast.error('Reset failed', { description: message });
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-10">
      <a href="#admin-main" className="skip-link">
        Skip to admin content
      </a>
      <section id="admin-main" className="mb-6 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(290px,0.7fr)]">
        <div className="surface-blur rounded-3xl p-8">
          <p className="eyebrow">ViksitPDS operator console</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Monitor ledger health, network status, and recent activity.
          </h1>
          <p className="mt-4 max-w-[66ch] leading-relaxed text-muted-foreground">
            Admin view for demo and Fabric deployments, with test-data controls for topping up
            stock and resetting the ledger. Protected endpoints require an admin token when
            configured on the API.
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

      <Panel eyebrow="Test data" title="Add stock" wide className="mt-4">
        <p className="mb-4 text-sm text-muted-foreground">
          Creates a new commodity lot and credits its quantity to the owning stakeholder's stock
          position — use this to keep testing once a lot has been fully issued downstream.
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="grid gap-2">
            <Label htmlFor="stock-commodity">Commodity</Label>
            <Select value={stockCommodity} onValueChange={selectCommodity}>
              <SelectTrigger id="stock-commodity">
                <SelectValue placeholder="Select a commodity" />
              </SelectTrigger>
              <SelectContent>
                {COMMODITIES.map((commodity) => (
                  <SelectItem key={commodity.slug} value={commodity.name}>
                    {commodity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-quantity">Quantity (kg)</Label>
            <Input
              id="stock-quantity"
              type="number"
              min={1}
              value={stockQuantityKg}
              onChange={(event) => setStockQuantityKg(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-grade">Quality grade</Label>
            <Input
              id="stock-grade"
              value={stockQualityGrade}
              onChange={(event) => setStockQualityGrade(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-owner">Owning stakeholder</Label>
            <Select value={stockOwner} onValueChange={setStockOwner}>
              <SelectTrigger id="stock-owner">
                <SelectValue placeholder="Select a stakeholder" />
              </SelectTrigger>
              <SelectContent>
                {stakeholders.map((stakeholder) => (
                  <SelectItem key={stakeholder.stakeholderId} value={stakeholder.stakeholderId}>
                    {stakeholder.stakeholderId} — {stakeholder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-location">Location</Label>
            <Input
              id="stock-location"
              value={stockLocation}
              onChange={(event) => setStockLocation(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void addStock()} disabled={!apiOnline || stockSubmitting}>
            {stockSubmitting ? 'Adding stock…' : 'Add stock'}
          </Button>
          {stockMessage && <p className="text-sm text-muted-foreground">{stockMessage}</p>}
        </div>
        {stockError && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{stockError}</AlertDescription>
          </Alert>
        )}
      </Panel>

      <Panel eyebrow="Danger zone" title="Reset ledger" wide className="mt-4">
        <p className="mb-4 text-sm text-muted-foreground">
          Clears movements, allocations, distributions, audit alerts, stock, and ledger events,
          then reseeds the initial commodity lots and resets entitlement balances back to their
          monthly limits. Stakeholders, ration cards, and entitlement rules are left untouched.
          Use this to start a clean test run after bad quantities have propagated through the ledger.
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="destructive" disabled={!apiOnline || resetSubmitting}>
              {resetSubmitting ? 'Resetting…' : 'Reset ledger'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset ledger data?</DialogTitle>
              <DialogDescription>
                This clears movement data and stock positions on the running ledger, then reseeds
                the initial commodity lots. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogTrigger asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogTrigger>
              <DialogTrigger asChild>
                <Button variant="destructive" onClick={() => void resetLedger()}>
                  Confirm reset
                </Button>
              </DialogTrigger>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {resetMessage && <p className="mt-3 text-sm text-muted-foreground">{resetMessage}</p>}
        {resetError && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{resetError}</AlertDescription>
          </Alert>
        )}
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

            <Panel
              eyebrow="Ledger"
              title="Entitlement utilization"
              pill={`${overview.entitlementSummary.utilizationPct}% lifted`}
            >
              <dl className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <dt className="text-sm uppercase tracking-wide text-muted-foreground">Monthly entitlement</dt>
                  <dd>{overview.entitlementSummary.totalMonthlyEntitlementKg.toLocaleString()} kg</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-sm uppercase tracking-wide text-muted-foreground">Already lifted</dt>
                  <dd>{overview.entitlementSummary.totalLiftedKg.toLocaleString()} kg</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-sm uppercase tracking-wide text-muted-foreground">Available balance</dt>
                  <dd>{overview.entitlementSummary.totalAvailableKg.toLocaleString()} kg</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="text-sm uppercase tracking-wide text-muted-foreground">Active records</dt>
                  <dd>
                    {overview.entitlementSummary.activeCount} / {overview.entitlementSummary.recordCount}
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel eyebrow="Ledger" title="Stock positions" pill={`${overview.stock.length} positions`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Entity</TableHead>
                    <TableHead scope="col">Commodity</TableHead>
                    <TableHead scope="col">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.stock.map((position) => (
                    <TableRow key={`${position.entityId}-${position.commodity}`}>
                      <TableCell>{position.entityId}</TableCell>
                      <TableCell>{position.commodity}</TableCell>
                      <TableCell>{position.quantityKg.toLocaleString()} kg</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
