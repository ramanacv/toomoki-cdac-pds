import { ConflictException, Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type {
  BeneficiaryLifecycleEvent,
  BeneficiaryLifecycleEventResult,
  BeneficiaryRegistryProjection,
  BeneficiaryRegistrySummary
} from '@pds/shared-types';

export const BENEFICIARY_REGISTRY_DB_POOL = Symbol('BENEFICIARY_REGISTRY_DB_POOL');
type RegistryPool = Pick<Pool, 'connect' | 'end'>;
const sha256 = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

type StoredEvent = {
  event: BeneficiaryLifecycleEvent;
  requestHash: string;
  projection: BeneficiaryRegistryProjection;
  proofEventId: string;
};

@Injectable()
export class BeneficiaryRegistryRepository implements OnModuleDestroy {
  private readonly pool: RegistryPool | undefined;
  private readonly memoryEvents = new Map<string, StoredEvent>();
  private readonly memoryProjection = new Map<string, BeneficiaryRegistryProjection>();

  constructor(@Optional() @Inject(BENEFICIARY_REGISTRY_DB_POOL) injectedPool?: RegistryPool) {
    this.pool = injectedPool ??
      (process.env.PDS_PERSISTENCE_BACKEND === 'postgres' && process.env.PDS_POSTGRES_DSN
        ? new Pool({ connectionString: process.env.PDS_POSTGRES_DSN, max: 2 })
        : undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  async apply(event: BeneficiaryLifecycleEvent): Promise<BeneficiaryLifecycleEventResult> {
    const requestHash = sha256(event);
    return this.pool
      ? this.applyPostgres(event, requestHash)
      : this.applyMemory(event, requestHash);
  }

  async summary(): Promise<BeneficiaryRegistrySummary> {
    if (!this.pool) return this.buildSummary([...this.memoryProjection.values()], [...this.memoryEvents.values()].map((item) => item.event));
    const client = await this.pool.connect();
    try {
      const [projections, events] = await Promise.all([
        client.query(
          `SELECT projection.*,
                  CASE WHEN outbox.status = 'SUBMITTING' THEN 'PENDING'
                       ELSE COALESCE(outbox.status, projection.proof_status)
                  END AS resolved_proof_status
             FROM beneficiary_registry_projection projection
             LEFT JOIN beneficiary_lifecycle_events event
               ON event.event_id = projection.last_event_id
             LEFT JOIN ledger_outbox outbox
               ON outbox.event_id = event.proof_event_id
            ORDER BY projection.beneficiary_ref_hash`
        ),
        client.query('SELECT event_payload FROM beneficiary_lifecycle_events ORDER BY effective_at, event_id')
      ]);
      return this.buildSummary(
        projections.rows.map((row) => this.mapProjection(row)),
        events.rows.map((row) => row.event_payload as BeneficiaryLifecycleEvent)
      );
    } finally {
      client.release();
    }
  }

  private applyMemory(event: BeneficiaryLifecycleEvent, requestHash: string): BeneficiaryLifecycleEventResult {
    const prior = this.memoryEvents.get(event.eventId);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ConflictException('eventId was reused with different lifecycle content');
      return { disposition: 'REPLAY', event: prior.event, projection: prior.projection, proofEventId: prior.proofEventId };
    }
    const projection = this.nextProjection(event, this.memoryProjection.get(event.beneficiaryRefHash));
    const proofEventId = this.proofEventId(event.eventId);
    this.memoryProjection.set(event.beneficiaryRefHash, projection);
    this.memoryEvents.set(event.eventId, { event, requestHash, projection, proofEventId });
    return { disposition: 'NEW', event, projection, proofEventId };
  }

  private async applyPostgres(event: BeneficiaryLifecycleEvent, requestHash: string): Promise<BeneficiaryLifecycleEventResult> {
    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');
      const priorEvent = await client.query(
        'SELECT request_hash, event_payload, projection_snapshot, proof_event_id FROM beneficiary_lifecycle_events WHERE event_id = $1 FOR UPDATE',
        [event.eventId]
      );
      if (priorEvent.rows[0]) {
        if (String(priorEvent.rows[0].request_hash) !== requestHash) {
          throw new ConflictException('eventId was reused with different lifecycle content');
        }
        await client.query('COMMIT');
        return {
          disposition: 'REPLAY',
          event: priorEvent.rows[0].event_payload as BeneficiaryLifecycleEvent,
          projection: priorEvent.rows[0].projection_snapshot as BeneficiaryRegistryProjection,
          proofEventId: String(priorEvent.rows[0].proof_event_id)
        };
      }
      const current = await client.query(
        'SELECT * FROM beneficiary_registry_projection WHERE beneficiary_ref_hash = $1 FOR UPDATE',
        [event.beneficiaryRefHash]
      );
      const projection = this.nextProjection(event, current.rows[0] ? this.mapProjection(current.rows[0]) : undefined);
      const proofEventId = this.proofEventId(event.eventId);
      await this.writeProjection(client, projection);
      await client.query(
        `INSERT INTO beneficiary_lifecycle_events
          (event_id, request_hash, beneficiary_ref_hash, ration_card_hash, event_type, source_system,
           occurred_at, effective_at, reason_code, policy_id, evidence_digest, event_payload,
           projection_snapshot, proof_event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14)`,
        [
          event.eventId, requestHash, event.beneficiaryRefHash, event.rationCardHash, event.eventType,
          event.sourceSystem, event.occurredAt, event.effectiveAt, event.reasonCode, event.policyId,
          event.evidenceDigest, JSON.stringify(event), JSON.stringify(projection), proofEventId
        ]
      );
      const proof = this.proofEvent(event, projection, proofEventId);
      await client.query(
        `INSERT INTO ledger_events (ledger_tx_id, entity_type, entity_id, event_type, payload, timestamp)
         VALUES ($1,'beneficiary-registry',$2,$3,$4::jsonb,$5)
         ON CONFLICT (ledger_tx_id) DO NOTHING`,
        [proofEventId, event.beneficiaryRefHash, event.eventType, JSON.stringify(proof.payload), event.effectiveAt]
      );
      await client.query(
        `INSERT INTO ledger_outbox
          (event_id, operation_id, idempotency_key, schema_version, event_payload, status)
         VALUES ($1,$1,$2,1,$3::jsonb,'PENDING')
         ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
        [proofEventId, event.eventId, JSON.stringify(proof)]
      );
      await client.query('COMMIT');
      return { disposition: 'NEW', event, projection, proofEventId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private nextProjection(
    event: BeneficiaryLifecycleEvent,
    current?: BeneficiaryRegistryProjection
  ): BeneficiaryRegistryProjection {
    if (!current && event.eventType !== 'BENEFICIARY_CREATED') {
      throw new ConflictException('The first lifecycle event must create the beneficiary registry record');
    }
    if (current && event.eventType === 'BENEFICIARY_CREATED') {
      throw new ConflictException('Beneficiary registry record already exists');
    }
    if (event.priorState && current && event.priorState !== current.state) {
      throw new ConflictException(`Expected beneficiary state ${event.priorState}, current state is ${current.state}`);
    }
    const delta = event.householdSizeDelta ?? 0;
    if (event.eventType === 'BENEFICIARY_CREATED' && delta <= 0) {
      throw new ConflictException('BENEFICIARY_CREATED requires a positive householdSizeDelta');
    }
    if (event.eventType === 'MEMBER_ADDED' && delta <= 0) {
      throw new ConflictException('MEMBER_ADDED requires a positive householdSizeDelta');
    }
    if (event.eventType === 'MEMBER_REMOVED' && delta >= 0) {
      throw new ConflictException('MEMBER_REMOVED requires a negative householdSizeDelta');
    }
    const householdSize = (current?.householdSize ?? 0) + delta;
    if (householdSize < 0) throw new ConflictException('Lifecycle event would make household size negative');
    const state = event.eventType === 'RECORD_DEACTIVATED'
      ? 'DEACTIVATED'
      : event.newState ?? current?.state ?? 'ACTIVE';
    return {
      beneficiaryRefHash: event.beneficiaryRefHash,
      rationCardHash: event.rationCardHash,
      districtCode: event.districtCode ?? current?.districtCode ?? 'UNSPECIFIED',
      householdSize,
      state,
      version: (current?.version ?? 0) + 1,
      lastEventId: event.eventId,
      updatedAt: event.effectiveAt,
      proofStatus: 'PENDING'
    };
  }

  private async writeProjection(client: PoolClient, projection: BeneficiaryRegistryProjection): Promise<void> {
    const written = await client.query(
      `INSERT INTO beneficiary_registry_projection
        (beneficiary_ref_hash, ration_card_hash, district_code, household_size, state, version,
         last_event_id, updated_at, proof_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (beneficiary_ref_hash) DO UPDATE SET
         ration_card_hash=EXCLUDED.ration_card_hash, district_code=EXCLUDED.district_code,
         household_size=EXCLUDED.household_size, state=EXCLUDED.state, version=EXCLUDED.version,
         last_event_id=EXCLUDED.last_event_id, updated_at=EXCLUDED.updated_at,
         proof_status=EXCLUDED.proof_status
       WHERE beneficiary_registry_projection.version = EXCLUDED.version - 1
       RETURNING version`,
      [
        projection.beneficiaryRefHash, projection.rationCardHash, projection.districtCode,
        projection.householdSize, projection.state, projection.version, projection.lastEventId,
        projection.updatedAt, projection.proofStatus
      ]
    );
    if (written.rowCount !== 1) throw new ConflictException('Beneficiary registry record changed concurrently');
  }

  private proofEventId(eventId: string): string {
    return `BEN-LIFECYCLE-${sha256(eventId).slice(0, 32)}`;
  }

  private proofEvent(event: BeneficiaryLifecycleEvent, projection: BeneficiaryRegistryProjection, proofEventId: string) {
    return {
      ledgerTxId: proofEventId,
      entityType: 'beneficiary-registry',
      entityId: event.beneficiaryRefHash,
      eventType: event.eventType,
      payload: {
        lifecycleEventIdHash: sha256(event.eventId),
        beneficiaryRefHash: event.beneficiaryRefHash,
        rationCardHash: event.rationCardHash,
        eventType: event.eventType,
        sourceSystem: event.sourceSystem,
        reasonCode: event.reasonCode,
        policyId: event.policyId,
        evidenceDigest: event.evidenceDigest,
        effectiveAt: event.effectiveAt,
        priorState: event.priorState,
        newState: projection.state,
        priorVersion: projection.version - 1,
        newVersion: projection.version
      },
      timestamp: event.effectiveAt
    };
  }

  private mapProjection(row: Record<string, unknown>): BeneficiaryRegistryProjection {
    return {
      beneficiaryRefHash: String(row.beneficiary_ref_hash),
      rationCardHash: String(row.ration_card_hash),
      districtCode: String(row.district_code),
      householdSize: Number(row.household_size),
      state: String(row.state) as BeneficiaryRegistryProjection['state'],
      version: Number(row.version),
      lastEventId: String(row.last_event_id),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      proofStatus: String(row.resolved_proof_status ?? row.proof_status) as BeneficiaryRegistryProjection['proofStatus']
    };
  }

  private buildSummary(
    projections: BeneficiaryRegistryProjection[],
    events: BeneficiaryLifecycleEvent[]
  ): BeneficiaryRegistrySummary {
    const byEventType: BeneficiaryRegistrySummary['byEventType'] = {};
    for (const event of events) byEventType[event.eventType] = (byEventType[event.eventType] ?? 0) + 1;
    const active = projections.filter((item) => item.state === 'ACTIVE');
    return {
      activeRecords: active.length,
      activeHouseholdMembers: active.reduce((total, item) => total + item.householdSize, 0),
      lifecycleEvents: events.length,
      pendingProofs: projections.filter((item) => item.proofStatus === 'PENDING').length,
      byEventType,
      projections
    };
  }
}
