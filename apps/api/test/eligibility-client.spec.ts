import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpEligibilityScreeningAdapter } from '../src/modules/eligibility/eligibility-client.js';
import type { EligibilityScreeningRequest } from '@pds/shared-types';

const request: EligibilityScreeningRequest = {
  screeningRequestId: 'SCREEN-CLIENT-001', demoBeneficiaryId: 'BEN-DEMO-001',
  subjectRefHash: 'beneficiary-demo-001-hash', rationCardHash: 'ration-card-demo-001-hash',
  checks: ['DEATH'], schemaVersion: '1.0'
};
const valid = {
  screeningId: 'SCREENING-001', screeningRequestId: request.screeningRequestId,
  status: 'DEATH_MATCH_REVIEW',
  signals: [{ source: 'DEATH_REGISTRY', status: 'MATCH', risk: 'HIGH', observedAt: '2026-07-23T00:00:00Z', factCode: 'MATCH' }],
  recommendedReviewAction: 'VERIFY', policy: { policyId: 'MH-PANEL-DEMO-2026-V1', simulationOnly: true, ruleIds: ['DEATH-01'] },
  assessedAt: '2026-07-23T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
  evidenceDigest: 'a'.repeat(64), responseAttestationHash: 'b'.repeat(64), schemaVersion: '1.0'
};

describe('typed external eligibility client', () => {
  beforeEach(() => {
    process.env.PDS_ELIGIBILITY_SERVICE_URL = 'http://eligibility.test';
    process.env.PDS_ELIGIBILITY_SERVICE_TOKEN = 'test-service-secret';
    process.env.PDS_ELIGIBILITY_SERVICE_TIMEOUT_MS = '17';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PDS_ELIGIBILITY_SERVICE_URL;
    delete process.env.PDS_ELIGIBILITY_SERVICE_TOKEN;
    delete process.env.PDS_ELIGIBILITY_SERVICE_TIMEOUT_MS;
  });

  it('authenticates, correlates, and validates a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid), {
      status: 200, headers: { 'content-type': 'application/json' }
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await new HttpEligibilityScreeningAdapter().screen(request, 'CORR-CLIENT-001');
    expect(result.status).toBe('DEATH_MATCH_REVIEW');
    expect(fetchMock).toHaveBeenCalledWith('http://eligibility.test/v1/screenings', expect.objectContaining({
      headers: expect.objectContaining({
        authorization: 'Bearer test-service-secret',
        'x-correlation-id': 'CORR-CLIENT-001'
      })
    }));
  });

  it.each([
    [{ ...valid, status: 'AUTO_CANCEL' }, 'INVALID_RESPONSE'],
    [{ ...valid, expiresAt: '2020-01-01T00:00:00Z' }, 'INVALID_RESPONSE'],
    [{ ...valid, evidenceDigest: 'raw' }, 'INVALID_RESPONSE']
  ])('quarantines unknown, expired, or malformed response contracts', async (body, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    await expect(new HttpEligibilityScreeningAdapter().screen(request, 'CORR')).rejects.toMatchObject({ kind });
  });

  it('classifies timeout and conflicting replay for retry-safe handling', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError')));
    await expect(new HttpEligibilityScreeningAdapter().screen(request, 'CORR')).rejects.toMatchObject({ kind: 'TIMEOUT' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}', { status: 409 })));
    await expect(new HttpEligibilityScreeningAdapter().screen(request, 'CORR')).rejects.toMatchObject({ kind: 'CONFLICT' });
  });

  it('treats service authentication failure as unavailable without exposing the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));
    await expect(new HttpEligibilityScreeningAdapter().screen(request, 'CORR')).rejects.toMatchObject({
      kind: 'UNAVAILABLE',
      message: 'Eligibility service returned HTTP 401'
    });
  });
});
