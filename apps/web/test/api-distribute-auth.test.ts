import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthMode, AuthResult } from '@pds/shared-types';

describe('executeWorkflowAction distribute auth ledger', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('records mock OTP auth before posting a distribution', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/mock-otp')) {
        return new Response(JSON.stringify({ authTxnId: 'AUTH-DIST-1' }), { status: 201 });
      }
      if (url.endsWith('/distributions')) {
        return new Response(JSON.stringify({ distributionId: 'DIST-1' }), { status: 201 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { executeWorkflowAction } = await import('../src/api.js');

    await executeWorkflowAction({
      kind: 'distribute',
      payload: {
        distributionId: 'DIST-1',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: 25,
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS,
        authTxnRefHash: 'auth-ref-1',
        fpsId: 'FPS-101',
        dealerId: 'FPS-DEALER-101'
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/mock-otp');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      authTxnId: 'AUTH-DIST-1',
      rationCardHash: 'demo-ration-card-hash',
      authResult: AuthResult.SUCCESS
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/distributions');
    const distributeBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(distributeBody.fpsId).toBeUndefined();
    expect(distributeBody.dealerId).toBeUndefined();
  });

  it('records supervisor exception auth before exception distribute', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/supervisor-exception')) {
        return new Response(JSON.stringify({ authTxnId: 'AUTH-DIST-EX' }), { status: 201 });
      }
      if (url.endsWith('/distributions')) {
        return new Response(JSON.stringify({ distributionId: 'DIST-EX' }), { status: 201 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { executeWorkflowAction } = await import('../src/api.js');

    await executeWorkflowAction({
      kind: 'supervisor-exception-distribute',
      payload: {
        distributionId: 'DIST-EX',
        rationCardHash: 'exception-ration-card-hash',
        beneficiaryRefHash: 'exception-beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: 10,
        authMode: AuthMode.SUPERVISOR_EXCEPTION,
        authResult: AuthResult.SUCCESS,
        authTxnRefHash: 'auth-ref-ex',
        approvedBy: 'SUPERVISOR-101'
      }
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/supervisor-exception');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      approvedBy: 'SUPERVISOR-101',
      authTxnId: 'AUTH-DIST-EX'
    });
  });
});
