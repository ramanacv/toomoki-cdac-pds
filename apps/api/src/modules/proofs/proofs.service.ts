import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  LedgerEvent,
  LedgerProofAnalyticsResponse,
  LedgerProofAnalyticsRow,
  LedgerProofCompleteness,
  LedgerProofCompletenessAlert,
  LedgerProofCompletenessModule,
  LedgerProofDetailResponse,
  LedgerProofEntityQueryResponse,
  LedgerProofStatusResponse,
  LedgerProofSummaryResponse,
  ProofAnalyticsModule,
  ProofFailureCategory,
  ProofStatus
} from '@pds/shared-types';
import { payloadHashFor, privacySafeCopy, proofAnalyticsModuleFor } from '../fabric/ledger-proof.js';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';

const STATUSES: ProofStatus[] = ['PENDING', 'SUBMITTING', 'COMMITTED', 'FAILED', 'DEAD_LETTER'];
const MODULES: ProofAnalyticsModule[] = ['supply-chain', 'eligibility', 'fps', 'other'];
const RECENT_PROOF_LIMIT = 50;
const ENTITY_PROOF_LIMIT_DEFAULT = 50;
const ENTITY_PROOF_LIMIT_MAX = 200;
const MISSING_EVENT_LIMIT = 25;
const ALERT_LIMIT = 40;
const ELIGIBILITY_PROOF_ACTION_TYPES = [
  'NOTICE', 'VERIFICATION', 'RECOMMENDATION', 'DECISION', 'APPEAL', 'REINSTATEMENT'
];

const emptyCompletenessModule = (): LedgerProofCompletenessModule => ({
  expected: 0, committed: 0, missing: 0, pendingOrFailed: 0, deadLetter: 0
});

const emptyCompleteness = (): LedgerProofCompleteness => ({
  byModule: { beneficiary: emptyCompletenessModule(), eligibility: emptyCompletenessModule() },
  missingProofCount: 0,
  deadLetterCount: 0,
  pendingOrFailedCount: 0,
  missingEventIds: [],
  alerts: []
});

const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));

const failureCategory = (error: unknown): ProofFailureCategory | undefined => {
  if (typeof error !== 'string' || !error.trim()) return undefined;
  const normalized = error.toLowerCase();
  if (normalized.includes('endorse')) return 'ENDORSEMENT_FAILED';
  if (normalized.includes('timeout') || normalized.includes('deadline')) return 'TIMEOUT';
  if (normalized.includes('validation') || normalized.includes('invalid')) return 'VALIDATION_FAILED';
  if (normalized.includes('commit')) return 'COMMIT_FAILED';
  if (normalized.includes('connect') || normalized.includes('unavailable') || normalized.includes('grpc')) {
    return 'FABRIC_UNAVAILABLE';
  }
  return 'UNKNOWN';
};

const emptyModuleCounts = (): Record<ProofAnalyticsModule, number> =>
  Object.fromEntries(MODULES.map((module) => [module, 0])) as Record<ProofAnalyticsModule, number>;

const emptyStatusCounts = (): Record<ProofStatus, number> =>
  Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<ProofStatus, number>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseLedgerEvent = (payload: unknown): LedgerEvent | null => {
  if (!isRecord(payload)) return null;
  const eventType = typeof payload.eventType === 'string' ? payload.eventType : '';
  const entityType = typeof payload.entityType === 'string' ? payload.entityType : '';
  const entityId = typeof payload.entityId === 'string' ? payload.entityId : '';
  const ledgerTxId = typeof payload.ledgerTxId === 'string' ? payload.ledgerTxId : '';
  const timestamp = typeof payload.timestamp === 'string' ? payload.timestamp : '';
  const eventPayload = isRecord(payload.payload) ? payload.payload : {};
  if (!eventType || !entityType || !entityId || !ledgerTxId) return null;
  return {
    ledgerTxId,
    entityType: entityType as LedgerEvent['entityType'],
    entityId,
    eventType,
    payload: eventPayload,
    timestamp: timestamp || new Date(0).toISOString()
  };
};

