import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const lifecycle = readFileSync(join(root, 'scripts/live-lifecycle.mjs'), 'utf8');
const integrationSeed = readFileSync(join(root, 'scripts/seed-integration-fixtures.mjs'), 'utf8');

describe('live lifecycle identity and proof gates', () => {
  it('omits caller-controlled FPS/operator fields from the FPS distribution request', () => {
    const distributionBlock = lifecycle.slice(
      lifecycle.indexOf("const distribution = await post("),
      lifecycle.indexOf('const entitlementAfter')
    );
    expect(distributionBlock).not.toContain('fpsId');
    expect(distributionBlock).not.toContain('dealerId');
    expect(lifecycle).toContain("proof.status === 'COMMITTED'");
    expect(lifecycle).toContain('fabricTxId');
  });

  it('loads provisional integration fixtures only through the authenticated adapter endpoints', () => {
    expect(integrationSeed).toContain('pds-integration-maharashtra');
    expect(integrationSeed).toContain('PDS_INTEGRATION_CLIENT_SECRET');
    expect(integrationSeed).toContain("Authorization: `Bearer ${token}`");
    expect(integrationSeed).toContain('realIntegration: false');
    expect(integrationSeed).toContain("request('/integrations/reconcile', 'POST')");
    expect(integrationSeed).toContain("request('/integrations/health')");
  });
});
