import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ProofsService } from '../src/modules/proofs/proofs.service.js';
import type { PdsLedgerFacade } from '../src/modules/core/pds-ledger.facade.js';

const facade = (rowsByQuery: unknown[][] = []): PdsLedgerFacade => {
  const query = vi.fn();
  for (const rows of rowsByQuery) query.mockResolvedValueOnce({ rows });
  return {
    getOperationalPool: () => ({ query }),
    listLedgerEvents: () => []
  } as unknown as PdsLedgerFacade;
};

const outboxRow = (overrides: Record<string, unknown> = {}) => ({
  event_id: 'TX-1',
  operation_id: 'TX-1',
  status: 'COMMITTED',
  fabric_tx_id: 'fabric-1',
  retry_count: 0,
  schema_version: 1,
  created_at: new Date('2026-01-01T00:00:00Z'),
  committed_at: new Date('2026-01-01T00:00:05Z'),
  last_error: null,
  event_payload: {
    ledgerTxId: 'TX-1',
    entityType: 'lot',
    entityId: 'LOT-1',
    eventType: 'DispatchLot',
    payload: { quantityKg: 1000 },
    timestamp: '2026-01-01T00:00:00.000Z'
  },
  ...overrides
});

describe('ProofsService', () => {
  it('returns a safe status and reveals raw worker errors only when requested', async () => {
    const row = {
      event_id: 'TX-1', operation_id: 'OP-1', status: 'FAILED', retry_count: 2,
      created_at: new Date('2026-01-01T00:00:00Z'), submitting_at: null, committed_at: null,
      fabric_tx_id: null, last_error: 'gRPC connection unavailable at peer'
    };
    const safe = await new ProofsService(facade([[row]])).getStatus('TX-1', false);
    expect(safe).toEqual(expect.objectContaining({ status: 'FAILED', failureCategory: 'FABRIC_UNAVAILABLE' }));
    expect(safe).not.toHaveProperty('rawWorkerError');

    const privileged = await new ProofsService(facade([[row]])).getStatus('TX-1', true);
    expect(privileged.rawWorkerError).toBe(row.last_error);
  });

  it('returns not found for an unknown event', async () => {
    await expect(new ProofsService(facade([[]])).getStatus('missing', false)).rejects.toThrow(NotFoundException);
  });

  it('summarizes every durable outbox state and recent Fabric transaction IDs', async () => {
    const service = new ProofsService(facade([
      [{ status: 'COMMITTED', count: 8 }, { status: 'FAILED', count: 2 }],
      [{ age: 12.5 }],
      [{ event_id: 'TX-8', fabric_tx_id: 'fabric-8', committed_at: new Date('2026-01-01T00:00:05Z') }]
    ]));
    const summary = await service.getSummary();
    expect(summary.counts).toEqual({ PENDING: 0, SUBMITTING: 0, COMMITTED: 8, FAILED: 2, DEAD_LETTER: 0 });
    expect(summary.commitSuccessPercentage).toBe(80);
    expect(summary.recentCommitted[0]?.fabricTxId).toBe('fabric-8');
  });

  it('buckets recent proofs by demo module and event type', async () => {
    const service = new ProofsService(facade([
      // getSummary()
      [{ status: 'COMMITTED', count: 3 }],
      [{ age: null }],
      [],
      // recent outbox rows
      [
        outboxRow({
          event_id: 'TX-SCM',
          event_payload: {
            ledgerTxId: 'TX-SCM', entityType: 'transfer', entityId: 'TR-1', eventType: 'ReceiveLot',
            payload: { receivedQtyKg: 900 }, timestamp: '2026-01-01T01:00:00.000Z'
          }
        }),
        outboxRow({
          event_id: 'ELIG-1',
          event_payload: {
            ledgerTxId: 'ELIG-1', entityType: 'eligibility-case', entityId: 'CASE-1',
            eventType: 'EligibilityDecisionAuthorized',
            payload: { rationCardHash: 'demo-ration-card-hash', outcomeCode: 'CARD_CANCELLED' },
            timestamp: '2026-01-01T02:00:00.000Z'
          }
        }),
        outboxRow({
          event_id: 'TX-AUTH',
          event_payload: {
            ledgerTxId: 'TX-AUTH', entityType: 'auth', entityId: 'AUTH-1', eventType: 'AuthTransaction',
            payload: { authResult: 'SUCCESS', rationCardHash: 'demo-ration-card-hash' },
            timestamp: '2026-01-01T03:00:00.000Z'
          }
        })
      ],
      // completeness: beneficiary expected, eligibility expected, drift
      [
        { event_id: 'BEN-1', outbox_status: 'COMMITTED' },
        { event_id: 'BEN-MISSING', outbox_status: null }
      ],
      [
        { event_id: 'ELIG-1', outbox_status: 'COMMITTED', evidence_digest: 'a'.repeat(64), proof_digest: 'a'.repeat(64) },
        { event_id: 'ELIG-DEAD', outbox_status: 'DEAD_LETTER' }
      ],
      []
    ]));

    const analytics = await service.getAnalytics();
    expect(analytics.byModule).toEqual({
      'supply-chain': 1,
      eligibility: 1,
      fps: 1,
      other: 0
    });
    expect(analytics.byEventType.map((row) => row.eventType).sort()).toEqual([
      'AuthTransaction',
      'EligibilityDecisionAuthorized',
      'ReceiveLot'
    ]);
    expect(analytics.recentProofs).toHaveLength(3);
    expect(analytics.recentProofs[0]?.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(analytics.recentProofs.find((row) => row.eventId === 'TX-SCM')?.module).toBe('supply-chain');
    expect(analytics.recentProofs[0]).not.toHaveProperty('actor');
    expect(analytics.completeness.byModule.beneficiary).toMatchObject({
      expected: 2, committed: 1, missing: 1
    });
    expect(analytics.completeness.byModule.eligibility).toMatchObject({
      expected: 2, committed: 1, deadLetter: 1
    });
    expect(analytics.completeness.missingProofCount).toBe(1);
    expect(analytics.completeness.deadLetterCount).toBe(1);
    expect(analytics.completeness.missingEventIds).toContain('BEN-MISSING');
    expect(analytics.completeness.alerts.some((alert) => alert.kind === 'MISSING_PROOF')).toBe(true);
    expect(analytics.completeness.alerts.some((alert) => alert.kind === 'DEAD_LETTER')).toBe(true);
  });

  it('returns privacy-safe proof detail and strips prohibited fields', async () => {
    const service = new ProofsService(facade([[
      outboxRow({
        event_id: 'TX-PII',
        last_error: 'validation failed: nested otp',
        status: 'DEAD_LETTER',
        fabric_tx_id: null,
        committed_at: null,
        event_payload: {
          ledgerTxId: 'TX-PII',
          entityType: 'auth',
          entityId: 'AUTH-PII',
          eventType: 'AuthTransaction',
          payload: {
            authResult: 'SUCCESS',
            rationCardHash: 'demo-ration-card-hash',
            otp: '123456',
            evidence: { phone: '9999999999', ok: true }
          },
          timestamp: '2026-01-01T00:00:00.000Z'
        }
      })
    ]]));

    const detail = await service.getDetail('TX-PII', true);
    expect(detail.module).toBe('fps');
    expect(detail.proofPayload).toEqual({
      authResult: 'SUCCESS',
      rationCardHash: 'demo-ration-card-hash',
      evidence: { ok: true }
    });
    expect(detail.proofPayload).not.toHaveProperty('otp');
    expect(detail.rawWorkerError).toContain('validation failed');
    expect(detail.failureCategory).toBe('VALIDATION_FAILED');
  });

  it('returns empty analytics when no operational pool is configured', async () => {
    const service = new ProofsService({
      getOperationalPool: () => null,
      listLedgerEvents: () => [{
        ledgerTxId: 'TX-MEM',
        entityType: 'lot',
        entityId: 'LOT-1',
        eventType: 'DispatchLot',
        payload: { quantityKg: 1 },
        timestamp: '2026-01-01T00:00:00.000Z'
      }]
    } as unknown as PdsLedgerFacade);

    const analytics = await service.getAnalytics();
    expect(analytics.recentProofs).toEqual([]);
    expect(analytics.summary.commitSuccessPercentage).toBe(0);
    expect(analytics.summary.counts.COMMITTED).toBe(0);
    expect(analytics.completeness.missingProofCount).toBe(0);
    expect(analytics.completeness.alerts).toEqual([]);
  });
});
