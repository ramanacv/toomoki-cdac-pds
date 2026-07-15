import { afterEach, describe, expect, it } from 'vitest';
import { StubIdentityProvider } from '../src/modules/auth/stub-identity-provider.js';

describe('StubIdentityProvider', () => {
  const original = {
    token: process.env.PDS_DEV_AUTH_TOKEN,
    role: process.env.PDS_DEV_AUTH_ROLE,
    subject: process.env.PDS_DEV_AUTH_SUBJECT
  };

  afterEach(() => {
    if (original.token === undefined) delete process.env.PDS_DEV_AUTH_TOKEN;
    else process.env.PDS_DEV_AUTH_TOKEN = original.token;
    if (original.role === undefined) delete process.env.PDS_DEV_AUTH_ROLE;
    else process.env.PDS_DEV_AUTH_ROLE = original.role;
    if (original.subject === undefined) delete process.env.PDS_DEV_AUTH_SUBJECT;
    else process.env.PDS_DEV_AUTH_SUBJECT = original.subject;
  });

  it('maps the base token to PDS_DEV_AUTH_ROLE', async () => {
    process.env.PDS_DEV_AUTH_TOKEN = 'dev-mvp-token';
    process.env.PDS_DEV_AUTH_ROLE = 'department';
    process.env.PDS_DEV_AUTH_SUBJECT = 'fabric-smoke';
    const provider = new StubIdentityProvider();
    const identity = await provider.verify('dev-mvp-token');
    expect(identity).toEqual(
      expect.objectContaining({
        subject: 'fabric-smoke',
        role: 'department'
      })
    );
  });

  it('accepts role-suffixed tokens for multi-actor fabric scripts', async () => {
    process.env.PDS_DEV_AUTH_TOKEN = 'dev-mvp-token';
    process.env.PDS_DEV_AUTH_ROLE = 'department';
    const provider = new StubIdentityProvider();
    const identity = await provider.verify('dev-mvp-token:procurement');
    expect(identity?.role).toBe('procurement');
  });

  it('rejects unknown roles and non-matching tokens', async () => {
    process.env.PDS_DEV_AUTH_TOKEN = 'dev-mvp-token';
    const provider = new StubIdentityProvider();
    await expect(provider.verify('dev-mvp-token:not-a-role')).resolves.toBeNull();
    await expect(provider.verify('wrong-token')).resolves.toBeNull();
    await expect(provider.verify('wrong-token:procurement')).resolves.toBeNull();
  });
});
