import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), '../../', relativePath), 'utf8');

describe('fabric network scaffold', () => {
  it('documents the intended topology', () => {
    const manifest = JSON.parse(read('blockchain/fabric-network/network-manifest.json')) as {
      channel: string;
      organizations: Array<{ role: string }>;
      chaincode: { name: string };
    };

    expect(manifest.channel).toBe('pdschannel');
    expect(manifest.chaincode.name).toBe('pds-chaincode');
    expect(manifest.organizations.map((org) => org.role)).toEqual([
      'DEPARTMENT',
      'PROCUREMENT_CENTER',
      'STATE_GODOWN',
      'FAIR_PRICE_SHOP',
      'AUDITOR'
    ]);
  });

  it('includes one connection profile per organization', () => {
    const profiles = [
      'blockchain/fabric-network/connection-profiles/food-department.json',
      'blockchain/fabric-network/connection-profiles/procurement-miller.json',
      'blockchain/fabric-network/connection-profiles/godown-warehouse.json',
      'blockchain/fabric-network/connection-profiles/fps.json',
      'blockchain/fabric-network/connection-profiles/audit-authority.json'
    ];

    for (const profile of profiles) {
      const parsed = JSON.parse(read(profile)) as {
        channels: Record<string, Record<string, unknown>>;
        peers: Record<string, { url: string }>;
      };
      expect(Object.keys(parsed.channels)).toContain('pdschannel');
      expect(Object.keys(parsed.peers).length).toBe(1);
      expect(Object.values(parsed.peers)[0]?.url).toContain('grpcs://');
    }
  });

  it('defines bootstrap scripts for the scaffolded network', () => {
    const bootstrap = read('blockchain/fabric-network/scripts/bootstrap-network.sh');
    const generator = read('blockchain/fabric-network/scripts/generate-connection-profiles.sh');

    expect(bootstrap).toContain('pdschannel');
    expect(bootstrap).toContain('pds-chaincode');
    expect(generator).toContain('connection profiles');
  });
});
