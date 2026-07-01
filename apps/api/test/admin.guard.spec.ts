import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AdminGuard } from '../src/modules/admin/admin.guard.js';

const makeContext = (headers: Record<string, string | string[] | undefined>, ip = '203.0.113.1'): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers, ip, socket: { remoteAddress: ip } })
    })
  }) as unknown as ExecutionContext;

describe('AdminGuard (T2.4 / T6.2)', () => {
  const origToken = process.env.PDS_ADMIN_TOKEN;
  const origMode = process.env.PDS_LEDGER_MODE;
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
    delete process.env.PDS_ADMIN_TOKEN;
    process.env.PDS_LEDGER_MODE = 'demo';
  });

  afterEach(() => {
    if (origToken === undefined) delete process.env.PDS_ADMIN_TOKEN;
    else process.env.PDS_ADMIN_TOKEN = origToken;
    if (origMode === undefined) delete process.env.PDS_LEDGER_MODE;
    else process.env.PDS_LEDGER_MODE = origMode;
  });

  it('allows open access in demo mode when no token is configured', () => {
    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it('rejects requests with no token when a token is configured', () => {
    process.env.PDS_ADMIN_TOKEN = 'secret-admin-token';
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('rejects empty X-Admin-Token values', () => {
    process.env.PDS_ADMIN_TOKEN = 'secret-admin-token';
    expect(() => guard.canActivate(makeContext({ 'x-admin-token': '' }))).toThrow(UnauthorizedException);
  });

  it('accepts a correct X-Admin-Token', () => {
    process.env.PDS_ADMIN_TOKEN = 'secret-admin-token';
    expect(guard.canActivate(makeContext({ 'x-admin-token': 'secret-admin-token' }))).toBe(true);
  });

  it('rejects a wrong X-Admin-Token', () => {
    process.env.PDS_ADMIN_TOKEN = 'secret-admin-token';
    expect(() => guard.canActivate(makeContext({ 'x-admin-token': 'wrong-token' }))).toThrow(UnauthorizedException);
  });

  it('rate-limits after repeated failed attempts from one IP', () => {
    process.env.PDS_ADMIN_TOKEN = 'secret-admin-token';
    const ip = '198.51.100.7';
    for (let i = 0; i < 10; i += 1) {
      expect(() => guard.canActivate(makeContext({ 'x-admin-token': 'wrong' }, ip))).toThrow(UnauthorizedException);
    }
    // 11th attempt — even the correct token is blocked within the window.
    expect(() => guard.canActivate(makeContext({ 'x-admin-token': 'secret-admin-token' }, ip))).toThrow(
      UnauthorizedException
    );
  });

  it('fails closed when required (fabric) but no token configured', () => {
    process.env.PDS_LEDGER_MODE = 'fabric';
    expect(() => guard.canActivate(makeContext({ 'x-admin-token': 'anything' }))).toThrow(UnauthorizedException);
  });
});
