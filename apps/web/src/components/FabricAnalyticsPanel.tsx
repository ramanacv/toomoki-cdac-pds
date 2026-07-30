import { useEffect, useState } from 'react';
import type {
  LedgerProofAnalyticsResponse,
  LedgerProofAnalyticsRow,
  LedgerProofDetailResponse,
  ProofAnalyticsModule
} from '@pds/shared-types';
import { loadLedgerProofAnalytics, loadLedgerProofDetail, loadLedgerProofsByEntity } from '@/api.js';
import { Panel } from '@/components/Panel.js';
import { SummaryCards } from '@/components/SummaryCards.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';

const MODULE_LABELS: Record<ProofAnalyticsModule, string> = {
  'supply-chain': 'Supply chain',
  eligibility: 'Card & eligibility',
  fps: 'FPS authentication',
  other: 'Other'
};

type FabricAnalyticsPanelProps = {
  apiOnline: boolean;
  canOpenDetail: boolean;
};

const shortHash = (value: string | undefined): string => {
  if (!value) return '—';
  return value.length <= 16 ? value : `${value.slice(0, 10)}…${value.slice(-4)}`;
};

export function FabricAnalyticsPanel({ apiOnline, canOpenDetail }: FabricAnalyticsPanelProps) {
  const [analytics, setAnalytics] = useState<LedgerProofAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LedgerProofDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [entityQuery, setEntityQuery] = useState('');
  const [entitySearchBusy, setEntitySearchBusy] = useState(false);
  const [entitySearchError, setEntitySearchError] = useState<string | null>(null);
  const [entitySearchRows, setEntitySearchRows] = useState<LedgerProofAnalyticsRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadLedgerProofAnalytics(apiOnline)
      .then((value) => {
        if (!cancelled) setAnalytics(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load Fabric analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiOnline]);

  useEffect(() => {
    if (!selectedEventId || !canOpenDetail) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void loadLedgerProofDetail(selectedEventId)
      .then((value) => {
        if (!cancelled) setDetail(value);
      })
      .catch((err: unknown) => {
        if (!cancelled) setDetailError(err instanceof Error ? err.message : 'Failed to load proof detail');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEventId, canOpenDetail]);

  const openRow = (row: LedgerProofAnalyticsRow) => {
    if (!canOpenDetail) return;
    setSelectedEventId(row.eventId);
  };

  const runEntitySearch = async () => {
    const value = entityQuery.trim();
    if (!value) {
      setEntitySearchError('Enter an opaque entityId or beneficiaryRefHash');
      return;
    }
    setEntitySearchBusy(true);
    setEntitySearchError(null);
    try {
      const result = await loadLedgerProofsByEntity({
        entityId: value,
        beneficiaryRefHash: value
      });
      setEntitySearchRows(result.items);
    } catch (err: unknown) {
      setEntitySearchRows(null);
      setEntitySearchError(err instanceof Error ? err.message : 'Entity proof lookup failed');
    } finally {
      setEntitySearchBusy(false);
    }
  };

  if (loading) {
    return (
      <Panel eyebrow="Fabric" title="Proof analytics" pill="Loading" wide>
        <p className="text-sm text-muted-foreground">Loading durable outbox analytics…</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel eyebrow="Fabric" title="Proof analytics" pill="Unavailable" wide>
        <p className="text-sm text-destructive">{error}</p>
      </Panel>
    );
  }

  if (!analytics) {
    return (
      <Panel eyebrow="Fabric" title="Proof analytics" pill="Demo fallback" wide>
        <p className="text-sm text-muted-foreground">
          Live API required for Fabric analytics. Connect the backend (not mock mode) to see pipeline
          health, module-bucketed proof volumes, and privacy-safe proof envelopes from the durable
          outbox.
        </p>
      </Panel>
    );
  }

  const { summary, byModule, byEventType, recentProofs } = analytics;
  const completeness = analytics.completeness ?? {
    byModule: {
      beneficiary: { expected: 0, committed: 0, missing: 0, pendingOrFailed: 0, deadLetter: 0 },
      eligibility: { expected: 0, committed: 0, missing: 0, pendingOrFailed: 0, deadLetter: 0 }
    },
    missingProofCount: 0,
    deadLetterCount: 0,
    pendingOrFailedCount: 0,
    missingEventIds: [],
    alerts: []
  };
  const pipelineCards: Array<[string, string, string?]> = [
    ['Committed', String(summary.counts.COMMITTED), 'Confirmed on Fabric with fabric_tx_id when available'],
    ['Pending / submitting', String(summary.counts.PENDING + summary.counts.SUBMITTING), 'Queued or in-flight proofs'],
    ['Failed', String(summary.counts.FAILED), 'Retryable worker failures'],
    ['Dead letter', String(summary.counts.DEAD_LETTER), 'Retry limit exhausted']
  ];
  const completenessCards: Array<[string, string, string?]> = [
    [
      'Beneficiary expected → committed',
      `${completeness.byModule.beneficiary.committed}/${completeness.byModule.beneficiary.expected}`,
      'Authorized registry lifecycle events vs COMMITTED outbox proofs'
    ],
    [
      'Eligibility expected → committed',
      `${completeness.byModule.eligibility.committed}/${completeness.byModule.eligibility.expected}`,
      'Authorized adjudication checkpoints vs COMMITTED outbox proofs'
    ],
    ['Missing proofs', String(completeness.missingProofCount), 'Lifecycle/adjudication events with no outbox row'],
    ['Dead letters (coverage)', String(completeness.deadLetterCount), 'Coverage-scoped proofs that exhausted retries']
  ];
  const alertBanner =
    completeness.missingProofCount > 0 || completeness.deadLetterCount > 0 || completeness.alerts.length > 0;

  return (
    <div className="grid gap-4">
      <Panel
        eyebrow="Fabric"
        title="Cross-module proof analytics"
        pill={`${summary.commitSuccessPercentage}% committed`}
        lead="Durable PostgreSQL outbox view of privacy-safe LedgerProof envelopes submitted to Fabric. Completeness compares authorized mock lifecycle and eligibility checkpoints to COMMITTED proofs — drift is detectable, not impossible, while supply-chain snapshot/outbox remains eventually consistent."
        wide
      >
        <SummaryCards cards={pipelineCards} />
        {summary.oldestOutstandingAgeSeconds != null && (
          <p className="text-sm text-muted-foreground">
            Oldest outstanding proof age: {Math.round(summary.oldestOutstandingAgeSeconds)}s
          </p>
        )}
      </Panel>

      <Panel
        eyebrow="Trust"
        title="Lifecycle proof completeness"
        pill={alertBanner ? 'Gaps detected' : 'Coverage OK'}
        lead="Expected authorized beneficiary and eligibility proof intents versus durable outbox outcomes."
        wide
      >
        <SummaryCards cards={completenessCards} />
        {alertBanner ? (
          <div className="mt-3 grid gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Missing-proof / dead-letter / drift alerts</p>
            <p className="text-muted-foreground">
              Pending or failed: {completeness.pendingOrFailedCount}. Alerts show detectable gaps only;
              operational PostgreSQL state remains authoritative.
            </p>
            <ul className="grid gap-1 text-xs text-muted-foreground">
              {completeness.alerts.slice(0, 8).map((alert) => (
                <li key={`${alert.kind}-${alert.eventId}-${alert.detail}`}>
                  <Badge variant="destructive">{alert.kind}</Badge>{' '}
                  <span className="font-mono">{alert.eventId}</span> — {alert.detail}
                </li>
              ))}
            </ul>
            {completeness.missingEventIds.length > 0 ? (
              <p className="font-mono text-xs text-muted-foreground">
                Missing event IDs: {completeness.missingEventIds.slice(0, 8).join(', ')}
                {completeness.missingEventIds.length > 8 ? '…' : ''}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No missing-proof or projection-drift alerts for beneficiary/eligibility coverage right now.
          </p>
        )}
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        {(['supply-chain', 'eligibility', 'fps'] as const).map((moduleId) => (
          <Panel
            key={moduleId}
            eyebrow="Module"
            title={MODULE_LABELS[moduleId]}
            pill={`${byModule[moduleId]} proofs`}
          >
            <p className="text-sm text-muted-foreground">
              Proofs attributed to this demo module by event and entity type.
            </p>
          </Panel>
        ))}
      </div>

      <Panel eyebrow="Fabric" title="Proofs by event type" pill={`${byEventType.length} types`} wide>
        {byEventType.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outbox rows yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Event type</TableHead>
                <TableHead scope="col">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byEventType.map((row) => (
                <TableRow key={row.eventType}>
                  <TableCell>{row.eventType}</TableCell>
                  <TableCell>{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {canOpenDetail ? (
        <Panel
          eyebrow="Auditor"
          title="Hash-keyed proof trail"
          pill="entityId / beneficiaryRefHash"
          lead="Search opaque entity or beneficiary reference hashes. Results join ledger events to Fabric fabric_tx_id. Cleartext Beneficiary IDs and Aadhaar are not accepted."
          wide
        >
          <form
            className="mb-4 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void runEntitySearch();
            }}
          >
            <label className="grid min-w-[16rem] flex-1 gap-1 text-sm">
              <span className="text-muted-foreground">Opaque entityId or beneficiaryRefHash</span>
              <Input
                value={entityQuery}
                onChange={(event) => setEntityQuery(event.target.value)}
                placeholder="e.g. beneficiary-demo-001-hash"
                autoComplete="off"
              />
            </label>
            <Button type="submit" disabled={entitySearchBusy || !apiOnline}>
              {entitySearchBusy ? 'Searching…' : 'Search proofs'}
            </Button>
          </form>
          {entitySearchError ? <p className="mb-3 text-sm text-destructive">{entitySearchError}</p> : null}
          {entitySearchRows ? (
            entitySearchRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ledger events matched that opaque reference.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Event</TableHead>
                      <TableHead scope="col">Entity</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Fabric TX</TableHead>
                      <TableHead scope="col">Business time</TableHead>
                      <TableHead scope="col">Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entitySearchRows.map((row) => (
                      <TableRow key={`entity-${row.eventId}`}>
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span>{row.eventType}</span>
                            <span className="text-xs text-muted-foreground">{row.eventId}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span>{row.entityType}</span>
                            <span className="text-xs text-muted-foreground">{row.entityId}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.status === 'COMMITTED' ? 'secondary' : 'destructive'}>
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{shortHash(row.fabricTxId)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.businessTimestamp}</TableCell>
                        <TableCell>
                          <Button type="button" variant="outline" size="sm" onClick={() => openRow(row)}>
                            Open
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Run a search after a beneficiary lifecycle create to show cryptographic Fabric transaction IDs
              for that hash-keyed trail.
            </p>
          )}
        </Panel>
      ) : null}

      <Panel
        eyebrow="Fabric"
        title="Recent proof envelopes"
        pill={`${recentProofs.length} shown`}
        lead={
          canOpenDetail
            ? 'Select a row to inspect the privacy-safe proofPayload that Fabric stores.'
            : 'Envelope fields only for this role. Management and Auditor can open proof detail.'
        }
        wide
      >
        {recentProofs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent proofs in the outbox.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Module</TableHead>
                  <TableHead scope="col">Event</TableHead>
                  <TableHead scope="col">Entity</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Fabric TX</TableHead>
                  <TableHead scope="col">Payload hash</TableHead>
                  <TableHead scope="col">Business time</TableHead>
                  {canOpenDetail ? <TableHead scope="col">Detail</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentProofs.map((row) => (
                  <TableRow key={row.eventId}>
                    <TableCell>{MODULE_LABELS[row.module]}</TableCell>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <span>{row.eventType}</span>
                        <span className="text-xs text-muted-foreground">{row.eventId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid gap-0.5">
                        <span>{row.entityType}</span>
                        <span className="text-xs text-muted-foreground">{row.entityId}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'COMMITTED' ? 'secondary' : 'destructive'}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{shortHash(row.fabricTxId)}</TableCell>
                    <TableCell className="font-mono text-xs">{shortHash(row.payloadHash)}</TableCell>
                    <TableCell className="text-xs">{row.businessTimestamp}</TableCell>
                    {canOpenDetail ? (
                      <TableCell>
                        <Button type="button" size="sm" variant="outline" onClick={() => openRow(row)}>
                          Open
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Dialog
        open={Boolean(selectedEventId)}
        onOpenChange={(open) => {
          if (!open) setSelectedEventId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Proof detail</DialogTitle>
            <DialogDescription>
              Privacy-safe LedgerProof fields from the durable outbox (same payload submitted to Fabric).
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? <p className="text-sm text-muted-foreground">Loading detail…</p> : null}
          {detailError ? <p className="text-sm text-destructive">{detailError}</p> : null}
          {detail ? (
            <div className="grid gap-3 text-sm">
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Event ID</dt>
                  <dd className="break-all font-mono text-xs">{detail.eventId}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Operation ID</dt>
                  <dd className="break-all font-mono text-xs">{detail.operationId}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Status</dt>
                  <dd>{detail.status}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Schema</dt>
                  <dd>{detail.schemaVersion}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Fabric TX</dt>
                  <dd className="break-all font-mono text-xs">{detail.fabricTxId ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Payload hash</dt>
                  <dd className="break-all font-mono text-xs">{detail.payloadHash}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Module</dt>
                  <dd>{MODULE_LABELS[detail.module]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Retries</dt>
                  <dd>{detail.retryCount}</dd>
                </div>
                {detail.actor ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase text-muted-foreground">Submitting actor</dt>
                    <dd className="font-mono text-xs">
                      {detail.actor.subject} · {detail.actor.applicationRole} ·{' '}
                      {detail.actor.submittingOrganization}
                    </dd>
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase text-muted-foreground">Submitting actor</dt>
                    <dd className="text-xs text-muted-foreground">
                      Not stored on the durable outbox row. Fabric proofs are submitted by the API
                      worker as a system actor.
                    </dd>
                  </div>
                )}
                {detail.failureCategory ? (
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Failure category</dt>
                    <dd>{detail.failureCategory}</dd>
                  </div>
                ) : null}
                {detail.rawWorkerError ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs uppercase text-muted-foreground">Worker error</dt>
                    <dd className="break-all text-xs text-destructive">{detail.rawWorkerError}</dd>
                  </div>
                ) : null}
              </dl>
              <div>
                <p className="mb-2 text-xs uppercase text-muted-foreground">proofPayload</p>
                <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/40 p-3 text-xs">
                  {JSON.stringify(detail.proofPayload, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
