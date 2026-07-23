import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  type IntegrationEventResult,
  type IntegrationReconciliationException,
  type IntegrationReconciliationSummary,
  type IntegrationSourceHealth,
  type SourceEventEnvelope,
  type SourceProvenance,
  type SourceSystem
} from '@pds/shared-types';
import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import { canonicalJson, assertPrivacySafe } from '../fabric/ledger-proof.js';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { DurableAuthorizationService } from '../auth/durable-authorization.service.js';

type StoredIntegrationEvent = IntegrationEventResult & {
  envelope: SourceEventEnvelope;
  endpointFamily: string;
};

type ReconciliationEvent = StoredIntegrationEvent;
type IntegrationAttempt = {
  sourceSystem: SourceSystem;
  disposition: string;
  attemptedAt: string;
};

export type IngestionOutcome = {
  disposition: 'NEW' | 'DUPLICATE' | 'QUARANTINED' | 'CONFLICT';
  result: IntegrationEventResult;
};

export type IntegrationEventTrace = {
  event: IntegrationEventResult;
  proof: {
    eventId: string;
    status: string;
    fabricTxId?: string;
    committedAt?: string;
  };
};

const eventKey = (sourceSystem: SourceSystem, sourceEventId: string): string =>
  `${sourceSystem}:${sourceEventId}`;

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const referencedEventIds = (envelope: SourceEventEnvelope): string[] =>
  [
    envelope.parentSourceEventId,
    envelope.amendmentOfSourceEventId,
    envelope.reversalOfSourceEventId
  ].filter((value): value is string => Boolean(value));

const stringArrayClaim = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
};

@Injectable()
export class IntegrationEventsService {
  private memory = new Map<string, StoredIntegrationEvent>();
  private attempts: IntegrationAttempt[] = [];
  private fileQueue: Promise<void> = Promise.resolve();

  constructor(
    @Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade,
    @Optional() @Inject(DurableAuthorizationService)
    private readonly durableAuthorization?: DurableAuthorizationService
  ) {}

  async ingest(
    envelope: SourceEventEnvelope,
    expected: { sourceSystem: SourceSystem; eventType: SourceEventEnvelope['eventType']; endpointFamily: string },
    request?: AuthenticatedRequest
  ): Promise<IngestionOutcome> {
    await this.assertAuthorizedSource(request, expected.sourceSystem, expected.endpointFamily, envelope.eventType);
    if (envelope.sourceSystem !== expected.sourceSystem || envelope.eventType !== expected.eventType) {
      throw new Error('Source system or canonical event type does not match this endpoint');
    }
    try {
      assertPrivacySafe(envelope, 'sourceEvent');
    } catch (error) {
      await this.recordRejectedAttempt(envelope.sourceSystem, envelope.sourceEventId);
      throw error;
    }

    const approvedPayloadHash = hash(canonicalJson(envelope.payload));
    const operationId = `integration-${hash(eventKey(envelope.sourceSystem, envelope.sourceEventId)).slice(0, 32)}`;
    const pool = this.ledger.getOperationalPool();
    return pool
      ? this.ingestPostgres(pool, envelope, expected.endpointFamily, approvedPayloadHash, operationId)
      : this.ingestFile(envelope, expected.endpointFamily, approvedPayloadHash, operationId);
  }

  async list(): Promise<IntegrationEventResult[]> {
    const pool = this.ledger.getOperationalPool();
    if (pool) {
      const result = await pool.query(
        `SELECT source_system, source_event_id, schema_version, occurred_at, ingested_at,
                approved_payload_hash, operation_id, status, entity_type, entity_id,
                parent_source_event_id, amendment_of_source_event_id, reversal_of_source_event_id
           FROM integration_events ORDER BY ingested_at DESC`
      );
      return result.rows.map((row) => this.rowResult(row));
    }
    await this.loadFile();
    return [...this.memory.values()].map(({ envelope: _envelope, endpointFamily: _family, ...result }) => result);
  }

