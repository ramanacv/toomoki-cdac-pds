import { describe, expect, it, vi } from 'vitest';
import type { FabricRuntimeConfig } from '../src/modules/config/fabric.config.js';
import * as connectionModule from '../src/modules/fabric/fabric-gateway.connection.js';
import { FabricGatewayClient } from '../src/modules/fabric/fabric-gateway.client.js';

const baseConfig = (): FabricRuntimeConfig => ({
  ledgerMode: 'fabric',
  mode: 'fabric-gateway',
  clientOrg: 'FoodAndCivilSupplies',
  statePath: '/tmp/pds-state.json',
  journalPath: '/tmp/pds-ledger.ndjson',
  envelopePath: '/tmp/pds-fabric-envelope.ndjson',
  chaincodeStatePath: '/tmp/chaincode-world-state.json',
  contractPath: '/tmp/fabric-contract.json',
  connectionProfilePath: '/tmp/food-department.json',
  network: 'pds-chain-fabric-network',
  channel: 'pdschannel',
  chaincode: 'pds-chaincode',
  peerEndpoint: 'peer0.food.example.com:7051',
  peerTlsCertPath: '/tmp/ca.crt',
  peerHostAlias: 'peer0.food.example.com',
  mspId: 'FoodAndCivilSuppliesMSP',
  certPath: '/tmp/cert.pem',
  keyPath: '/tmp/key.pem'
});

describe('FabricGatewayClient', () => {
  it('submits and evaluates transactions via the gateway contract', async () => {
    const submitTransaction = vi.fn().mockResolvedValue(Buffer.from('{}'));
    const evaluateTransaction = vi
      .fn()
      .mockResolvedValue(Buffer.from(JSON.stringify([{ eventType: 'CreateCommodityLot' }])));

    vi.spyOn(connectionModule, 'createFabricGatewayConnection').mockResolvedValue({
      client: { close: vi.fn() } as never,
      gateway: { close: vi.fn() } as never,
      contract: { submitTransaction, evaluateTransaction } as never,
      close: vi.fn()
    });

    const client = new FabricGatewayClient(baseConfig());
    await client.submitAsync('DispatchLot', { lotId: 'LOT-1' });
    expect(submitTransaction).toHaveBeenCalledWith('DispatchLot', JSON.stringify({ lotId: 'LOT-1' }));

    const history = await client.getLotHistoryAsync('LOT-1');
    expect(evaluateTransaction).toHaveBeenCalledWith('GetLotHistory', JSON.stringify({ lotId: 'LOT-1' }));
    expect(history).toEqual([{ eventType: 'CreateCommodityLot' }]);
  });

  it('evaluates VerifyDatabaseHash', async () => {
    const submitTransaction = vi.fn();
    const evaluateTransaction = vi
      .fn()
      .mockResolvedValue(Buffer.from(JSON.stringify({ match: true, ledgerDigest: 'abc' })));

    vi.spyOn(connectionModule, 'createFabricGatewayConnection').mockResolvedValue({
      client: { close: vi.fn() } as never,
      gateway: { close: vi.fn() } as never,
      contract: { submitTransaction, evaluateTransaction } as never,
      close: vi.fn()
    });

    const client = new FabricGatewayClient(baseConfig());
    const verification = await client.verifyDatabaseHashAsync('abc');
    expect(verification).toEqual({ match: true, ledgerDigest: 'abc' });
  });
});
