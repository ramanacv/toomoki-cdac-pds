import { describe, expect, it, vi } from 'vitest';
import type { BeneficiaryLifecycleEvent } from '@pds/shared-types';
import { BeneficiaryRegistryRepository } from '../src/modules/beneficiary-registry/beneficiary-registry.repository.js';

const event = (overrides: Partial<BeneficiaryLifecycleEvent> = {}): BeneficiaryLifecycleEvent => ({
  eventId: 'JK-LIFECYCLE-001',
  beneficiaryRefHash: 'beneficiary-jk-demo-001-hash',
  rationCardHash: 'ration-card-jk-demo-001-hash',
  eventType: 'BENEFICIARY_CREATED',
  sourceSystem: 'VIKSITPDS_DEMO',
  occurredAt: '2026-07-23T10:00:00.000Z',
  effectiveAt: '2026-07-23T10:00:00.000Z',
  reasonCode: 'DEMO_REGISTRY_IMPORT',
  policyId: 'JK-PANEL-DEMO-2026-V1',
  evidenceDigest: 'a'.repeat(64),
  districtCode: 'JK-DEMO-01',
  householdSizeDelta: 5,
  schemaVersion: '1.0',
  ...overrides
});

describe('beneficiary registry lifecycle projection', () => {
  it('projects creation, migration, family change, and deactivation with idempotent replay', async () => {
    const repository = new BeneficiaryRegistryRepository();
    const created = await repository.apply(event());
    expect(created).toMatchObject({
      disposition: 'NEW',
      projection: { householdSize: 5, districtCode: 'JK-DEMO-01', state: 'ACTIVE', version: 1 },
      proofEventId: expect.stringMatching(/^BEN-LIFECYCLE-/)
    });
    await expect(repository.apply(event())).resolves.toMatchObject({ disposition: 'REPLAY' });
    await expect(repository.apply(event({ reasonCode: 'CONFLICTING_REUSE' }))).rejects.toMatchObject({ status: 409 });

    const migrated = await repository.apply(event({
      eventId: 'JK-LIFECYCLE-002', eventType: 'MIGRATION_RECORDED',
      districtCode: 'JK-DEMO-03', householdSizeDelta: 0, priorState: 'ACTIVE'
    }));
    expect(migrated.projection).toMatchObject({ districtCode: 'JK-DEMO-03', householdSize: 5, version: 2 });

    const bifurcated = await repository.apply(event({
      eventId: 'JK-LIFECYCLE-003', eventType: 'HOUSEHOLD_BIFURCATED',
      householdSizeDelta: -2, priorState: 'ACTIVE'
    }));
    expect(bifurcated.projection.householdSize).toBe(3);

    const deactivated = await repository.apply(event({
      eventId: 'JK-LIFECYCLE-004', eventType: 'RECORD_DEACTIVATED',
      householdSizeDelta: 0, priorState: 'ACTIVE', newState: 'DEACTIVATED'
    }));
    expect(deactivated.projection.state).toBe('DEACTIVATED');
    await expect(repository.summary()).resolves.toMatchObject({
      activeRecords: 0,
      lifecycleEvents: 4,
      byEventType: { BENEFICIARY_CREATED: 1, MIGRATION_RECORDED: 1, HOUSEHOLD_BIFURCATED: 1, RECORD_DEACTIVATED: 1 }
    });
  });

  it('requires creation first and validates member-delta direction', async () => {
    const repository = new BeneficiaryRegistryRepository();
    await expect(repository.apply(event({ eventType: 'MEMBER_ADDED', householdSizeDelta: 1 })))
      .rejects.toThrow(/first lifecycle event/);
    await repository.apply(event());
    await expect(repository.apply(event({
      eventId: 'JK-LIFECYCLE-BAD', eventType: 'MEMBER_REMOVED', householdSizeDelta: 1
    }))).rejects.toThrow(/negative householdSizeDelta/);
  });

  it('atomically writes projection, lifecycle history, ledger event, and proof outbox without display identity', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, ...(values ? { values } : {}) });
        if (text.includes('SELECT request_hash')) return { rows: [], rowCount: 0 };
        if (text.includes('SELECT * FROM beneficiary_registry_projection')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn()
    };
    const pool = { connect: vi.fn().mockResolvedValue(client), end: vi.fn() };
    await new BeneficiaryRegistryRepository(pool as never).apply(event());
    const sql = queries.map((query) => query.text).join('\n');
    expect(queries[0]?.text).toBe('BEGIN');
    expect(queries.at(-1)?.text).toBe('COMMIT');
    expect(sql).toContain('beneficiary_registry_projection');
    expect(sql).toContain('beneficiary_lifecycle_events');
    expect(sql).toContain('INSERT INTO ledger_events');
    expect(sql).toContain('INSERT INTO ledger_outbox');
    const serialized = JSON.stringify(queries.flatMap((query) => query.values ?? []));
    expect(serialized).not.toMatch(/Zoya|RC-JK-DEMO/);
    expect(serialized).toContain('beneficiary-jk-demo-001-hash');
  });
});