  async health(): Promise<IntegrationSourceHealth[]> {
    const events = await this.list();
    const pool = this.ledger.getOperationalPool();
    const attemptCounts = new Map<string, Record<string, number>>();
    if (pool) {
      const attempts = await pool.query(
        `SELECT source_system, disposition, COUNT(*)::int AS count
         FROM integration_event_attempts GROUP BY source_system, disposition`
      );
      for (const row of attempts.rows) {
        const sourceSystem = String(row.source_system);
        const counts = attemptCounts.get(sourceSystem) ?? {};
        counts[String(row.disposition)] = Number(row.count);
        attemptCounts.set(sourceSystem, counts);
      }
    }
    const systems = new Set([
      ...events.map((event) => event.provenance.sourceSystem),
      ...this.attempts.map((attempt) => attempt.sourceSystem),
      ...[...attemptCounts.keys()].map((sourceSystem) => sourceSystem as SourceSystem)
    ]);
    return [...systems].sort().map((sourceSystem) => {
      const sourceEvents = events.filter((event) => event.provenance.sourceSystem === sourceSystem);
      const fileCounts = this.attempts
        .filter((attempt) => attempt.sourceSystem === sourceSystem)
        .reduce<Record<string, number>>((acc, attempt) => {
          acc[attempt.disposition] = (acc[attempt.disposition] ?? 0) + 1;
          return acc;
        }, {});
      const counts = attemptCounts.get(sourceSystem) ?? (
        Object.keys(fileCounts).length > 0
          ? fileCounts
          : sourceEvents.reduce<Record<string, number>>((acc, event) => {
              acc[event.provenance.status] = (acc[event.provenance.status] ?? 0) + 1;
              return acc;
            }, {})
      );
      const lastSuccessAt = sourceEvents
        .filter((event) => !['CONFLICTED', 'REJECTED', 'QUARANTINED'].includes(event.provenance.status))
        .map((event) => event.provenance.ingestedAt)
        .sort()
        .at(-1) ?? null;
      const unreconciledOccurred = sourceEvents
        .filter((event) => !['RECONCILED', 'QUARANTINED'].includes(event.provenance.status))
        .map((event) => new Date(event.provenance.occurredAt).getTime());
      return {
        sourceSystem,
        lastSuccessAt,
        counts,
        reconciliationLagSeconds: unreconciledOccurred.length
          ? Math.max(0, Math.floor((Date.now() - Math.min(...unreconciledOccurred)) / 1000))
          : null,
        unresolvedParentAgeSeconds: this.oldestQuarantineAge(sourceEvents),
        schemaVersions: [...new Set(sourceEvents.map((event) => event.provenance.schemaVersion))].sort()
      };
    });
  }

  async trace(sourceSystem: SourceSystem, sourceEventId: string): Promise<IntegrationEventTrace> {
    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      await this.loadFile();
      const stored = this.memory.get(eventKey(sourceSystem, sourceEventId));
      if (!stored) throw new NotFoundException('Integration event not found');
      return {
        event: this.storedResult(stored),
        proof: { eventId: stored.provenance.operationId, status: 'DEMO_RECORDED' }
      };
    }
    const result = await pool.query(
      `SELECT event.*, outbox.status AS proof_status, outbox.fabric_tx_id, outbox.committed_at
       FROM integration_events event
       LEFT JOIN ledger_outbox outbox ON outbox.event_id = event.operation_id
       WHERE event.source_system = $1 AND event.source_event_id = $2`,
      [sourceSystem, sourceEventId]
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Integration event not found');
    return {
      event: this.rowResult(row),
      proof: {
        eventId: String(row.operation_id),
        status: String(row.proof_status ?? 'PENDING'),
        ...(row.fabric_tx_id == null ? {} : { fabricTxId: String(row.fabric_tx_id) }),
        ...(row.committed_at == null ? {} : { committedAt: new Date(String(row.committed_at)).toISOString() })
      }
    };
  }

