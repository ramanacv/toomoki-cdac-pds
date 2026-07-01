import { describe, expect, it } from 'vitest';
import { defaultFabricContractManifest, getFabricOperationByApiRoute } from '../src/fabric-contract.js';
import { buildFabricRoutePlan } from '../src/fabric-contract-router.js';

describe('fabric contract router', () => {
  it('loads the manifest and exposes all declared operations', () => {
    const manifest = defaultFabricContractManifest();
    expect(manifest.network).toBe('pds-chain-fabric-network');
    expect(manifest.operations).toHaveLength(18);
    expect(manifest.operations.some((operation) => operation.name === 'TransformLot')).toBe(true);
  });

  it('maps api routes to fabric operations', () => {
    expect(getFabricOperationByApiRoute('/stakeholders')).toBe('RegisterStakeholder');
    expect(getFabricOperationByApiRoute('/lots/transform')).toBe('TransformLot');
    expect(getFabricOperationByApiRoute('/distributions')).toBe('RecordDistribution');
    expect(getFabricOperationByApiRoute('/does-not-exist')).toBeNull();
  });

  it('builds a route plan aligned with the fabric contract', () => {
    const plan = buildFabricRoutePlan(defaultFabricContractManifest());
    expect(plan.some((item) => item.operation === 'RegisterStakeholder')).toBe(true);
    expect(plan.some((item) => item.operation === 'RecordDistribution')).toBe(true);
  });
});
