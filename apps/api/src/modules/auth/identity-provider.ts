export const PDS_ROLES = [
  'management',
  'department',
  'procurement',
  'fci',
  'godown',
  'fps',
  'auditor',
  'platform-admin',
  'metrics-reader',
  'demo-reset',
  'integration-service'
] as const;

export type PdsRole = (typeof PDS_ROLES)[number];

export type PdsIdentity = {
  subject: string;
  mspId?: string;
  organizationId?: string;
  stakeholderId?: string;
  roles: PdsRole[];
  claims: Record<string, unknown>;
};

/**
 * Identity verification seam. Online modes use the OIDC implementation; the
 * static implementation is deliberately restricted to automated tests.
 */
export interface IdentityProvider {
  verify(token: string): Promise<PdsIdentity | null>;
}

/** DI token for the {@link IdentityProvider} implementation. */
export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

/** Request shape the auth guard inspects. */
export type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
  path?: string;
  method?: string;
  ip?: string;
  route?: { path?: string };
  user?: PdsIdentity;
};
