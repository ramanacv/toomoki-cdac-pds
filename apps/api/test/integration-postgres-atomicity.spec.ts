import { describe, expect, it, vi } from 'vitest';
import { CanonicalSourceEventType, SourceSystem } from '@pds/shared-types';
import { IntegrationEventsService } from '../src/modules/integrations/integration-events.service.js';
import type { AuthenticatedRequest } from '../src/modules/auth/identity-provider.js';

const request: AuthenticatedRequest = {
  headers: {},
  user: {
    subject: 'integration-subject',
    roles: ['integration-service'],
    claims: {
      pds_source_systems: 'STATE_SCM',
      pds_endpoint_families: 'scm',
      pds_event_types: 'ALLOCATION'
    }
  }
};

const envelope = {
  sourceSystem: SourceSystem.STATE_SCM,
  sourceEventId: 'PG-ATOMIC-1',
  eventType: CanonicalSourceEventType.ALLOCATION,
  schemaVersion: 'test-1',
  occurredAt: '2026-07-23T08:00:00.000Z',
  payload: { entityType: 'allocation', entityId: 'ALLOC-PG-1', quantityKg: 10 }
};

describe('PostgreSQL integration-event atomicity', () => {
  it('commits the source event, attempt, recovery update, and proof intent in one transaction', async () => {
    const queries: string[] = [];
    const row = {
      source_system: 'STATE_SCM', source_event_id: 'PG-ATOMIC-1', event_type: 'ALLOCATION',
      schema_version: 'test-1', occurred_at: envelope.occurredAt, ingested_at: envelope.occurredAt,
      approved_payload_hash: 'a'.repeat(64), operation_id: 'integration-test', status: 'ACCEPTED',
      entity_type: 'allocation', entity_id: 'ALLOC-PG-1'
    };
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql.trim());
        if (sql.includes('SELECT * FROM integration_events')) return { rows: [], rowCount: 0 };
        if (sql.includes('RETURNING *')) return { rows: [row], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn()
    };
    const pool = { connect: vi.fn(async () => client) };
    const ledger = { getOperationalPool: () => pool };
    const service = new IntegrationEventsService(ledger as never);
    await service.ingest(
      envelope,
      { sourceSystem: SourceSystem.STATE_SCM, eventType: CanonicalSourceEventType.ALLOCATION, endpointFamily: 'scm' },
      request
    );
    expect(queries[0]).toBe('BEGIN');
    expect(queries.some((sql) => sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO integration_events'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO integration_event_attempts'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO ledger_events'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO ledger_outbox'))).toBe(true);
    expect(queries.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back the entire ingestion when proof-intent insertion fails', async () => {
    const queries: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql.trim());
        if (sql.includes('SELECT * FROM integration_events')) return { rows: [], rowCount: 0 };
        if (sql.includes('RETURNING *')) {
          return {
            rows: [{
              source_system: 'STATE_SCM', source_event_id: 'PG-ATOMIC-1', schema_version: 'test-1',
              occurred_at: envelope.occurredAt, ingested_at: envelope.occurredAt,
              approved_payload_hash: 'a'.repeat(64), operation_id: 'integration-test',
              status: 'ACCEPTED', entity_type: 'allocation', entity_id: 'ALLOC-PG-1'
            }],
            rowCount: 1
          };
        }
        if (sql.includes('INSERT INTO ledger_outbox')) throw new Error('simulated outbox failure');
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn()
    };
    const service = new IntegrationEventsService({
      getOperationalPool: () => ({ connect: async () => client })
    } as never);
    await expect(service.ingest(
      envelope,
      { sourceSystem: SourceSystem.STATE_SCM, eventType: CanonicalSourceEventType.ALLOCATION, endpointFamily: 'scm' },
      request
    )).rejects.toThrow('simulated outbox failure');
    expect(queries.at(-1)).toBe('ROLLBACK');
    expect(queries).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});
