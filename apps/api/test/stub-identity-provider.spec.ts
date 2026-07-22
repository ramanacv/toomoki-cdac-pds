import { afterEach, describe, expect, it } from 'vitest';
import { StubIdentityProvider } from '../src/modules/auth/stub-identity-provider.js';

describe('StubIdentityProvider', () => {
  const original = {
    token: process.env.PDS_TEST_AUTH_TOKEN,
    role: process.env.PDS_TEST_AUTH_ROLE,
    subject: process.env.PDS_TEST_AUTH_SUBJECT
  };

  afterEach(() => {
    if (original.token === undefined) delete process.env.PDS_TEST_AUTH_TOKEN;
    else process.env.PDS_TEST_AUTH_TOKEN = original.token;
    if (original.role === undefined) delete process.env.PDS_TEST_AUTH_ROLE;
    else process.env.PDS_TEST_AUTH_ROLE = original.role;
    if (original.subject === undefined) delete process.env.PDS_TEST_AUTH_SUBJECT;
    else process.env.PDS_TEST_AUTH_SUBJECT = original.subject;
  });

  it('maps the base token to PDS_TEST_AUTH_ROLE', async () => {
    process.env.PDS_TEST_AUTH_TOKEN = 'test-token';
    process.env.PDS_TEST_AUTH_ROLE = 'department';
    process.env.PDS_TEST_AUTH_SUBJECT = 'test-actor';
    const provider = new StubIdentityProvider();
    const identity = await provider.verify('test-token');
    expect(identity).toEqual(
      expect.objectContaining({
        subject: 'test-actor',
        roles: ['department']
      })
    );
  });

  it('accepts role-suffixed tokens for multi-actor fabric scripts', async () => {
    process.env.PDS_TEST_AUTH_TOKEN = 'test-token';
    process.env.PDS_TEST_AUTH_ROLE = 'department';
    const provider = new StubIdentityProvider();
    const identity = await provider.verify('test-token:procurement');
    expect(identity?.roles).toEqual(['procurement']);
  });

  it('rejects unknown roles and non-matching tokens', async () => {
    process.env.PDS_TEST_AUTH_TOKEN = 'test-token';
    const provider = new StubIdentityProvider();
    await expect(provider.verify('test-token:not-a-role')).resolves.toBeNull();
    await expect(provider.verify('wrong-token')).resolves.toBeNull();
    await expect(provider.verify('wrong-token:procurement')).resolves.toBeNull();
  });
});