@Injectable()
export class ProofsService {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  async getStatus(eventId: string, includeRawError: boolean): Promise<LedgerProofStatusResponse> {
    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      const event = (await Promise.resolve(this.ledger.listLedgerEvents())).find(
        (item: { ledgerTxId: string }) => item.ledgerTxId === eventId
      );
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

  /**
   * Hash-keyed auditor trail: ledger_events filtered by entityId and/or
   * beneficiaryRefHash, left-joined to ledger_outbox for fabric_tx_id.
   * Cleartext Beneficiary IDs are intentionally not accepted.
   */
  async listByEntity(query: {
    entityId?: string;
    beneficiaryRefHash?: string;
    limit?: number;
  }): Promise<LedgerProofEntityQueryResponse> {
    const entityId = query.entityId?.trim() || undefined;
    const beneficiaryRefHash = query.beneficiaryRefHash?.trim() || undefined;
    if (!entityId && !beneficiaryRefHash) {
      throw new BadRequestException('Provide entityId and/or beneficiaryRefHash (opaque hash references only)');
    }
    const limit = Math.min(
      Math.max(1, Number.isFinite(query.limit) ? Number(query.limit) : ENTITY_PROOF_LIMIT_DEFAULT),
      ENTITY_PROOF_LIMIT_MAX
    );

    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      const events = (await Promise.resolve(this.ledger.listLedgerEvents())) as LedgerEvent[];
      const items = events
        .filter((event) => {
          if (entityId && event.entityId !== entityId) return false;
          if (beneficiaryRefHash) {
            const payloadRef =
              typeof event.payload?.beneficiaryRefHash === 'string'
                ? event.payload.beneficiaryRefHash
                : undefined;
            if (event.entityId !== beneficiaryRefHash && payloadRef !== beneficiaryRefHash) return false;
          }
          return true;
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit)
        .map((event) => this.rowFromMemoryEvent(event));
      return {
        items,
        ...(entityId ? { entityId } : {}),
        ...(beneficiaryRefHash ? { beneficiaryRefHash } : {})
      };
    }

    const result = await pool.query(
      `SELECT e.ledger_tx_id AS event_id,
              COALESCE(o.operation_id, e.ledger_tx_id) AS operation_id,
              o.status,
              o.fabric_tx_id,
              COALESCE(o.retry_count, 0) AS retry_count,
              COALESCE(o.schema_version, 1) AS schema_version,
              COALESCE(o.created_at, e.timestamp) AS created_at,
              o.committed_at,
              jsonb_build_object(
                'ledgerTxId', e.ledger_tx_id,
                'entityType', e.entity_type,
                'entityId', e.entity_id,
                'eventType', e.event_type,
                'payload', e.payload,
                'timestamp', e.timestamp
              ) AS event_payload
         FROM ledger_events e
         LEFT JOIN ledger_outbox o ON o.event_id = e.ledger_tx_id
        WHERE ($1::text IS NULL OR e.entity_id = $1)
          AND (
            $2::text IS NULL
            OR e.entity_id = $2
            OR e.payload->>'beneficiaryRefHash' = $2
          )
        ORDER BY e.timestamp DESC
        LIMIT $3`,
      [entityId ?? null, beneficiaryRefHash ?? null, limit]
    );

    const items: LedgerProofAnalyticsRow[] = [];
    for (const row of result.rows) {
      const analyticsRow = this.rowFromOutbox({
        ...row,
        status: row.status ?? 'COMMITTED'
      });
      if (analyticsRow) items.push(analyticsRow);
    }

    return {
      items,
      ...(entityId ? { entityId } : {}),
      ...(beneficiaryRefHash ? { beneficiaryRefHash } : {})
    };
  }

  async getSummary(): Promise<LedgerProofSummaryResponse> {
    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      return {
        counts: emptyStatusCounts(),
        oldestOutstandingAgeSeconds: null,
        commitSuccessPercentage: 0,
        recentCommitted: []
      };
    }

