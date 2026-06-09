import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { toFabricTransactionEnvelope, LocalFabricClient } from '../src/fabric-client.js';

describe('fabric client contract', () => {
  it('maps ledger events to fabric envelopes', () => {
    const envelope = toFabricTransactionEnvelope({
      ledgerTxId: 'TX-001',
      entityType: 'distribution',
      entityId: 'DIST-001',
      eventType: 'RecordDistribution',
      payload: {
        distributionId: 'DIST-001',
        deliveredKg: 25
      },
      timestamp: '2026-06-09T15:00:00.000Z'
    });

    expect(envelope.channel).toBe('pdschannel');
    expect(envelope.chaincode).toBe('pds-chaincode');
    expect(envelope.operation).toBe('RecordDistribution');
  });

  it('writes submit and evaluate envelopes to disk', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pds-fabric-client-'));
    const client = new LocalFabricClient(join(tempDir, 'envelopes.ndjson'));

    client.submit({
      network: 'pds-chain-fabric-network',
      channel: 'pdschannel',
      chaincode: 'pds-chaincode',
      operation: 'CreateCommodityLot',
      entityType: 'lot',
      entityId: 'LOT-001',
      txId: 'fabric-001',
      payload: { lotId: 'LOT-001' },
      timestamp: '2026-06-09T15:00:00.000Z'
    });
    client.evaluate('GetLotHistory', { lotId: 'LOT-001' });

    const journal = readFileSync(client.envelopePath, 'utf8');
    expect(journal).toContain('CreateCommodityLot');
    expect(journal).toContain('GetLotHistory');
    rmSync(dirname(client.envelopePath), { recursive: true, force: true });
  });
});
