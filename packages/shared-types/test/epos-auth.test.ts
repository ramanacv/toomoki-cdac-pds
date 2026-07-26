import { describe, expect, it } from 'vitest';
import { validateEposAuthRequest, validateEposAuthResponse } from '../src/epos-auth.js';

const request = {
  authTxnId: 'AUTH-DEMO-001',
  aadhaarRefHash: 'aadhaar-demo-001-hash',
  beneficiaryRefHash: 'beneficiary-hash',
  rationCardHash: 'demo-ration-card-hash',
  fpsRef: 'FPS-101',
  authMode: 'MOCK_OTP' as const,
  schemaVersion: '1.0' as const
};

describe('ePoS / Aadhaar-format auth contract', () => {
  it('accepts privacy-safe Aadhaar-linked authentication requests', () => {
    expect(validateEposAuthRequest(request)).toEqual(request);
  });

  it('rejects raw Aadhaar, OTP, biometric, and phone fields', () => {
    expect(() => validateEposAuthRequest({ ...request, aadhaar: '123412341234' })).toThrow(/prohibited/);
    expect(() => validateEposAuthRequest({ ...request, otp: '123456' })).toThrow(/prohibited/);
    expect(() => validateEposAuthRequest({ ...request, biometric: 'template' })).toThrow(/prohibited/);
    expect(() => validateEposAuthRequest({ ...request, phone: '9999999999' })).toThrow(/prohibited/);
    expect(() => validateEposAuthRequest({ ...request, aadhaarRefHash: '123456789012' })).toThrow(/raw numeric/);
  });

  it('requires approvedBy only for supervisor exceptions', () => {
    expect(() =>
      validateEposAuthRequest({ ...request, authMode: 'SUPERVISOR_EXCEPTION' })
    ).toThrow(/approvedBy/);
    expect(
      validateEposAuthRequest({
        ...request,
        authMode: 'SUPERVISOR_EXCEPTION',
        approvedBy: 'SUPERVISOR-01'
      }).approvedBy
    ).toBe('SUPERVISOR-01');
  });

  it('requires simulationOnly responses with opaque Aadhaar refs', () => {
    const response = validateEposAuthResponse({
      ...request,
      authResult: 'SUCCESS',
      reasonCode: 'AADHAAR_AUTH_SUCCESS',
      maskedAadhaarLabel: 'XXXX-XXXX-0001',
      simulationOnly: true,
      assessedAt: '2026-07-25T08:00:00.000Z'
    });
    expect(response.authResult).toBe('SUCCESS');
    expect(response.aadhaarRefHash).toBe('aadhaar-demo-001-hash');
    expect(() =>
      validateEposAuthResponse({
        ...request,
        authResult: 'SUCCESS',
        reasonCode: 'AADHAAR_AUTH_SUCCESS',
        simulationOnly: false,
        assessedAt: '2026-07-25T08:00:00.000Z'
      })
    ).toThrow(/simulationOnly/);
  });
});
