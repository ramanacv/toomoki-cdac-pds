import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { FabricChaincodeLedgerPort } from '../src/fabric-chaincode-ledger-port.js';
import { PdsRuntime } from '../src/pds-runtime.js';

describe('fabric chaincode ledger port', () => {
  it('mirrors api ledger events into chaincode world state', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pds-chain-port-'));
    const statePath = join(dir, 'pds-state.json');
    const chaincodeStatePath = join(dir, 'chaincode-world-state.json');

    let service: PdsRuntime | null = null;
    try {
      const port = new FabricChaincodeLedgerPort(statePath, join(dir, 'journal.ndjson'), chaincodeStatePath);
      service = new PdsRuntime(true, port, { deferBootstrap: true });
      await service.bootstrapFromPersistenceAsync();

      service.registerStakeholder({
        stakeholderId: 'TEST-CHAIN-001',
        stakeholderType: StakeholderType.DEPARTMENT,
        name: 'Chain Test Department',
        district: 'Demo District',
        licenseNo: 'CHAIN-001',
        status: StakeholderStatus.ACTIVE
      });
      await service.flushPersist();

      const history = service.getLotHistory('LOT-RICE-2026-001');
      expect(history.some((event) => event.eventType === 'CreateCommodityLot')).toBe(true);
      expect(service.getTraceForLot('LOT-RICE-2026-001')).toMatchObject({ verificationSource: 'chaincode' });
    } finally {
      try {
        await service?.flushPersist();
      } catch {
        // ignore
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
