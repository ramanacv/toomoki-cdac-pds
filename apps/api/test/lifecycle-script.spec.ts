import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const lifecycle = readFileSync(join(root, 'scripts/live-lifecycle.mjs'), 'utf8');
const fpsAuthLifecycle = readFileSync(join(root, 'scripts/live-fps-auth-lifecycle.mjs'), 'utf8');
const integrationSeed = readFileSync(join(root, 'scripts/seed-integration-fixtures.mjs'), 'utf8');

describe('live lifecycle identity and proof gates', () => {
  it('omits caller-controlled FPS/operator fields from the FPS distribution request', () => {
    const requestStart = lifecycle.indexOf("const distribution = await post('/distributions'");
    const requestEnd = lifecycle.indexOf('});', requestStart) + 3;
    const distributionRequest = lifecycle.slice(requestStart, requestEnd);
    expect(distributionRequest).toContain("post('/distributions'");
    expect(distributionRequest).not.toContain('fpsId');
    expect(distributionRequest).not.toContain('dealerId');
    expect(lifecycle).toContain("proof.status === 'COMMITTED'");
    expect(lifecycle).toContain('fabricTxId');
  });

  it('verifies step mass balance through beneficiary lift and FPS-scoped stock reads', () => {
    expect(lifecycle).toContain('assertMassBalance');
    expect(lifecycle).toContain('captureFpsStock');
    expect(lifecycle).toContain('monthlyEntitlementKg');
    expect(lifecycle).toContain('aadhaarRefHash');
    expect(lifecycle).toContain('expectedShortageEntityIds');
    expect(lifecycle).toContain('PROOF_REQUIRED_EVENT_TYPES');
    expect(lifecycle).toContain('RegisterStakeholder');
    expect(lifecycle).not.toContain('procToFci');
    expect(lifecycle).not.toContain('depotToIssue');
    expect(lifecycle).toContain("authResult: 'SUCCESS'");
    const authRequestStart = lifecycle.indexOf("await post('/auth/mock-otp'");
    const authRequestEnd = lifecycle.indexOf('});', authRequestStart) + 3;
    const authRequest = lifecycle.slice(authRequestStart, authRequestEnd);
    expect(authRequest).toContain("post('/auth/mock-otp'");
    expect(authRequest).not.toContain('authMode');
  });

  it('includes negative deficit scenarios that expect durable audit alerts', () => {
    expect(lifecycle).toContain('runNegativeDeficitScenarios');
    expect(lifecycle).toContain('DUPLICATE_CLAIM');
    expect(lifecycle).toContain('UNAUTHORIZED_TRANSACTION');
    expect(lifecycle).toContain('over-allocation');
    expect(lifecycle).toContain('unauthorized-stage-ii');
    expect(lifecycle).toContain('fps-over-receipt');
    expect(lifecycle).toContain('fps-short-receipt');
    expect(lifecycle).toContain('expectRejected');
  });

  it('loads provisional integration fixtures only through the authenticated adapter endpoints', () => {
    expect(integrationSeed).toContain('pds-integration-maharashtra');
    expect(integrationSeed).toContain('PDS_INTEGRATION_CLIENT_SECRET');
    expect(integrationSeed).toContain("Authorization: `Bearer ${token}`");
    expect(integrationSeed).toContain('realIntegration: false');
    expect(integrationSeed).toContain("request('/integrations/reconcile', 'POST')");
    expect(integrationSeed).toContain("request('/integrations/health')");
  });

  it('covers FPS auth success, mock-driven failures, and distribution gates', () => {
    expect(fpsAuthLifecycle).toContain('epos-auth-mock');
    expect(fpsAuthLifecycle).toContain("post('/auth/mock-otp'");
    expect(fpsAuthLifecycle).toContain("post('/auth/simulated-biometric'");
    expect(fpsAuthLifecycle).toContain("'/auth/supervisor-exception'");
    expect(fpsAuthLifecycle).toContain('aadhaar-demo-fail-hash');
    expect(fpsAuthLifecycle).toContain('aadhaar-demo-suspended-hash');
    expect(fpsAuthLifecycle).toContain('aadhaar-demo-mismatch-hash');
    expect(fpsAuthLifecycle).toContain('demo-ration-card-fail-hash');
    expect(fpsAuthLifecycle).toContain('AADHAAR_AUTH_FAILED');
    expect(fpsAuthLifecycle).toContain('AADHAAR_SUSPENDED_REF');
    expect(fpsAuthLifecycle).toContain('AADHAAR_DEMOGRAPHIC_MISMATCH');
    expect(fpsAuthLifecycle).toContain('distribution-blocked-after-auth-failure');
    expect(fpsAuthLifecycle).toContain('UNAUTHORIZED_TRANSACTION');
    expect(fpsAuthLifecycle).toContain('123412341234');
    const otpStart = fpsAuthLifecycle.indexOf("post('/auth/mock-otp', authBody");
    expect(otpStart).toBeGreaterThan(-1);
    expect(fpsAuthLifecycle.slice(otpStart, otpStart + 220)).not.toContain('authMode');
  });
});
