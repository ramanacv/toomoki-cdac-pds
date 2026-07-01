import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessAuthGuard } from '../src/modules/auth/auth.guard.js';
import type { IdentityProvider, PdsIdentity } from '../src/modules/auth/identity-provider.js';

type FakeRequest = {
  headers: Record<string, string | string[] | undefined>;
  path: string;
  url: string;
  user?: PdsIdentity;
};

const makeContext = (
  headers: Record<string, string | string[] | undefined>,
  path = '/distributions'
): { ctx: ExecutionContext; request: FakeRequest } => {
  const request: FakeRequest = { headers, path, url: path };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext;
  return { ctx, request };
};

const identity = (role?: PdsIdentity['role']): PdsIdentity => {
  const base: PdsIdentity = {
    subject: 'user-1',
    claims: { sub: 'user-1', role }
  };
  if (role) {
    base.role = role;
  }
  return base;
};

describe('BusinessAuthGuard (T2.5 / T6.2)', () => {
  const origMode = process.env.PDS_LEDGER_MODE;
  let guard: BusinessAuthGuard;

  beforeEach(() => {
    process.env.PDS_LEDGER_MODE = 'fabric';
  });

  afterEach(() => {
    if (origMode === undefined) delete process.env.PDS_LEDGER_MODE;
    else process.env.PDS_LEDGER_MODE = origMode;
  });

  it('allows open access in demo mode (and warns once)', async () => {
    process.env.PDS_LEDGER_MODE = 'demo';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider: IdentityProvider = { verify: vi.fn() };
    guard = new BusinessAuthGuard(provider);
    await expect(guard.canActivate(makeContext({}).ctx)).resolves.toBe(true);
    await guard.canActivate(makeContext({}).ctx);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('rejects requests with no Authorization header in fabric mode', async () => {
    const provider: IdentityProvider = { verify: vi.fn().mockResolvedValue(identity('fps')) };
    guard = new BusinessAuthGuard(provider);
    await expect(guard.canActivate(makeContext({}).ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects malformed (non-bearer) Authorization headers', async () => {
    const provider: IdentityProvider = { verify: vi.fn() };
    guard = new BusinessAuthGuard(provider);
    await expect(guard.canActivate(makeContext({ authorization: 'Basic abc' }).ctx)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('rejects empty bearer tokens', async () => {
    const provider: IdentityProvider = { verify: vi.fn() };
    guard = new BusinessAuthGuard(provider);
    await expect(guard.canActivate(makeContext({ authorization: 'Bearer ' }).ctx)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('accepts a valid token and attaches the identity to the request', async () => {
    const provider: IdentityProvider = { verify: vi.fn().mockResolvedValue(identity('fps')) };
    guard = new BusinessAuthGuard(provider);
    const { ctx, request } = makeContext({ authorization: 'Bearer good-token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user?.subject).toBe('user-1');
  });

  it('rejects when the identity provider returns null', async () => {
    const provider: IdentityProvider = { verify: vi.fn().mockResolvedValue(null) };
    guard = new BusinessAuthGuard(provider);
    await expect(guard.canActivate(makeContext({ authorization: 'Bearer bad' }).ctx)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('leaves health / openapi / admin paths ungated', async () => {
    const provider: IdentityProvider = { verify: vi.fn() };
    guard = new BusinessAuthGuard(provider);
    for (const path of ['/health', '/openapi.json', '/admin/reset']) {
      await expect(guard.canActivate(makeContext({}, path).ctx)).resolves.toBe(true);
    }
    expect(provider.verify).not.toHaveBeenCalled();
  });
});