  async reconcile(): Promise<IntegrationReconciliationSummary> {
    const events = await this.reconciliationEvents();
    const eligible = events.filter((event) => event.provenance.status !== 'QUARANTINED');
    const exceptions: IntegrationReconciliationException[] = [];
    const reconciled = new Set<string>();
    const allocations = eligible.filter((event) => event.envelope.eventType === 'ALLOCATION');
    const movements = eligible.filter((event) => event.envelope.eventType === 'MOVEMENT');

    for (const allocation of allocations) {
      const expectedKg = this.quantity(allocation.envelope.payload, 'quantityKg', 'allocatedQtyKg');
      if (expectedKg === undefined) continue;
      const linked = movements.filter((movement) =>
        movement.parentSourceEventId === allocation.provenance.sourceEventId ||
        movement.envelope.payload.allocationSourceEventId === allocation.provenance.sourceEventId ||
        (
          allocation.entityId !== undefined &&
          movement.envelope.payload.allocationId === allocation.entityId
        )
      );
      const actualKg = linked.reduce(
        (total, movement) => total + (this.quantity(movement.envelope.payload, 'quantityKg', 'dispatchedQtyKg') ?? 0),
        0
      );
      if (linked.length > 0 && actualKg === expectedKg) {
        reconciled.add(eventKey(allocation.provenance.sourceSystem, allocation.provenance.sourceEventId));
        linked.forEach((movement) =>
          reconciled.add(eventKey(movement.provenance.sourceSystem, movement.provenance.sourceEventId))
        );
      } else if (linked.length > 0) {
        exceptions.push({
          kind: 'ALLOCATION_MOVEMENT',
          entityId: allocation.entityId ?? allocation.provenance.sourceEventId,
          expectedKg,
          actualKg,
          differenceKg: expectedKg - actualKg,
          sourceEventIds: [allocation.provenance.sourceEventId, ...linked.map((item) => item.provenance.sourceEventId)]
        });
      }
    }

    for (const movement of movements) {
      const dispatchedKg = this.quantity(movement.envelope.payload, 'quantityKg', 'dispatchedQtyKg');
      const receivedKg = this.quantity(movement.envelope.payload, 'receivedQuantityKg', 'receivedQtyKg');
      const adjustmentKg = this.quantity(movement.envelope.payload, 'adjustmentQuantityKg', 'adjustmentKg') ?? 0;
      if (dispatchedKg === undefined || receivedKg === undefined) continue;
      if (dispatchedKg === receivedKg + adjustmentKg) {
        reconciled.add(eventKey(movement.provenance.sourceSystem, movement.provenance.sourceEventId));
      } else {
        exceptions.push({
          kind: 'MOVEMENT_RECEIPT',
          entityId: movement.entityId ?? movement.provenance.sourceEventId,
          expectedKg: dispatchedKg,
          actualKg: receivedKg + adjustmentKg,
          differenceKg: dispatchedKg - receivedKg - adjustmentKg,
          sourceEventIds: [movement.provenance.sourceEventId]
        });
      }
    }

    for (const event of eligible) {
      const payload = event.envelope.payload;
      const opening = this.quantity(payload, 'openingStockKg');
      const closing = this.quantity(payload, 'closingStockKg');
      if (opening === undefined || closing === undefined) continue;
      const expectedClosing =
        opening +
        (this.quantity(payload, 'receiptsKg') ?? 0) -
        (this.quantity(payload, 'distributionsKg') ?? 0) -
        (this.quantity(payload, 'adjustmentsKg') ?? 0);
      if (expectedClosing === closing) {
        reconciled.add(eventKey(event.provenance.sourceSystem, event.provenance.sourceEventId));
      } else {
        exceptions.push({
          kind: 'FPS_CLOSING_STOCK',
          entityId: event.entityId ?? event.provenance.sourceEventId,
          expectedKg: expectedClosing,
          actualKg: closing,
          differenceKg: expectedClosing - closing,
          sourceEventIds: [event.provenance.sourceEventId]
        });
      }
    }

    await this.persistReconciliation(reconciled, exceptions);
    return {
      checkedAt: new Date().toISOString(),
      checkedEvents: eligible.length,
      reconciledEvents: reconciled.size,
      exceptions
    };
  }

