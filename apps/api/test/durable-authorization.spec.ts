import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanonicalSourceEventType, SourceSystem } from '@pds/shared-types';
import { DurableAuthorizationService } from '../src/modules/auth/durable-authorization.service.js';
import type { PdsIdentity } from '../src/modules/auth/identity-provider.js';

describe('durable database authorization', () => {
  const originalMode = process.env.PDS_AUTHORIZATION_MODE;
  afterEach(() => {
    if (originalMode === undefined) delete process.env.PDS_AUTHORIZATION_MODE;
    else process.env.PDS_AUTHORIZATION_MODE = originalMode;
  });

  it('uses active database role, FPS scope, source, and credential assignments in pilot mode', async () => {
    process.env.PDS_AUTHORIZATION_MODE = 'database';
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('subject_role_assignments')) return { rows: [{ role: 'fps' }], rowCount: 1 };
      return { rows: [{ authorized: 1 }], rowCount: 1 };
    });
    const service = new DurableAuthorizationService({
      getOperationalPool: () => ({ query })
    } as never);
    const identity: PdsIdentity = {
      subject: 'subject-1',
      stakeholderId: 'FPS-101',
      roles: ['fps'],
      claims: { azp: 'pds-integration-maharashtra' }
    };
    await expect(service.assertRoles(identity, ['fps'])).resolves.toBeUndefined();
    await expect(service.assertFpsScope(identity, 'FPS-101')).resolves.toBeUndefined();
    await expect(service.assertIntegrationContract(
      identity,
      SourceSystem.STATE_SCM,
      'scm',
      CanonicalSourceEventType.ALLOCATION
    )).resolves.toBeUndefined();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('integration_credentials'))).toBe(true);
  });

  it('fails closed when an assignment is absent or the database is unavailable', async () => {
    process.env.PDS_AUTHORIZATION_MODE = 'database';
    const identity: PdsIdentity = { subject: 'subject-1', roles: ['fps'], claims: {} };
    const denied = new DurableAuthorizationService({
      getOperationalPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) })
    } as never);
    await expect(denied.assertRoles(identity, ['fps'])).rejects.toMatchObject({ status: 403 });
    await expect(denied.assertFpsScope(identity, 'FPS-101')).rejects.toMatchObject({ status: 403 });
    const unavailable = new DurableAuthorizationService({ getOperationalPool: () => null } as never);
    await expect(unavailable.assertRoles(identity, ['fps'])).rejects.toMatchObject({ status: 403 });
  });

  it('retains claims-only authorization solely when database mode is not enabled', async () => {
    process.env.PDS_AUTHORIZATION_MODE = 'claims';
    const service = new DurableAuthorizationService({ getOperationalPool: () => null } as never);
    await expect(service.assertRoles(
      { subject: 'demo', roles: ['department'], claims: {} },
      ['department']
    )).resolves.toBeUndefined();
  });
});
