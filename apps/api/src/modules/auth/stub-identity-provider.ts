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
    let stakeholderFromToken: string | undefined;
    if (token === expected) {
      // default role from env
    } else if (token.startsWith(`${expected}:`)) {
      const [roleToken, stakeholderToken] = token.slice(expected.length + 1).split(':', 2);
      const suffix = roleToken?.trim().toLowerCase() ?? '';
      if (!PDS_ROLES.includes(suffix as PdsRole)) {
        return null;
      }
      roleFromToken = suffix as PdsRole;
      if (stakeholderToken?.trim()) {
        stakeholderFromToken = stakeholderToken.trim();
      }
    } else {
      return null;
    }

    const roleEnv = process.env.PDS_TEST_AUTH_ROLE?.trim().toLowerCase();
    const role =
      roleFromToken ??
      (roleEnv && PDS_ROLES.includes(roleEnv as PdsRole) ? (roleEnv as PdsRole) : undefined);
    const subject = process.env.PDS_TEST_AUTH_SUBJECT ?? 'test-user';
    const roles = role ? [role] : [];
    const stakeholderId = stakeholderFromToken ?? process.env.PDS_TEST_AUTH_STAKEHOLDER?.trim();
    const integrationClaims = role === 'integration-service'
      ? {
          pds_source_systems: process.env.PDS_TEST_INTEGRATION_SOURCES?.trim() ?? '',
          pds_endpoint_families: process.env.PDS_TEST_INTEGRATION_FAMILIES?.trim() ?? '',
          pds_event_types: process.env.PDS_TEST_INTEGRATION_EVENT_TYPES?.trim() ?? ''
        }
      : {};
    return {
      subject,
      roles,
      ...(stakeholderId ? { stakeholderId } : {}),
      claims: {
        sub: subject,
        roles,
        ...(stakeholderId ? { pds_stakeholder_id: stakeholderId } : {}),
        ...integrationClaims
      }
    };
  }
}

/** @deprecated Use TestIdentityProvider. */
export { TestIdentityProvider as StubIdentityProvider };