    const [countsResult, oldestResult, recentResult] = await Promise.all([
      pool.query('SELECT status, COUNT(*)::int AS count FROM ledger_outbox GROUP BY status'),
      pool.query(
        "SELECT EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::float8 AS age FROM ledger_outbox WHERE status <> 'COMMITTED'"
      ),
      pool.query(
        `SELECT event_id, fabric_tx_id, committed_at FROM ledger_outbox
         WHERE status = 'COMMITTED' AND fabric_tx_id IS NOT NULL
         ORDER BY committed_at DESC LIMIT 10`
      )
    ]);
    const counts = emptyStatusCounts();
    for (const row of countsResult.rows) {
      if (STATUSES.includes(row.status as ProofStatus)) counts[row.status as ProofStatus] = Number(row.count);
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
      counts,
      oldestOutstandingAgeSeconds: oldestResult.rows[0]?.age == null ? null : Number(oldestResult.rows[0].age),
      commitSuccessPercentage: total === 0 ? 0 : Number(((counts.COMMITTED / total) * 100).toFixed(2)),
      recentCommitted: recentResult.rows.map((row) => ({
        eventId: String(row.event_id),
        fabricTxId: String(row.fabric_tx_id),
        committedAt: iso(row.committed_at)
      }))
    };
  }

  async getAnalytics(): Promise<LedgerProofAnalyticsResponse> {
    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      return {
        summary: {
          counts: emptyStatusCounts(),
          oldestOutstandingAgeSeconds: null,
          commitSuccessPercentage: 0,
          recentCommitted: []
        },
        byModule: emptyModuleCounts(),
        byEventType: [],
        recentProofs: [],
        completeness: emptyCompleteness()
      };
    }

    const summary = await this.getSummary();
    const total = Object.values(summary.counts).reduce((sum, count) => sum + count, 0);

    const rowsResult = await pool.query(
      `SELECT event_id, operation_id, status, fabric_tx_id, retry_count, schema_version,
              created_at, committed_at, event_payload
       FROM ledger_outbox
       ORDER BY created_at DESC
       LIMIT $1`,
      [RECENT_PROOF_LIMIT]
    );

    const byModule = emptyModuleCounts();
    const eventTypeCounts = new Map<string, number>();
    const recentProofs: LedgerProofAnalyticsRow[] = [];

    for (const row of rowsResult.rows) {
      const analyticsRow = this.rowFromOutbox(row);
      if (!analyticsRow) continue;
      byModule[analyticsRow.module] += 1;
      eventTypeCounts.set(analyticsRow.eventType, (eventTypeCounts.get(analyticsRow.eventType) ?? 0) + 1);
      recentProofs.push(analyticsRow);
    }

    // Module totals for the full outbox (not only recent window) when the recent window is truncated.
    if (total > rowsResult.rows.length) {
      const moduleAgg = await pool.query(
        `SELECT COALESCE(event_payload->>'eventType', '') AS event_type,
                COALESCE(event_payload->>'entityType', '') AS entity_type,
                COUNT(*)::int AS count
         FROM ledger_outbox
         GROUP BY 1, 2`
      );
      for (const key of MODULES) byModule[key] = 0;
      eventTypeCounts.clear();
      for (const row of moduleAgg.rows) {
        const eventType = String(row.event_type || 'Unknown');
        const entityType = String(row.entity_type || 'workflow');
        const module = proofAnalyticsModuleFor(eventType, entityType);
        const count = Number(row.count);
        byModule[module] += count;
        eventTypeCounts.set(eventType, (eventTypeCounts.get(eventType) ?? 0) + count);
      }
    }

