/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessAuthGuard, normalizeSecurityRoute } from '../src/modules/auth/auth.guard.js';
import type { IdentityProvider, PdsIdentity } from '../src/modules/auth/identity-provider.js';
import { IS_PUBLIC_KEY } from '../src/modules/auth/public.decorator.js';

type FakeRequest = {
  headers: Record<string, string | string[] | undefined>;
  path: string;
  url: string;
  method: string;
  ip: string;
  user?: PdsIdentity;
};

const makeContext = (
  headers: Record<string, string | string[] | undefined>,
  path = '/distributions',
  method = 'GET'
): { ctx: ExecutionContext; request: FakeRequest } => {
  const request: FakeRequest = { headers, path, url: path, method, ip: '127.0.0.1' };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => {},
    getClass: () => class {}
  } as unknown as ExecutionContext;
  return { ctx, request };
};

const identity = (...roles: PdsIdentity['roles']): PdsIdentity => ({
  subject: 'user-1', roles, claims: { sub: 'user-1', roles }
});

describe('BusinessAuthGuard (T2.5 / T6.2)', () => {
  let guard: BusinessAuthGuard;
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(undefined)
  } as any;

  beforeEach(() => {
    reflector.getAllAndOverride.mockReset().mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows only explicitly public routes without authentication', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => key === IS_PUBLIC_KEY ? true : undefined);
    const provider: IdentityProvider = { verify: vi.fn() };
    guard = new BusinessAuthGuard(provider, reflector);
    await expect(guard.canActivate(makeContext({}).ctx)).resolves.toBe(true);
    expect(provider.verify).not.toHaveBeenCalled();
  });

  it('normalizes beneficiary and entity identifiers before security logging', () => {
    expect(normalizeSecurityRoute('/entitlements/demo-ration-card-hash?commodity=Rice')).toBe('/entitlements/:id');
    expect(normalizeSecurityRoute('/transfers/TR-SECRET/receive')).toBe('/transfers/:id/receive');
  });

  it('rejects requests with no Authorization header in fabric mode', async () => {
    const provider: IdentityProvider = { verify: vi.fn().mockResolvedValue(identity('fps')) };
    guard = new BusinessAuthGuard(provider, reflector);
    await expect(guard.canActivate(makeContext({}).ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed (non-bearer) Authorization headers', async () => {
    const provider: IdentityProvider = { verify: vi.fn() };
    guard = new BusinessAuthGuard(provider, reflector);
    await expect(guard.canActivate(makeContext({ authorization: 'Basic abc' }).ctx)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('rejects empty bearer tokens', async () => {
    const provider: IdentityProvider = { verify: vi.fn() };
    guard = new BusinessAuthGuard(provider, reflector);
    await expect(guard.canActivate(makeContext({ authorization: 'Bearer ' }).ctx)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('accepts a valid token and attaches the identity to the request', async () => {
    const provider: IdentityProvider = { verify: vi.fn().mockResolvedValue(identity('fps')) };
    guard = new BusinessAuthGuard(provider, reflector);
    const { ctx, request } = makeContext({ authorization: 'Bearer good-token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user?.subject).toBe('user-1');
  });

  it('returns forbidden when an authenticated identity lacks the required role', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => key === 'roles' ? ['department'] : undefined);
    const provider: IdentityProvider = { verify: vi.fn().mockResolvedValue(identity('fps')) };
    guard = new BusinessAuthGuard(provider, reflector);
    await expect(guard.canActivate(makeContext({ authorization: 'Bearer good-token' }).ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when the identity provider returns null', async () => {
    const provider: IdentityProvider = { verify: vi.fn().mockResolvedValue(null) };
    guard = new BusinessAuthGuard(provider, reflector);
    await expect(guard.canActivate(makeContext({ authorization: 'Bearer bad' }).ctx)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('does not bypass authentication based on a public-looking path', async () => {
    const provider: IdentityProvider = { verify: vi.fn() };
    guard = new BusinessAuthGuard(provider, reflector);
    for (const path of ['/health', '/openapi.json', '/admin/reset']) {
      await expect(guard.canActivate(makeContext({}, path).ctx)).rejects.toThrow(UnauthorizedException);
    }
    expect(provider.verify).not.toHaveBeenCalled();
  });

  it.each([
    ['read', '/dashboard/summary', 'GET', 120],
    ['mutation', '/lots', 'POST', 30],
    ['reset', '/admin/reset', 'POST', 3]
  ])('enforces the %s per-subject/IP rate limit', async (_bucket, path, method, allowed) => {
    const provider: IdentityProvider = { verify: vi.fn().mockResolvedValue(identity('platform-admin', 'demo-reset')) };
    guard = new BusinessAuthGuard(provider, reflector);
    for (let index = 0; index < allowed; index += 1) {
      await expect(guard.canActivate(makeContext({ authorization: 'Bearer good-token' }, path, method).ctx)).resolves.toBe(true);
    }
    await expect(guard.canActivate(makeContext({ authorization: 'Bearer good-token' }, path, method).ctx)).rejects.toMatchObject({ status: 429 });
  });

  it('honors explicit positive read and mutation rate-limit overrides', async () => {
    process.env.PDS_RATE_LIMIT_READ_PER_MINUTE = '2';
    process.env.PDS_RATE_LIMIT_MUTATION_PER_MINUTE = '1';
    try {
      const provider: IdentityProvider = { verify: vi.fn().mockResolvedValue(identity('platform-admin')) };
      guard = new BusinessAuthGuard(provider, reflector);
      const read = () => guard.canActivate(makeContext({ authorization: 'Bearer good-token' }, '/dashboard/summary', 'GET').ctx);
      const mutation = () => guard.canActivate(makeContext({ authorization: 'Bearer good-token' }, '/lots', 'POST').ctx);
      await expect(read()).resolves.toBe(true);
      await expect(read()).resolves.toBe(true);
      await expect(read()).rejects.toMatchObject({ status: 429 });
      await expect(mutation()).resolves.toBe(true);
      await expect(mutation()).rejects.toMatchObject({ status: 429 });
    } finally {
      delete process.env.PDS_RATE_LIMIT_READ_PER_MINUTE;
      delete process.env.PDS_RATE_LIMIT_MUTATION_PER_MINUTE;
    }
  });
});
