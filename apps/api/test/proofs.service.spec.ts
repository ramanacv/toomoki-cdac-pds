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
});
