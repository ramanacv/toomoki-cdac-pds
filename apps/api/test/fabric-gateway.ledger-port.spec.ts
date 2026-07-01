import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LedgerEvent } from '@pds/shared-types';
import type { FabricRuntimeConfig } from '../src/modules/config/fabric.config.js';
import { FabricGatewayClient } from '../src/modules/fabric/fabric-gateway.client.js';
import { FabricGatewayLedgerPort } from '../src/modules/fabric/fabric-gateway.ledger-port.js';

const baseConfig = (dir: string): FabricRuntimeConfig => ({
  ledgerMode: 'fabric',
  mode: 'fabric-gateway',
  clientOrg: 'FoodAndCivilSupplies',
  statePath: join(dir, 'state.json'),
  journalPath: join(dir, 'journal.ndjson'),
  envelopePath: join(dir, 'envelope.ndjson'),
  chaincodeStatePath: join(dir, 'chaincode-state.json'),
  contractPath: join(dir, 'contract.json'),
  connectionProfilePath: join(dir, 'profile.json'),
  network: 'pds-chain-fabric-network',
  channel: 'pdschannel',
  chaincode: 'pds-chaincode',
  peerEndpoint: 'peer0.food.example.com:7051',
  peerTlsCertPath: join(dir, 'ca.crt'),
  peerHostAlias: 'peer0.food.example.com',
  mspId: 'FoodAndCivilSuppliesMSP',
  certPath: join(dir, 'cert.pem'),
  keyPath: join(dir, 'key.pem')
});

describe('FabricGatewayLedgerPort', () => {
  let dir: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('forwards appendEvents to the gateway client and local persistence', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-fabric-port-'));
    const submitLedgerEventAsync = vi.fn().mockResolvedValue({ txId: 'tx-1' });
    vi.spyOn(FabricGatewayClient.prototype, 'submitLedgerEventAsync').mockImplementation(submitLedgerEventAsync);
    vi.spyOn(FabricGatewayClient.prototype, 'getLotHistory').mockReturnValue([]);
    vi.spyOn(FabricGatewayClient.prototype, 'getDistributionHistory').mockReturnValue([]);
    vi.spyOn(FabricGatewayClient.prototype, 'verifyDatabaseHash').mockReturnValue({ match: true, ledgerDigest: 'abc' });

    const port = new FabricGatewayLedgerPort(baseConfig(dir));
    const event = {
      eventType: 'RegisterStakeholder',
      payload: { stakeholderId: 'STK-001' }
    } as unknown as LedgerEvent;

    await port.appendEvents([event]);
    expect(submitLedgerEventAsync).toHaveBeenCalledWith(event);
    await expect(port.loadState()).resolves.toBeNull();
  });

  it('delegates chain query methods to the gateway client', () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-fabric-port-'));
    const history = [{ eventType: 'CreateCommodityLot' }] as LedgerEvent[];
    vi.spyOn(FabricGatewayClient.prototype, 'submitLedgerEventAsync').mockResolvedValue({ txId: 'tx-1' });
    vi.spyOn(FabricGatewayClient.prototype, 'getLotHistory').mockReturnValue(history);
    vi.spyOn(FabricGatewayClient.prototype, 'getDistributionHistory').mockReturnValue(history);
    vi.spyOn(FabricGatewayClient.prototype, 'verifyDatabaseHash').mockReturnValue({ match: true, ledgerDigest: 'abc' });

    const port = new FabricGatewayLedgerPort(baseConfig(dir));
    expect(port.getLotHistory('LOT-1')).toEqual(history);
    expect(port.getDistributionHistory('DIST-1')).toEqual(history);
    expect(port.verifyDatabaseHash('abc')).toEqual({ match: true, ledgerDigest: 'abc' });
  });

  it('propagates a Fabric submit rejection instead of reporting false success (T2.3)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-fabric-port-'));
    const submitError = new Error('fabric endorsement failed: chaincode execution error');
    const submitLedgerEventAsync = vi.fn().mockRejectedValue(submitError);
    vi.spyOn(FabricGatewayClient.prototype, 'submitLedgerEventAsync').mockImplementation(submitLedgerEventAsync);

    const port = new FabricGatewayLedgerPort(baseConfig(dir));
    const event = {
      eventType: 'RegisterStakeholder',
      payload: { stakeholderId: 'STK-FAIL' }
    } as unknown as LedgerEvent;

    await expect(port.appendEvents([event])).rejects.toThrow(/fabric endorsement failed/);
    expect(submitLedgerEventAsync).toHaveBeenCalledWith(event);
  });

  it('still persists to Postgres/file first when Fabric submit is awaited (T2.3 dual-write ordering)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-fabric-port-'));
    const submitLedgerEventAsync = vi.fn().mockResolvedValue({ txId: 'tx-ok' });
    vi.spyOn(FabricGatewayClient.prototype, 'submitLedgerEventAsync').mockImplementation(submitLedgerEventAsync);

    const port = new FabricGatewayLedgerPort(baseConfig(dir));
    const event = {
      ledgerTxId: 'TX-DW',
      entityType: 'stakeholder',
      entityId: 'STK-DW',
      eventType: 'RegisterStakeholder',
      payload: { stakeholderId: 'STK-DW' },
      timestamp: '2026-06-25T10:00:00.000Z'
    } as unknown as LedgerEvent;

    await port.appendEvents([event]);
    // The local journal (dual-write primary) must have recorded the event.
    const journalRaw = readFileSync(join(dir, 'journal.ndjson'), 'utf8');
    expect(journalRaw).toContain('TX-DW');
    expect(submitLedgerEventAsync).toHaveBeenCalledTimes(1);
  });
});
