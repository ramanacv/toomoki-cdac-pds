import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PDS_ROLES, type IdentityProvider, type PdsIdentity, type PdsRole } from './identity-provider.js';

type JwtHeader = { alg?: string; kid?: string; typ?: string };
type JwtClaims = Record<string, unknown> & {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  realm_access?: { roles?: unknown };
  resource_access?: Record<string, { roles?: unknown }>;
};
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

const decodePart = <T>(value: string): T => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export type OidcRuntimeConfig = {
  issuer: string;
  audience: string;
  jwksUri: string;
  clockSkewSeconds: number;
  jwksCacheMs: number;
};

export const loadOidcRuntimeConfig = (): OidcRuntimeConfig => {
  const issuer = process.env.PDS_OIDC_ISSUER?.trim().replace(/\/$/, '') ?? '';
  const audience = process.env.PDS_OIDC_AUDIENCE?.trim() || 'pds-api';
  const clockSkew = Number(process.env.PDS_OIDC_CLOCK_SKEW_SECONDS ?? '30');
  const cacheMs = Number(process.env.PDS_OIDC_JWKS_CACHE_MS ?? '300000');
  return {
    issuer,
    audience,
    jwksUri: process.env.PDS_OIDC_JWKS_URI?.trim() || `${issuer}/protocol/openid-connect/certs`,
    clockSkewSeconds: Number.isFinite(clockSkew) && clockSkew >= 0 ? clockSkew : 30,
    jwksCacheMs: Number.isFinite(cacheMs) && cacheMs >= 0 ? cacheMs : 300_000
  };
};

@Injectable()
export class OidcIdentityProvider implements IdentityProvider {
  private keys = new Map<string, Jwk>();
  private keysExpiresAt = 0;

  constructor(private readonly config: OidcRuntimeConfig = loadOidcRuntimeConfig()) {
    if (!config.issuer) {
      throw new Error('PDS_OIDC_ISSUER is required when PDS_AUTH_MODE=oidc');
    }
  }

  async verify(token: string): Promise<PdsIdentity | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string];

    let header: JwtHeader;
    let claims: JwtClaims;
    try {
      header = decodePart<JwtHeader>(encodedHeader);
      claims = decodePart<JwtClaims>(encodedClaims);
    } catch {
      return null;
    }
    if (header.alg !== 'RS256' || !header.kid || !claims.sub || claims.iss !== this.config.issuer) return null;

    const audiences = Array.isArray(claims.aud) ? claims.aud : typeof claims.aud === 'string' ? [claims.aud] : [];
    if (!audiences.includes(this.config.audience)) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp + this.config.clockSkewSeconds < now) return null;
    if (typeof claims.nbf === 'number' && claims.nbf - this.config.clockSkewSeconds > now) return null;

    const key = await this.getKey(header.kid);
    if (!key) return null;
    let signatureValid = false;
    try {
      signatureValid = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${encodedHeader}.${encodedClaims}`),
        createPublicKey({ key, format: 'jwk' }),
        Buffer.from(encodedSignature, 'base64url')
      );
    } catch {
      return null;
    }
    if (!signatureValid) return null;

    const claimedRoles = new Set([
      ...stringArray(claims.realm_access?.roles),
      ...stringArray(claims.resource_access?.[this.config.audience]?.roles),
      ...stringArray(claims.roles),
      ...(typeof claims.role === 'string' ? [claims.role] : [])
    ]);
    const roles = PDS_ROLES.filter((role) => claimedRoles.has(role)) as PdsRole[];
    const identity: PdsIdentity = {
      subject: claims.sub,
      roles,
      claims
    };
    if (typeof claims.pds_org_id === 'string') identity.organizationId = claims.pds_org_id;
    if (typeof claims.pds_stakeholder_id === 'string') identity.stakeholderId = claims.pds_stakeholder_id;
    if (typeof claims.pds_msp_id === 'string') identity.mspId = claims.pds_msp_id;
    return identity;
  }

  private async getKey(kid: string): Promise<Jwk | undefined> {
    if (Date.now() >= this.keysExpiresAt || !this.keys.has(kid)) {
      const response = await fetch(this.config.jwksUri, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`OIDC JWKS request failed with ${response.status}`);
      const body = (await response.json()) as { keys?: Jwk[] };
      this.keys = new Map((body.keys ?? []).filter((key) => key.kid).map((key) => [key.kid!, key]));
      this.keysExpiresAt = Date.now() + this.config.jwksCacheMs;
    }
    return this.keys.get(kid);
  }
}
