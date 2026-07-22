import { Injectable } from '@nestjs/common';
import { PDS_ROLES, type IdentityProvider, type PdsIdentity, type PdsRole } from './identity-provider.js';

/**
 * Static identity adapter for automated tests only. It cannot be selected in a
 * deployed runtime because AuthModule rejects test mode unless NODE_ENV=test.
 */
@Injectable()
export class TestIdentityProvider implements IdentityProvider {
  async verify(token: string): Promise<PdsIdentity | null> {
    const expected = process.env.PDS_TEST_AUTH_TOKEN?.trim();
    if (!expected || expected.length === 0) {
      return null;
    }

    let roleFromToken: PdsRole | undefined;
    if (token === expected) {
      // default role from env
    } else if (token.startsWith(`${expected}:`)) {
      const suffix = token.slice(expected.length + 1).trim().toLowerCase();
      if (!PDS_ROLES.includes(suffix as PdsRole)) {
        return null;
      }
      roleFromToken = suffix as PdsRole;
    } else {
      return null;
    }

    const roleEnv = process.env.PDS_TEST_AUTH_ROLE?.trim().toLowerCase();
    const role =
      roleFromToken ??
      (roleEnv && PDS_ROLES.includes(roleEnv as PdsRole) ? (roleEnv as PdsRole) : undefined);
    const subject = process.env.PDS_TEST_AUTH_SUBJECT ?? 'test-user';
    const roles = role ? [role] : [];
    return { subject, roles, claims: { sub: subject, roles } };
  }
}

/** @deprecated Use TestIdentityProvider. */
export { TestIdentityProvider as StubIdentityProvider };