  private async assertAuthorizedSource(
    request: AuthenticatedRequest | undefined,
    sourceSystem: SourceSystem,
    endpointFamily: string,
    eventType: SourceEventEnvelope['eventType']
  ): Promise<void> {
    const identity = request?.user;
    if (!identity?.roles.includes('integration-service')) {
      throw new ForbiddenException('Integration service identity is required');
    }
    const sources = stringArrayClaim(identity.claims.pds_source_systems);
    const families = stringArrayClaim(identity.claims.pds_endpoint_families);
    const eventTypes = stringArrayClaim(identity.claims.pds_event_types);
    if (!sources.includes(sourceSystem) || !families.includes(endpointFamily) || !eventTypes.includes(eventType)) {
      throw new ForbiddenException('Integration identity is not assigned to this source contract');
    }
    await this.durableAuthorization?.assertIntegrationContract(identity, sourceSystem, endpointFamily, eventType);
  }

  private buildStored(
    envelope: SourceEventEnvelope,
    endpointFamily: string,
    approvedPayloadHash: string,
    operationId: string,
    status: SourceProvenance['status'],
    ingestedAt = new Date().toISOString()
  ): StoredIntegrationEvent {
    const entityType = typeof envelope.payload.entityType === 'string' ? envelope.payload.entityType : undefined;
    const entityId = typeof envelope.payload.entityId === 'string' ? envelope.payload.entityId : undefined;
    return {
      provenance: {
        sourceSystem: envelope.sourceSystem,
        sourceEventId: envelope.sourceEventId,
        schemaVersion: envelope.schemaVersion,
        occurredAt: envelope.occurredAt,
        ingestedAt,
        approvedPayloadHash,
        operationId,
        status
      },
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(envelope.parentSourceEventId ? { parentSourceEventId: envelope.parentSourceEventId } : {}),
      ...(envelope.amendmentOfSourceEventId ? { amendmentOfSourceEventId: envelope.amendmentOfSourceEventId } : {}),
      ...(envelope.reversalOfSourceEventId ? { reversalOfSourceEventId: envelope.reversalOfSourceEventId } : {}),
      envelope,
      endpointFamily
    };
  }

  private async ingestFile(
    envelope: SourceEventEnvelope,
    endpointFamily: string,
    approvedPayloadHash: string,
    operationId: string
  ): Promise<IngestionOutcome> {
    let outcome!: IngestionOutcome;
    this.fileQueue = this.fileQueue.then(async () => {
      await this.loadFile();
      const key = eventKey(envelope.sourceSystem, envelope.sourceEventId);
      const existing = this.memory.get(key);
      if (existing) {
        const existingResult = this.storedResult(existing);
        const identical = existing.provenance.approvedPayloadHash === approvedPayloadHash;
        this.attempts.push({
          sourceSystem: envelope.sourceSystem,
          disposition: identical ? 'DUPLICATE' : 'CONFLICTED',
          attemptedAt: new Date().toISOString()
        });
        await this.saveFile();
        outcome = identical
          ? { disposition: 'DUPLICATE', result: existingResult }
          : { disposition: 'CONFLICT', result: { ...existingResult, provenance: { ...existingResult.provenance, status: 'CONFLICTED' } } };
        return;
      }
      const parentMissing = referencedEventIds(envelope).some(
        (sourceEventId) => !this.memory.has(eventKey(envelope.sourceSystem, sourceEventId))
      );
      const stored = this.buildStored(
        envelope,
        endpointFamily,
        approvedPayloadHash,
        operationId,
        parentMissing ? 'QUARANTINED' : 'ACCEPTED'
      );
      this.memory.set(key, stored);
      this.attempts.push({
        sourceSystem: envelope.sourceSystem,
        disposition: parentMissing ? 'QUARANTINED' : 'ACCEPTED',
        attemptedAt: new Date().toISOString()
      });
      if (!parentMissing) this.recoverMemoryChildren(envelope.sourceSystem, envelope.sourceEventId);
      await this.saveFile();
      outcome = { disposition: parentMissing ? 'QUARANTINED' : 'NEW', result: this.storedResult(stored) };
    });
    await this.fileQueue;
    return outcome;
  }

