import { describe, expect, it } from 'vitest';
import { EposAuthEngine } from '../src/auth-engine.js';
import { handleEposAuthHttp } from '../src/server.js';

const request = (aadhaarRefHash: string, authTxnId = 'AUTH-CONFLICT-001') => ({
  authTxnId,
  aadhaarRefHash,
  beneficiaryRefHash: 'beneficiary-hash',
  rationCardHash: 'demo-ration-card-hash',
  fpsRef: 'FPS-101',
  authMode: 'MOCK_OTP' as const,
  schemaVersion: '1.0' as const
});

describe('epos-auth-mock HTTP boundary', () => {
  it('exposes public health and protects authenticate with bearer auth', () => {
    const engine = new EposAuthEngine();
    const health = handleEposAuthHttp('service-secret', engine, { method: 'GET', url: '/health' });
    expect(health.status).toBe(200);
    expect((health.body as { simulationOnly: boolean }).simulationOnly).toBe(true);

    expect(
      handleEposAuthHttp('service-secret', engine, {
        method: 'POST',
        url: '/v1/authenticate',
        body: request('aadhaar-demo-001-hash')
      }).status
    ).toBe(401);
  });

  it('simulates Aadhaar OTP success and failure by opaque ref', () => {
    const engine = new EposAuthEngine();
    const ok = handleEposAuthHttp('service-secret', engine, {
      method: 'POST',
      url: '/v1/aadhaar/auth',
      authorization: 'Bearer service-secret',
      body: request('aadhaar-demo-001-hash', 'AUTH-OK-001')
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      authResult: 'SUCCESS',
      reasonCode: 'AADHAAR_AUTH_SUCCESS',
      aadhaarRefHash: 'aadhaar-demo-001-hash',
      simulationOnly: true
    });

    const failed = handleEposAuthHttp('service-secret', engine, {
      method: 'POST',
      url: '/v1/authenticate',
      authorization: 'Bearer service-secret',
      body: request('aadhaar-demo-fail-hash', 'AUTH-FAIL-001')
    });
    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({
      authResult: 'FAILURE',
      reasonCode: 'AADHAAR_AUTH_FAILED'
    });
  });

  it('returns 409 for conflicting authTxnId reuse', () => {
    const engine = new EposAuthEngine();
    const send = (aadhaarRefHash: string) =>
      handleEposAuthHttp('service-secret', engine, {
        method: 'POST',
        url: '/v1/authenticate',
        authorization: 'Bearer service-secret',
        body: request(aadhaarRefHash)
      });
    expect(send('aadhaar-demo-001-hash').status).toBe(200);
    expect(send('aadhaar-demo-fail-hash').status).toBe(409);
  });

  it('rejects raw Aadhaar fields', () => {
    const engine = new EposAuthEngine();
    const result = handleEposAuthHttp('service-secret', engine, {
      method: 'POST',
      url: '/v1/authenticate',
      authorization: 'Bearer service-secret',
      body: { ...request('aadhaar-demo-001-hash', 'AUTH-BAD'), aadhaar: '123412341234' }
    });
    expect(result.status).toBe(400);
  });
});
