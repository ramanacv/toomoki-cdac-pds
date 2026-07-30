import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProvenanceBadges } from '@/components/ProvenanceBadges.js';

vi.mock('@/api.js', () => ({
  loadLedgerProofStatus: vi.fn().mockResolvedValue({
    eventId: 'operation-1',
    operationId: 'operation-1',
    status: 'COMMITTED',
    attemptCount: 1,
    fabricTxId: 'fabric-tx-1'
  })
}));

describe('source provenance and proof status', () => {
  it('shows source, operational status, and verified Fabric transaction separately', async () => {
    render(<ProvenanceBadges
      provenance={{
        sourceSystem: 'STATE_SCM',
        sourceEventId: 'SCM-1',
        schemaVersion: 'fixture-1',
        occurredAt: '2026-07-23T08:00:00.000Z',
        ingestedAt: '2026-07-23T08:00:01.000Z',
        approvedPayloadHash: 'a'.repeat(64),
        operationId: 'operation-1',
        status: 'RECONCILED'
      }}
      eventId="operation-1"
    />);
    expect(screen.getByText('IAeSCM/state SCM event')).toBeInTheDocument();
    expect(screen.getByText('Operational: RECONCILED')).toBeInTheDocument();
    expect(await screen.findByText('Blockchain proof committed · fabric-tx-1')).toBeInTheDocument();
  });

  it('shows Fabric proof not linked when no event id is provided', () => {
    render(
      <ProvenanceBadges
        provenance={{
          sourceSystem: 'AEPDS_EPOS',
          sourceEventId: 'EPOS-1',
          schemaVersion: 'fixture-1',
          occurredAt: '2026-07-23T08:00:00.000Z',
          ingestedAt: '2026-07-23T08:00:01.000Z',
          approvedPayloadHash: 'b'.repeat(64),
          operationId: 'operation-2',
          status: 'ACCEPTED'
        }}
      />
    );
    expect(screen.getByText('AePDS/ePoS event')).toBeInTheDocument();
    expect(screen.getByText('Operational: ACCEPTED')).toBeInTheDocument();
    expect(screen.getByText('Fabric proof: not linked')).toBeInTheDocument();
  });
});
