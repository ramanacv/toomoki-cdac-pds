import { describe, expect, it } from 'vitest';
// @ts-expect-error - the validator is a cross-package ESM utility without TS declarations in this workspace
import { validateFabricArtifacts } from '../../../blockchain/fabric-network/scripts/validate-fabric-artifacts.mjs';

describe('fabric artifact validation', () => {
  it('passes the scaffold validator script', () => {
    expect(validateFabricArtifacts()).toBe('Fabric scaffold validation passed');
  });
});
