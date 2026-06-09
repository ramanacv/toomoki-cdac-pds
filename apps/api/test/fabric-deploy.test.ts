import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), '../../', relativePath), 'utf8');

describe('fabric deployment scaffold', () => {
  it('includes a docker compose topology for the fabric network', () => {
    const compose = read('blockchain/fabric-network/docker-compose.fabric.yml');
    expect(compose).toContain('orderer.pds.example.com');
    expect(compose).toContain('peer0.food.example.com');
    expect(compose).toContain('peer0.audit.example.com');
  });

  it('documents the fabric env contract', () => {
    const env = read('blockchain/fabric-network/fabric-env.example');
    expect(env).toContain('PDS_LEDGER_BACKEND=chaincode-runtime');
    expect(env).toContain('PDS_CHAINCODE_STATE_PATH=');
    expect(env).toContain('PDS_FABRIC_CLIENT_ORG=FoodAndCivilSupplies');
  });
});
