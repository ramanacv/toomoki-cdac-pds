import { Injectable } from '@nestjs/common';
import type { IdentityProvider, PdsIdentity, PdsRole } from './identity-provider.js';

/**
 * Default stub identity provider (T2.5). Accepts a single configured static
 * dev token (PDS_DEV_AUTH_TOKEN) and maps it to a role from PDS_DEV_AUTH_ROLE.
 * Any other token is rejected (returns null). This is NOT a JWT verifier — it
 * exists so the enforcement layer is testable end-to-end without an IdP. Swap
 * for a real verifier in production.
 */
const ROLES: PdsRole[] = ['procurement', 'godown', 'fps', 'department', 'auditor'];

@Injectable()
export class StubIdentityProvider implements IdentityProvider {
  async verify(token: string): Promise<PdsIdentity | null> {
    const expected = process.env.PDS_DEV_AUTH_TOKEN?.trim();
    if (!expected || expected.length === 0) {
      return null;
    }
    if (token !== expected) {
      return null;
    }
    const roleEnv = process.env.PDS_DEV_AUTH_ROLE?.trim().toLowerCase();
    const role = roleEnv && ROLES.includes(roleEnv as PdsRole) ? (roleEnv as PdsRole) : undefined;
    const claims = { sub: process.env.PDS_DEV_AUTH_SUBJECT ?? 'dev-user', role };
    const identity: PdsIdentity = {
      subject: process.env.PDS_DEV_AUTH_SUBJECT ?? 'dev-user',
      claims
    };
    if (role) {
      identity.role = role;
    }
    return identity;
  }
}
