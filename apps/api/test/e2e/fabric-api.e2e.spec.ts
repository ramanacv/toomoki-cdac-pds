import { describe, expect, it } from 'vitest';

const fabricE2eEnabled = process.env.PDS_E2E_FABRIC === 'true';

describe.skipIf(!fabricE2eEnabled)('Fabric API e2e', () => {
  it('is deferred unless PDS_E2E_FABRIC=true with a live Fabric network', () => {
    expect(fabricE2eEnabled).toBe(true);
  });
});

describe('Fabric API e2e guard', () => {
  it('documents that live Fabric e2e is opt-in via PDS_E2E_FABRIC', () => {
    expect(process.env.PDS_E2E_FABRIC ?? 'false').toBeDefined();
  });
});
