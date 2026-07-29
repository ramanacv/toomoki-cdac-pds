import { Panel } from '@/components/Panel.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { AdminStateGate } from '@/pages/admin/AdminStateGate.js';

export function AdminLedgerPage() {
  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="eyebrow"><span className="brand-name">ViksitPDS</span></p>
        <h2 className="text-3xl font-semibold tracking-tight">Ledger activity</h2>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          Entitlement utilization, stock positions, and recent ledger events.
        </p>
      </header>

      <AdminStateGate>
        {(overview) => (
          <>
            {overview.proofSummary ? <Panel
              eyebrow="Asynchronous proof pipeline"
              title="Blockchain proof completion"
              pill={`${overview.proofSummary.commitSuccessPercentage}% committed`}
              wide
            >
              <div className="grid gap-3 sm:grid-cols-5">
                {Object.entries(overview.proofSummary.counts).map(([status, count]) => (
                  <div key={status} className="rounded-xl border border-border p-3">
                    <div className="text-xs uppercase text-muted-foreground">{status}</div>
                    <div className="mt-1 text-xl font-semibold">{count}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Operational transactions commit to PostgreSQL first. Fabric proofs complete independently and remain visible for retry or intervention.
              </p>
            </Panel> : null}
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
          </>
        )}
      </AdminStateGate>
    </div>
  );
}