  private async ingestPostgres(
    pool: Pool,
    envelope: SourceEventEnvelope,
    endpointFamily: string,
    approvedPayloadHash: string,
    operationId: string
  ): Promise<IngestionOutcome> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [eventKey(envelope.sourceSystem, envelope.sourceEventId)]
      );
      const existing = await client.query(
        'SELECT * FROM integration_events WHERE source_system = $1 AND source_event_id = $2 FOR UPDATE',
        [envelope.sourceSystem, envelope.sourceEventId]
      );
      if (existing.rows[0]) {
        const identical = existing.rows[0].approved_payload_hash === approvedPayloadHash;
        await client.query(
          `INSERT INTO integration_event_attempts
             (source_system, source_event_id, approved_payload_hash, disposition)
           VALUES ($1, $2, $3, $4)`,
          [envelope.sourceSystem, envelope.sourceEventId, approvedPayloadHash, identical ? 'DUPLICATE' : 'CONFLICTED']
        );
        if (!identical) {
          await client.query(
            `INSERT INTO audit_alerts
               (alert_id, alert_type, entity_id, risk_level, message, status, evidence, created_at)
             VALUES ($1, 'DB_LEDGER_MISMATCH', $2, 'HIGH', $3, 'OPEN', $4::jsonb, NOW())
             ON CONFLICT (alert_id) DO NOTHING`,
            [
              `INTEGRATION-CONFLICT-${operationId}`,
              envelope.sourceEventId,
              'Conflicting source-event replay was rejected',
              JSON.stringify({ sourceSystem: envelope.sourceSystem, sourceEventIdHash: hash(envelope.sourceEventId) })
            ]
          );
        }
        await client.query('COMMIT');
        const result = this.rowResult(existing.rows[0]);
        if (!identical) result.provenance.status = 'CONFLICTED';
        return { disposition: identical ? 'DUPLICATE' : 'CONFLICT', result };
      }

      let parentMissing = false;
      for (const sourceEventId of referencedEventIds(envelope)) {
        if (!(await this.parentExists(client, envelope.sourceSystem, sourceEventId))) {
          parentMissing = true;
          break;
        }
      }
      const status = parentMissing ? 'QUARANTINED' : 'ACCEPTED';
      const stored = this.buildStored(envelope, endpointFamily, approvedPayloadHash, operationId, status);
      const inserted = await client.query(
        `INSERT INTO integration_events
           (source_system, source_event_id, event_type, schema_version, occurred_at, device_sync_at,
            approved_payload_hash, operation_id, status, endpoint_family, normalized_payload,
            entity_type, entity_id, parent_source_event_id, amendment_of_source_event_id,
            reversal_of_source_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
          envelope.sourceSystem, envelope.sourceEventId, envelope.eventType, envelope.schemaVersion,
          envelope.occurredAt, envelope.deviceSyncAt ?? null, approvedPayloadHash, operationId, status,
          endpointFamily, JSON.stringify(envelope.payload), stored.entityType ?? null, stored.entityId ?? null,
          envelope.parentSourceEventId ?? null, envelope.amendmentOfSourceEventId ?? null,
          envelope.reversalOfSourceEventId ?? null
        ]
      );
      await client.query(
        `INSERT INTO integration_event_attempts
           (source_system, source_event_id, approved_payload_hash, disposition)
         VALUES ($1, $2, $3, $4)`,
        [envelope.sourceSystem, envelope.sourceEventId, approvedPayloadHash, status]
      );
      if (!parentMissing) {
        await client.query(
          `UPDATE integration_events child SET status = 'ACCEPTED', processed_at = NOW()
            WHERE child.source_system = $1
              AND (
                child.parent_source_event_id = $2 OR
                child.amendment_of_source_event_id = $2 OR
                child.reversal_of_source_event_id = $2
              )
              AND child.status = 'QUARANTINED'
              AND (
                child.parent_source_event_id IS NULL OR EXISTS (
                  SELECT 1 FROM integration_events parent
                  WHERE parent.source_system = child.source_system
                    AND parent.source_event_id = child.parent_source_event_id
                )
              )
              AND (
                child.amendment_of_source_event_id IS NULL OR EXISTS (
                  SELECT 1 FROM integration_events amended
                  WHERE amended.source_system = child.source_system
                    AND amended.source_event_id = child.amendment_of_source_event_id
                )
              )
              AND (
                child.reversal_of_source_event_id IS NULL OR EXISTS (
                  SELECT 1 FROM integration_events reversed
                  WHERE reversed.source_system = child.source_system
                    AND reversed.source_event_id = child.reversal_of_source_event_id
                )
              )`,
          [envelope.sourceSystem, envelope.sourceEventId]
        );
      }
      const ledgerEvent = {
        ledgerTxId: operationId,
        entityType: 'workflow',
        entityId: stored.entityId ?? envelope.sourceEventId,
        eventType: envelope.eventType,
        payload: {
          sourceSystem: envelope.sourceSystem,
          sourceEventIdHash: hash(envelope.sourceEventId),
          approvedPayloadHash,
          operationId,
          status
        },
        timestamp: envelope.occurredAt
      };
      await client.query(
        `INSERT INTO ledger_events
           (ledger_tx_id, entity_type, entity_id, event_type, payload, timestamp)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (ledger_tx_id) DO NOTHING`,
        [
          operationId,
          ledgerEvent.entityType,
          ledgerEvent.entityId,
          ledgerEvent.eventType,
          JSON.stringify(ledgerEvent.payload),
          ledgerEvent.timestamp
        ]
      );
      await client.query(
        `INSERT INTO ledger_outbox
           (event_id, operation_id, idempotency_key, schema_version, event_payload, status)
         VALUES ($1, $2, $3, 1, $4::jsonb, 'PENDING')
         ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
        [
          operationId, operationId, eventKey(envelope.sourceSystem, envelope.sourceEventId),
          JSON.stringify(ledgerEvent)
        ]
      );
      await client.query('COMMIT');
      return { disposition: parentMissing ? 'QUARANTINED' : 'NEW', result: this.rowResult(inserted.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async parentExists(client: PoolClient, sourceSystem: SourceSystem, sourceEventId: string): Promise<boolean> {
    const result = await client.query(
      'SELECT 1 FROM integration_events WHERE source_system = $1 AND source_event_id = $2',
      [sourceSystem, sourceEventId]
    );
    return Boolean(result.rowCount);
  }

  private async reconciliationEvents(): Promise<ReconciliationEvent[]> {
    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      await this.loadFile();
      return [...this.memory.values()];
    }
    const result = await pool.query(
      `SELECT source_system, source_event_id, event_type, schema_version, occurred_at,
              device_sync_at, ingested_at, approved_payload_hash, operation_id, status,
              endpoint_family, normalized_payload, entity_type, entity_id,
              parent_source_event_id, amendment_of_source_event_id, reversal_of_source_event_id
       FROM integration_events`
    );
    return result.rows.map((row) => {
      const payload = (
        typeof row.normalized_payload === 'string'
          ? JSON.parse(row.normalized_payload)
          : row.normalized_payload
      ) as Record<string, unknown>;
      const resultView = this.rowResult(row);
      return {
        ...resultView,
        envelope: {
          sourceSystem: resultView.provenance.sourceSystem,
          sourceEventId: resultView.provenance.sourceEventId,
          eventType: String(row.event_type) as SourceEventEnvelope['eventType'],
          schemaVersion: resultView.provenance.schemaVersion,
          occurredAt: resultView.provenance.occurredAt,
          ...(row.device_sync_at == null ? {} : { deviceSyncAt: new Date(String(row.device_sync_at)).toISOString() }),
          ...(resultView.parentSourceEventId ? { parentSourceEventId: resultView.parentSourceEventId } : {}),
          ...(resultView.amendmentOfSourceEventId ? { amendmentOfSourceEventId: resultView.amendmentOfSourceEventId } : {}),
          ...(resultView.reversalOfSourceEventId ? { reversalOfSourceEventId: resultView.reversalOfSourceEventId } : {}),
          payload
        },
        endpointFamily: String(row.endpoint_family)
      };
    });
  }

  private async recordRejectedAttempt(sourceSystem: SourceSystem, sourceEventId: string): Promise<void> {
    const pool = this.ledger.getOperationalPool();
    if (pool) {
      await pool.query(
        `INSERT INTO integration_event_attempts
           (source_system, source_event_id, approved_payload_hash, disposition)
         VALUES ($1, $2, $3, 'REJECTED')`,
        [sourceSystem, `rejected-${hash(sourceEventId)}`, hash('privacy-rejected')]
      );
      return;
    }
    this.fileQueue = this.fileQueue.then(async () => {
      await this.loadFile();
      this.attempts.push({ sourceSystem, disposition: 'REJECTED', attemptedAt: new Date().toISOString() });
      await this.saveFile();
    });
    await this.fileQueue;
  }

  private quantity(payload: Record<string, unknown>, ...keys: string[]): number | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
    }
    return undefined;
  }

  private async persistReconciliation(
    reconciled: Set<string>,
    exceptions: IntegrationReconciliationException[]
  ): Promise<void> {
    const pool = this.ledger.getOperationalPool();
    if (!pool) {
      for (const key of reconciled) {
        const event = this.memory.get(key);
        if (event) event.provenance.status = 'RECONCILED';
      }
      await this.saveFile();
      return;
    }

    const client = await pool.connect();
    const safeExceptions = exceptions.map((exception) => ({
      ...exception,
      sourceEventIds: exception.sourceEventIds.map((sourceEventId) => hash(sourceEventId))
    }));
    const reconciliationId = `reconciliation-${hash(canonicalJson({
      reconciled: [...reconciled].sort(),
      exceptions: safeExceptions
    })).slice(0, 40)}`;
    const timestamp = new Date().toISOString();
    try {
      await client.query('BEGIN');
      for (const key of reconciled) {
        const separator = key.indexOf(':');
        await client.query(
          `UPDATE integration_events SET status = 'RECONCILED', processed_at = NOW()
           WHERE source_system = $1 AND source_event_id = $2 AND status <> 'QUARANTINED'`,
          [key.slice(0, separator), key.slice(separator + 1)]
        );
      }
      for (const exception of safeExceptions) {
        const alertId = `INTEGRATION-RECON-${hash(canonicalJson(exception)).slice(0, 32)}`;
        await client.query(
          `INSERT INTO audit_alerts
             (alert_id, alert_type, entity_id, risk_level, message, status, evidence, created_at)
           VALUES ($1, $2, $3, 'HIGH', $4, 'OPEN', $5::jsonb, $6)
           ON CONFLICT (alert_id) DO NOTHING`,
          [
            alertId,
            exception.kind === 'FPS_CLOSING_STOCK' ? 'FPS_CLOSING_STOCK_MISMATCH' : 'DB_LEDGER_MISMATCH',
            exception.entityId,
            `Integration reconciliation detected ${exception.kind}`,
            JSON.stringify(exception),
            timestamp
          ]
        );
      }
      const ledgerEvent = {
        ledgerTxId: reconciliationId,
        entityType: 'workflow',
        entityId: reconciliationId,
        eventType: 'IntegrationReconciliation',
        payload: {
          checkedEvents: reconciled.size + exceptions.length,
          reconciledEvents: reconciled.size,
          exceptionCount: exceptions.length,
          exceptionDigest: hash(canonicalJson(safeExceptions))
        },
        timestamp
      };
      await client.query(
        `INSERT INTO ledger_events
           (ledger_tx_id, entity_type, entity_id, event_type, payload, timestamp)
         VALUES ($1, 'workflow', $1, 'IntegrationReconciliation', $2::jsonb, $3)
         ON CONFLICT (ledger_tx_id) DO NOTHING`,
        [reconciliationId, JSON.stringify(ledgerEvent.payload), timestamp]
      );
      await client.query(
        `INSERT INTO ledger_outbox
           (event_id, operation_id, idempotency_key, schema_version, event_payload, status)
         VALUES ($1, $1, $1, 1, $2::jsonb, 'PENDING')
         ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
        [reconciliationId, JSON.stringify(ledgerEvent)]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private rowResult(row: Record<string, unknown>): IntegrationEventResult {
    return {
      provenance: {
        sourceSystem: String(row.source_system) as SourceSystem,
        sourceEventId: String(row.source_event_id),
        schemaVersion: String(row.schema_version),
        occurredAt: new Date(String(row.occurred_at)).toISOString(),
        ingestedAt: new Date(String(row.ingested_at)).toISOString(),
        approvedPayloadHash: String(row.approved_payload_hash),
        operationId: String(row.operation_id),
        status: String(row.status) as SourceProvenance['status']
      },
      ...(row.entity_type == null ? {} : { entityType: String(row.entity_type) }),
      ...(row.entity_id == null ? {} : { entityId: String(row.entity_id) }),
      ...(row.parent_source_event_id == null ? {} : { parentSourceEventId: String(row.parent_source_event_id) }),
      ...(row.amendment_of_source_event_id == null ? {} : { amendmentOfSourceEventId: String(row.amendment_of_source_event_id) }),
      ...(row.reversal_of_source_event_id == null ? {} : { reversalOfSourceEventId: String(row.reversal_of_source_event_id) })
    };
  }

  private storedResult(stored: StoredIntegrationEvent): IntegrationEventResult {
    return {
      provenance: stored.provenance,
      ...(stored.entityType ? { entityType: stored.entityType } : {}),
      ...(stored.entityId ? { entityId: stored.entityId } : {}),
      ...(stored.parentSourceEventId ? { parentSourceEventId: stored.parentSourceEventId } : {}),
      ...(stored.amendmentOfSourceEventId ? { amendmentOfSourceEventId: stored.amendmentOfSourceEventId } : {}),
      ...(stored.reversalOfSourceEventId ? { reversalOfSourceEventId: stored.reversalOfSourceEventId } : {})
    };
  }

  private statePath(): string {
    return process.env.PDS_INTEGRATION_STATE_PATH?.trim()
      || resolve(dirname(process.env.PDS_STATE_PATH?.trim() || resolve(process.cwd(), '../../tmp/pds-state.json')), 'integration-events.json');
  }

  private async loadFile(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.statePath(), 'utf8')) as
        | StoredIntegrationEvent[]
        | { events: StoredIntegrationEvent[]; attempts?: IntegrationAttempt[] };
      const events = Array.isArray(parsed) ? parsed : parsed.events;
      this.memory = new Map(events.map((item) => [eventKey(item.provenance.sourceSystem, item.provenance.sourceEventId), item]));
      this.attempts = Array.isArray(parsed) ? [] : (parsed.attempts ?? []);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async saveFile(): Promise<void> {
    const path = this.statePath();
    const temporaryPath = `${path}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ events: [...this.memory.values()], attempts: this.attempts }, null, 2)}\n`,
      'utf8'
    );
    await rename(temporaryPath, path);
  }

  private recoverMemoryChildren(sourceSystem: SourceSystem, sourceEventId: string): void {
    for (const child of this.memory.values()) {
      if (
        child.provenance.sourceSystem === sourceSystem &&
        referencedEventIds(child.envelope).includes(sourceEventId) &&
        referencedEventIds(child.envelope).every((reference) =>
          this.memory.has(eventKey(sourceSystem, reference))
        ) &&
        child.provenance.status === 'QUARANTINED'
      ) {
        child.provenance.status = 'ACCEPTED';
      }
    }
  }

  private oldestQuarantineAge(events: IntegrationEventResult[]): number | null {
    const times = events
      .filter((event) => event.provenance.status === 'QUARANTINED')
      .map((event) => new Date(event.provenance.ingestedAt).getTime());
    return times.length === 0 ? null : Math.max(0, Math.floor((Date.now() - Math.min(...times)) / 1000));
  }
}
