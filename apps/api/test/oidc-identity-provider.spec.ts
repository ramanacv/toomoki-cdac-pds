import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OidcIdentityProvider, type OidcRuntimeConfig } from '../src/modules/auth/oidc-identity-provider.js';

const issuer = 'http://iam.test/realms/viksitpds';
const config: OidcRuntimeConfig = {
  issuer,
  audience: 'pds-api',
  jwksUri: `${issuer}/protocol/openid-connect/certs`,
  clockSkewSeconds: 0,
  jwksCacheMs: 60_000
};

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };

const token = (overrides: Record<string, unknown> = {}, signingKey = privateKey): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-key' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    sub: 'user-123',
    iss: issuer,
    aud: ['account', 'pds-api'],
    exp: Math.floor(Date.now() / 1000) + 300,
    realm_access: { roles: ['fps', 'offline_access'] },
    pds_org_id: 'FPS-ORG-101',
    pds_stakeholder_id: 'FPS-101',
    pds_msp_id: 'FairPriceShopMSP',
    ...overrides
  })).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), signingKey).toString('base64url');
  return `${header}.${claims}.${signature}`;
};

describe('OidcIdentityProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('verifies an RS256 Keycloak token and maps canonical and scope claims', async () => {
    const identity = await new OidcIdentityProvider(config).verify(token());
    expect(identity).toEqual(expect.objectContaining({
      subject: 'user-123',
      roles: ['fps'],
      organizationId: 'FPS-ORG-101',
      stakeholderId: 'FPS-101',
      mspId: 'FairPriceShopMSP'
    }));
    expect(fetch).toHaveBeenCalledWith(config.jwksUri, { headers: { accept: 'application/json' } });
  });

  it.each([
    ['wrong issuer', { iss: 'http://attacker.test/realms/viksitpds' }],
    ['wrong audience', { aud: 'another-api' }],
    ['expired token', { exp: Math.floor(Date.now() / 1000) - 1 }],
    ['not-yet-valid token', { nbf: Math.floor(Date.now() / 1000) + 60 }]
  ])('rejects a %s', async (_label, claims) => {
    await expect(new OidcIdentityProvider(config).verify(token(claims))).resolves.toBeNull();
  });

  it('rejects a token with a bad signature', async () => {
    const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await expect(new OidcIdentityProvider(config).verify(token({}, attacker.privateKey))).resolves.toBeNull();
  });
});
