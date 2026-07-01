import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FabricRuntimeConfig } from '../src/modules/config/fabric.config.js';
import { FabricIdentityService } from '../src/modules/fabric/fabric-identity.service.js';

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

describe('FabricIdentityService', () => {
  let dir: string;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads identity material from explicit key file paths', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-fabric-id-'));
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    writeFileSync(join(dir, 'cert.pem'), '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n');
    writeFileSync(join(dir, 'key.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));

    const service = new FabricIdentityService(baseConfig(dir));
    const material = await service.loadIdentityMaterial();

    expect(material.mspId).toBe('FoodAndCivilSuppliesMSP');
    expect(material.credentials.toString()).toContain('BEGIN CERTIFICATE');
    expect(material.privateKeyPem.toString()).toContain('BEGIN PRIVATE KEY');

    const identity = await service.toGatewayIdentity(material);
    expect(identity.mspId).toBe('FoodAndCivilSuppliesMSP');

    const signer = await service.toGatewaySigner(material);
    expect(signer).toBeDefined();
  });
});
