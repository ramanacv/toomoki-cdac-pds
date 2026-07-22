import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { LedgerProofStatusResponse, LedgerProofSummaryResponse, ProofFailureCategory, ProofStatus } from '@pds/shared-types';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';

const STATUSES: ProofStatus[] = ['PENDING', 'SUBMITTING', 'COMMITTED', 'FAILED', 'DEAD_LETTER'];
const iso = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value);

const failureCategory = (error: unknown): ProofFailureCategory | undefined => {
  if (typeof error !== 'string' || !error.trim()) return undefined;
  const normalized = error.toLowerCase();
  if (normalized.includes('endorse')) return 'ENDORSEMENT_FAILED';
  if (normalized.includes('timeout') || normalized.includes('deadline')) return 'TIMEOUT';
  if (normalized.includes('validation') || normalized.includes('invalid')) return 'VALIDATION_FAILED';
  if (normalized.includes('commit')) return 'COMMIT_FAILED';
  if (normalized.includes('connect') || normalized.includes('unavailable') || normalized.includes('grpc')) return 'FABRIC_UNAVAILABLE';
  return 'UNKNOWN';
};

@Injectable()
export class ProofsService {
  constructor(
    @Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade
  ) {}

  async getStatus(eventId: string, includeRawError: boolean): Promise<LedgerProofStatusResponse> {
    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      const event = (await Promise.resolve(this.ledger.listLedgerEvents())).find((item: { ledgerTxId: string }) => item.ledgerTxId === eventId);
      if (!event) throw new NotFoundException(`Ledger proof ${eventId} not found`);
      return { eventId, operationId: eventId, status: 'COMMITTED', retryCount: 0, createdAt: event.timestamp };
    }

    const result = await pool.query(
      `SELECT event_id, operation_id, status, fabric_tx_id, retry_count, created_at,
              submitting_at, committed_at, last_error
       FROM ledger_outbox WHERE event_id = $1`,
      [eventId]
    );
    if (result.rows.length === 0) throw new NotFoundException(`Ledger proof ${eventId} not found`);
    const row = result.rows[0];
    const response: LedgerProofStatusResponse = {
      eventId: String(row.event_id),
      operationId: String(row.operation_id ?? row.event_id),
      status: row.status as ProofStatus,
      retryCount: Number(row.retry_count),
      createdAt: iso(row.created_at)
    };
    if (row.fabric_tx_id) response.fabricTxId = String(row.fabric_tx_id);
    if (row.submitting_at) response.submittingAt = iso(row.submitting_at);
    if (row.committed_at) response.committedAt = iso(row.committed_at);
    const category = failureCategory(row.last_error);
    if (category) response.failureCategory = category;
    if (includeRawError && row.last_error) response.rawWorkerError = String(row.last_error);
    return response;
  }

  async getSummary(): Promise<LedgerProofSummaryResponse> {
    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      const events = await Promise.resolve(this.ledger.listLedgerEvents());
      return {
        counts: { PENDING: 0, SUBMITTING: 0, COMMITTED: events.length, FAILED: 0, DEAD_LETTER: 0 },
        oldestOutstandingAgeSeconds: null,
        commitSuccessPercentage: events.length > 0 ? 100 : 0,
        recentCommitted: []
      };
    }

    const [countsResult, oldestResult, recentResult] = await Promise.all([
      pool.query('SELECT status, COUNT(*)::int AS count FROM ledger_outbox GROUP BY status'),
      pool.query("SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::float8 AS age FROM ledger_outbox WHERE status <> 'COMMITTED'"),
      pool.query(`SELECT event_id, fabric_tx_id, committed_at FROM ledger_outbox
                  WHERE status = 'COMMITTED' AND fabric_tx_id IS NOT NULL
                  ORDER BY committed_at DESC LIMIT 10`)
    ]);
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<ProofStatus, number>;
    for (const row of countsResult.rows) {
      if (STATUSES.includes(row.status as ProofStatus)) counts[row.status as ProofStatus] = Number(row.count);
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
      counts,
      oldestOutstandingAgeSeconds: oldestResult.rows[0]?.age == null ? null : Number(oldestResult.rows[0].age),
      commitSuccessPercentage: total === 0 ? 0 : Number(((counts.COMMITTED / total) * 100).toFixed(2)),
      recentCommitted: recentResult.rows.map((row) => ({
        eventId: String(row.event_id), fabricTxId: String(row.fabric_tx_id), committedAt: iso(row.committed_at)
      }))
    };
  }
}
