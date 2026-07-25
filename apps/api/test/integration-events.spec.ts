import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { CanonicalSourceEventType, SourceSystem, type SourceEventEnvelope } from '@pds/shared-types';
import { IntegrationEventsService } from '../src/modules/integrations/integration-events.service.js';
import { createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';
import type { AuthenticatedRequest } from '../src/modules/auth/identity-provider.js';

const integrationRequest = (sources = 'SMARTPDS_RCMS,STATE_SCM,AEPDS_EPOS'): AuthenticatedRequest => ({
  headers: {},
  user: {
    subject: 'service-account-maharashtra',
    roles: ['integration-service'],
    claims: {
      pds_source_systems: sources,
      pds_endpoint_families: 'smartpds,scm,epos',
      pds_event_types: 'MASTER_REFERENCE,ALLOCATION,MOVEMENT,DISTRIBUTION'
    }
  }
});

const envelope = (
  sourceEventId: string,
  overrides: Partial<SourceEventEnvelope> = {}
): SourceEventEnvelope => ({
  sourceSystem: SourceSystem.STATE_SCM,
  sourceEventId,
  eventType: CanonicalSourceEventType.ALLOCATION,
  schemaVersion: 'maha-sandbox-1',
  occurredAt: '2026-07-23T08:00:00.000Z',
  payload: {
    entityType: 'allocation',
    entityId: `ALLOC-${sourceEventId}`,
    fpsId: 'FPS-101',
    commodity: 'Rice',
    quantityKg: 100
  },
  ...overrides
});

describe('canonical integration events', () => {
  let fixture: DemoLedgerFixture;
  let service: IntegrationEventsService;
  let previousPath: string | undefined;

  beforeEach(async () => {
    fixture = await createDemoLedgerFixture();
    previousPath = process.env.PDS_INTEGRATION_STATE_PATH;
    process.env.PDS_INTEGRATION_STATE_PATH = join(fixture.dir, 'integration-events.json');
    service = new IntegrationEventsService(fixture.facade);
  });

  afterEach(async () => {
    if (previousPath === undefined) delete process.env.PDS_INTEGRATION_STATE_PATH;
    else process.env.PDS_INTEGRATION_STATE_PATH = previousPath;
    await fixture.cleanup();
  });

  it('accepts a new event, returns the original result for identical replay, and rejects conflicting replay', async () => {
    const contract = {
      sourceSystem: SourceSystem.STATE_SCM,
      eventType: CanonicalSourceEventType.ALLOCATION,
      endpointFamily: 'scm'
    };
    const first = await service.ingest(envelope('SCM-ALLOC-1'), contract, integrationRequest());
    expect(first.disposition).toBe('NEW');
    expect(first.result.provenance.status).toBe('ACCEPTED');
    expect(first.result.provenance.approvedPayloadHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(service.trace(SourceSystem.STATE_SCM, 'SCM-ALLOC-1')).resolves.toMatchObject({
      event: { provenance: { operationId: first.result.provenance.operationId } },
      proof: { status: 'DEMO_RECORDED' }
    });

    const duplicate = await service.ingest(envelope('SCM-ALLOC-1'), contract, integrationRequest());
    expect(duplicate.disposition).toBe('DUPLICATE');
    expect(duplicate.result.provenance.operationId).toBe(first.result.provenance.operationId);
    expect(duplicate.result.provenance.status).toBe('ACCEPTED');

    const conflict = await service.ingest(
      envelope('SCM-ALLOC-1', { payload: { entityType: 'allocation', entityId: 'ALLOC-SCM-ALLOC-1', quantityKg: 101 } }),
      contract,
      integrationRequest()
    );
    expect(conflict.disposition).toBe('CONFLICT');
    expect(conflict.result.provenance.status).toBe('CONFLICTED');
  });

  it('durably quarantines an out-of-order child and recovers it after its parent arrives', async () => {
    const contract = {
      sourceSystem: SourceSystem.STATE_SCM,
      eventType: CanonicalSourceEventType.ALLOCATION,
      endpointFamily: 'scm'
    };
    const child = await service.ingest(
      envelope('SCM-CHILD', { parentSourceEventId: 'SCM-PARENT' }),
      contract,
      integrationRequest()
    );
    expect(child.disposition).toBe('QUARANTINED');

    await service.ingest(envelope('SCM-PARENT'), contract, integrationRequest());
    const reloaded = new IntegrationEventsService(fixture.facade);
    const events = await reloaded.list();
    expect(events.find((item) => item.provenance.sourceEventId === 'SCM-CHILD')?.provenance.status).toBe('ACCEPTED');
  });

  it('supports linked amendments and rejects nested prohibited personal data before persistence', async () => {
    const contract = {
      sourceSystem: SourceSystem.STATE_SCM,
      eventType: CanonicalSourceEventType.ALLOCATION,
      endpointFamily: 'scm'
    };
    await service.ingest(envelope('SCM-ORIGINAL'), contract, integrationRequest());
    const amended = await service.ingest(
      envelope('SCM-AMENDMENT', { amendmentOfSourceEventId: 'SCM-ORIGINAL' }),
      contract,
      integrationRequest()
    );
    expect(amended.result.amendmentOfSourceEventId).toBe('SCM-ORIGINAL');

    const reversal = await service.ingest(
      envelope('SCM-REVERSAL', { reversalOfSourceEventId: 'SCM-FUTURE' }),
      contract,
      integrationRequest()
    );
    expect(reversal.disposition).toBe('QUARANTINED');
    await service.ingest(envelope('SCM-FUTURE'), contract, integrationRequest());
    expect(
      (await service.list()).find((item) => item.provenance.sourceEventId === 'SCM-REVERSAL')?.provenance.status
    ).toBe('ACCEPTED');

    await expect(service.ingest(
      envelope('SCM-PRIVATE', { payload: { nested: { aadhaarNumber: '1234' } } }),
      contract,
      integrationRequest()
    )).rejects.toThrow(/prohibited personal data/);
    expect((await service.list()).some((item) => item.provenance.sourceEventId === 'SCM-PRIVATE')).toBe(false);
  });

  it('enforces source assignment claims independently of the integration-service role', async () => {
    await expect(service.ingest(
      envelope('SCM-DENIED'),
      {
        sourceSystem: SourceSystem.STATE_SCM,
        eventType: CanonicalSourceEventType.ALLOCATION,
        endpointFamily: 'scm'
      },
      integrationRequest('SMARTPDS_RCMS')
    )).rejects.toThrow(/not assigned/);
  });

  it('uses the durable source contract in database authorization mode without optional token contract claims', async () => {
    const previousMode = process.env.PDS_AUTHORIZATION_MODE;
    process.env.PDS_AUTHORIZATION_MODE = 'database';
    const assertIntegrationContract = vi.fn().mockResolvedValue(undefined);
    try {
      const databaseAuthorized = new IntegrationEventsService(
        fixture.facade,
        { assertIntegrationContract } as never
      );
      const request: AuthenticatedRequest = {
        headers: {},
        user: {
          subject: 'service-account-maharashtra',
          roles: ['integration-service'],
          claims: { azp: 'pds-integration-maharashtra' }
        }
      };
      const contract = {
        sourceSystem: SourceSystem.STATE_SCM,
        eventType: CanonicalSourceEventType.ALLOCATION,
        endpointFamily: 'scm'
      };

      await expect(databaseAuthorized.ingest(envelope('SCM-DATABASE-AUTH'), contract, request))
        .resolves.toMatchObject({ disposition: 'NEW' });
      expect(assertIntegrationContract).toHaveBeenCalledWith(
        request.user,
        SourceSystem.STATE_SCM,
        'scm',
        CanonicalSourceEventType.ALLOCATION
      );
    } finally {
      if (previousMode === undefined) delete process.env.PDS_AUTHORIZATION_MODE;
      else process.env.PDS_AUTHORIZATION_MODE = previousMode;
    }
  });

  it('serializes simultaneous replay and reports attempt, schema, lag, and quarantine health', async () => {
    const contract = {
      sourceSystem: SourceSystem.STATE_SCM,
      eventType: CanonicalSourceEventType.ALLOCATION,
      endpointFamily: 'scm'
    };
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => service.ingest(envelope('SCM-CONCURRENT'), contract, integrationRequest()))
    );
    expect(outcomes.filter((item) => item.disposition === 'NEW')).toHaveLength(1);
    expect(outcomes.filter((item) => item.disposition === 'DUPLICATE')).toHaveLength(7);
    await expect(service.ingest(
      envelope('SCM-REJECTED', { payload: { nested: { phone: '9999999999' } } }),
      contract,
      integrationRequest()
    )).rejects.toThrow(/prohibited personal data/);
    const health = await service.health();
    expect(health[0]).toMatchObject({
      sourceSystem: SourceSystem.STATE_SCM,
      counts: { ACCEPTED: 1, DUPLICATE: 7, REJECTED: 1 },
      schemaVersions: ['maha-sandbox-1']
    });
    expect(health[0]?.reconciliationLagSeconds).toBeTypeOf('number');
  });

  it('reconciles allocation-to-movement quantities and reports mismatches without changing quantity', async () => {
    await service.ingest(
      envelope('SCM-RECON-ALLOC'),
      {
        sourceSystem: SourceSystem.STATE_SCM,
        eventType: CanonicalSourceEventType.ALLOCATION,
        endpointFamily: 'scm'
      },
      integrationRequest()
    );
    await service.ingest(
      envelope('SCM-RECON-MOVE', {
        eventType: CanonicalSourceEventType.MOVEMENT,
        parentSourceEventId: 'SCM-RECON-ALLOC',
        payload: {
          entityType: 'movement',
          entityId: 'MOVE-RECON-1',
          quantityKg: 90,
          receivedQuantityKg: 85,
          adjustmentQuantityKg: 5
        }
      }),
      {
        sourceSystem: SourceSystem.STATE_SCM,
        eventType: CanonicalSourceEventType.MOVEMENT,
        endpointFamily: 'scm'
      },
      integrationRequest()
    );
    const summary = await service.reconcile();
    expect(summary.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'ALLOCATION_MOVEMENT',
        expectedKg: 100,
        actualKg: 90,
        differenceKg: 10
      })
    ]));
    expect(summary.exceptions.some((item) => item.kind === 'MOVEMENT_RECEIPT')).toBe(false);
  });
});