    const byEventType = [...eventTypeCounts.entries()]
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType));

    const completeness = await this.buildCompleteness(pool);
    return { summary, byModule, byEventType, recentProofs, completeness };
  }

  private async buildCompleteness(pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }): Promise<LedgerProofCompleteness> {
    const completeness = emptyCompleteness();
    const alerts: LedgerProofCompletenessAlert[] = [];
    const missingEventIds: string[] = [];

    const safeQuery = async (text: string, values?: unknown[]) => {
      try {
        return await pool.query(text, values);
      } catch {
        return { rows: [] as Record<string, unknown>[] };
      }
    };

    const [beneficiaryExpected, eligibilityExpected, driftRows] = await Promise.all([
      safeQuery(
        `SELECT event.proof_event_id AS event_id, outbox.status AS outbox_status
           FROM beneficiary_lifecycle_events event
           LEFT JOIN ledger_outbox outbox ON outbox.event_id = event.proof_event_id
          ORDER BY event.effective_at, event.event_id`
      ),
      safeQuery(
        `SELECT case_snapshot->>'proofEventId' AS event_id,
                outbox.status AS outbox_status,
                case_snapshot->'screening'->>'evidenceDigest' AS evidence_digest,
                outbox.event_payload #>> '{payload,externalEvidenceDigest}' AS proof_digest
           FROM eligibility_case_actions action
           LEFT JOIN ledger_outbox outbox
             ON outbox.event_id = case_snapshot->>'proofEventId'
          WHERE action_type = ANY($1::text[])
            AND case_snapshot->>'proofEventId' IS NOT NULL
          ORDER BY occurred_at, action_id`,
        [ELIGIBILITY_PROOF_ACTION_TYPES]
      ),
      safeQuery(
        `SELECT event.proof_event_id AS event_id,
                projection.state AS projection_state,
                projection.version AS projection_version,
                projection_snapshot->>'state' AS snap_state,
                (projection_snapshot->>'version')::int AS snap_version
           FROM beneficiary_registry_projection projection
           JOIN beneficiary_lifecycle_events event ON event.event_id = projection.last_event_id
           JOIN ledger_outbox outbox ON outbox.event_id = event.proof_event_id
          WHERE outbox.status = 'COMMITTED'
            AND (
              projection.state IS DISTINCT FROM projection_snapshot->>'state'
              OR projection.version IS DISTINCT FROM (projection_snapshot->>'version')::int
            )`
      )
    ]);

    const tally = (module: 'beneficiary' | 'eligibility', rows: Record<string, unknown>[]): void => {
      const bucket = completeness.byModule[module];
      for (const row of rows) {
        const eventId = String(row.event_id ?? '');
        if (!eventId) continue;
        bucket.expected += 1;
        const status = row.outbox_status == null ? null : String(row.outbox_status);
        if (status === 'COMMITTED') {
          bucket.committed += 1;
          if (
            module === 'eligibility'
            && typeof row.evidence_digest === 'string'
            && typeof row.proof_digest === 'string'
            && row.evidence_digest
            && row.proof_digest
            && row.evidence_digest !== row.proof_digest
            && alerts.length < ALERT_LIMIT
          ) {
            alerts.push({
              kind: 'PROOF_PROJECTION_DRIFT',
              module,
              eventId,
              detail: 'Case evidenceDigest disagrees with COMMITTED proof externalEvidenceDigest'
            });
          }
        } else if (status === 'DEAD_LETTER') {
          bucket.deadLetter += 1;
          if (alerts.length < ALERT_LIMIT) {
            alerts.push({
              kind: 'DEAD_LETTER',
              module,
              eventId,
              detail: 'Proof retry limit exhausted; requires explicit manual retry'
            });
          }
        } else if (status === 'PENDING' || status === 'SUBMITTING' || status === 'FAILED') {
          bucket.pendingOrFailed += 1;
        } else {
          bucket.missing += 1;
          if (missingEventIds.length < MISSING_EVENT_LIMIT) missingEventIds.push(eventId);
          if (alerts.length < ALERT_LIMIT) {
            alerts.push({
              kind: 'MISSING_PROOF',
              module,
              eventId,
              detail: 'Authorized lifecycle/adjudication event has no durable outbox proof row'
            });
          }
        }
      }
    };

    tally('beneficiary', beneficiaryExpected.rows);
    tally('eligibility', eligibilityExpected.rows);

    for (const row of driftRows.rows) {
      if (alerts.length >= ALERT_LIMIT) break;
      alerts.push({
        kind: 'PROOF_PROJECTION_DRIFT',
        module: 'beneficiary',
        eventId: String(row.event_id),
        detail: `Projection ${String(row.projection_state)}@v${String(row.projection_version)} disagrees with last snapshot ${String(row.snap_state)}@v${String(row.snap_version)}`
      });
    }

    completeness.missingProofCount =
      completeness.byModule.beneficiary.missing + completeness.byModule.eligibility.missing;
    completeness.deadLetterCount =
      completeness.byModule.beneficiary.deadLetter + completeness.byModule.eligibility.deadLetter;
    completeness.pendingOrFailedCount =
      completeness.byModule.beneficiary.pendingOrFailed + completeness.byModule.eligibility.pendingOrFailed;
    completeness.missingEventIds = missingEventIds;
    completeness.alerts = alerts;
    return completeness;
  }

  async getDetail(eventId: string, includeRawError: boolean): Promise<LedgerProofDetailResponse> {
    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      const event = (await Promise.resolve(this.ledger.listLedgerEvents())).find(
        (item: LedgerEvent) => item.ledgerTxId === eventId
      );
      if (!event) throw new NotFoundException(`Ledger proof ${eventId} not found`);
      const row = this.rowFromMemoryEvent(event);
      return {
        ...row,
        proofPayload: privacySafeCopy(event.payload) as Record<string, unknown>
      };
    }

    const result = await pool.query(
      `SELECT event_id, operation_id, status, fabric_tx_id, retry_count, schema_version,
              created_at, committed_at, event_payload, last_error
       FROM ledger_outbox WHERE event_id = $1`,
      [eventId]
    );
    if (result.rows.length === 0) throw new NotFoundException(`Ledger proof ${eventId} not found`);
    const row = result.rows[0];
    const analyticsRow = this.rowFromOutbox(row);
    if (!analyticsRow) throw new NotFoundException(`Ledger proof ${eventId} has an unreadable payload`);

    const event = parseLedgerEvent(row.event_payload);
    const proofPayload = privacySafeCopy(event?.payload ?? {}) as Record<string, unknown>;
    const detail: LedgerProofDetailResponse = { ...analyticsRow, proofPayload };
    const category = failureCategory(row.last_error);
    if (category) detail.failureCategory = category;
    if (includeRawError && row.last_error) detail.rawWorkerError = String(row.last_error);
    return detail;
  }

  private rowFromMemoryEvent(event: LedgerEvent): LedgerProofAnalyticsRow {
    return {
      eventId: event.ledgerTxId,
      operationId: event.ledgerTxId,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      schemaVersion: 1,
      payloadHash: payloadHashFor(event.payload ?? {}),
      businessTimestamp: event.timestamp,
      status: 'COMMITTED',
      retryCount: 0,
      createdAt: event.timestamp,
      committedAt: event.timestamp,
      module: proofAnalyticsModuleFor(event.eventType, event.entityType)
    };
  }

  private rowFromOutbox(row: Record<string, unknown>): LedgerProofAnalyticsRow | null {
    const event = parseLedgerEvent(row.event_payload);
    if (!event) return null;
    const status = row.status as ProofStatus;
    const analyticsRow: LedgerProofAnalyticsRow = {
      eventId: String(row.event_id),
      operationId: String(row.operation_id ?? row.event_id),
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      schemaVersion: Number(row.schema_version ?? 1),
      payloadHash: payloadHashFor(event.payload ?? {}),
      businessTimestamp: event.timestamp,
      status,
      retryCount: Number(row.retry_count ?? 0),
      createdAt: iso(row.created_at),
      module: proofAnalyticsModuleFor(event.eventType, event.entityType)
    };
    if (row.fabric_tx_id) analyticsRow.fabricTxId = String(row.fabric_tx_id);
    if (row.committed_at) analyticsRow.committedAt = iso(row.committed_at);
    return analyticsRow;
  }
}
