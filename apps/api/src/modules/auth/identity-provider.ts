/**
 * Role claim values, aligned with the chaincode MSP mapping (T1.5):
 *   procurement  → ProcurementMillerMSP
 *   godown       → GodownWarehouseMSP
 *   fps          → FairPriceShopMSP
 *   department   → FoodAndCivilSuppliesMSP
 *   auditor      → AuditAuthorityMSP
 */
export type PdsRole = 'procurement' | 'godown' | 'fps' | 'department' | 'auditor';

export type PdsIdentity = {
  subject: string;
  mspId?: string;
  role?: PdsRole;
  claims: Record<string, unknown>;
};

/**
 * Stub identity-provider hook (T2.5). JWT issuance is out of MVP scope; this
 * interface is the enforcement seam. The default implementation
 * ({@link StubIdentityProvider}) accepts a configured static dev token and
 * rejects everything else. In production, replace this with a real JWT verifier
 * (Keycloak / enterprise IAM) — see DEPLOYMENT.md "Production Considerations".
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
  user?: PdsIdentity;
};
