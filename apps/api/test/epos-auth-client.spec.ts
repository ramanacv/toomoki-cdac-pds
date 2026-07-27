import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthMode, AuthResult } from '@pds/shared-types';
import {
  authResultFromEposResponse,
  createEposAuthAdapter,
  HttpEposAuthAdapter,
  LocalEposAuthAdapter
} from '../src/modules/auth/epos-auth-client.js';

const baseInput = {
  authTxnId: 'AUTH-UNIT-001',
  aadhaarRefHash: 'aadhaar-demo-001-hash',
  beneficiaryRefHash: 'beneficiary-hash',
  rationCardHash: 'demo-ration-card-hash',
  fpsRef: 'FPS-101',
  authMode: AuthMode.MOCK_OTP,
  authResult: AuthResult.SUCCESS
};

describe('ePoS Aadhaar-format auth adapter', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses local client-driven simulation when the external mock is unset', async () => {
    vi.stubEnv('PDS_EPOS_AUTH_SERVICE_URL', '');
    vi.stubEnv('PDS_EPOS_AUTH_SERVICE_TOKEN', '');
    const adapter = createEposAuthAdapter();
    expect(adapter).toBeInstanceOf(LocalEposAuthAdapter);
    expect(adapter.isConfigured()).toBe(false);
    const outcome = await adapter.authenticate(baseInput, 'corr-1');
    expect(outcome.reasonCode).toBe('LOCAL_CLIENT_SIMULATION');
    expect(authResultFromEposResponse(outcome)).toBe(AuthResult.SUCCESS);
  });

  it('calls the external Aadhaar-format mock when configured', async () => {
    vi.stubEnv('PDS_EPOS_AUTH_SERVICE_URL', 'http://epos-auth-mock:3011');
    vi.stubEnv('PDS_EPOS_AUTH_SERVICE_TOKEN', 'service-secret');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        authTxnId: baseInput.authTxnId,
        authMode: 'MOCK_OTP',
        authResult: 'FAILURE',
        aadhaarRefHash: baseInput.aadhaarRefHash,
        beneficiaryRefHash: baseInput.beneficiaryRefHash,
        rationCardHash: baseInput.rationCardHash,
        fpsRef: baseInput.fpsRef,
        reasonCode: 'AADHAAR_AUTH_FAILED',
        simulationOnly: true,
        assessedAt: '2026-07-25T08:00:00.000Z',
        schemaVersion: '1.0'
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createEposAuthAdapter();
    expect(adapter).toBeInstanceOf(HttpEposAuthAdapter);
    const outcome = await adapter.authenticate(baseInput, 'corr-2');
    expect(authResultFromEposResponse(outcome)).toBe(AuthResult.FAILURE);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://epos-auth-mock:3011/v1/authenticate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer service-secret' })
      })
    );
    const posted = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(posted.aadhaarRefHash).toBe('aadhaar-demo-001-hash');
    expect(posted.aadhaar).toBeUndefined();
    expect(posted.otp).toBeUndefined();
  });
});
