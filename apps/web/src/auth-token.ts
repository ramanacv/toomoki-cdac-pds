import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

export const WEB_ROLES = [
  'management', 'department', 'procurement', 'fci', 'godown', 'fps', 'auditor',
  'platform-admin', 'metrics-reader', 'demo-reset'
] as const;
export type WebRole = (typeof WEB_ROLES)[number];

export const OPERATIONAL_WEB_ROLES: readonly WebRole[] = [
  'management', 'department', 'procurement', 'fci', 'godown', 'fps', 'auditor'
];

export const hasOperationalRole = (roles: readonly WebRole[]): boolean =>
  roles.some((role) => OPERATIONAL_WEB_ROLES.includes(role));

export type WebIdentity = {
  subject: string;
  displayName: string;
  roles: WebRole[];
  organizationId?: string;
  stakeholderId?: string;
  mspId?: string;
};

let manager: UserManager | null = null;
let currentUser: User | null = null;

const getManager = (): UserManager => {
  if (manager) return manager;
  if (typeof window === 'undefined') throw new Error('OIDC login requires a browser');
  const authority = (import.meta.env.VITE_OIDC_AUTHORITY ?? 'http://localhost:8080/realms/viksitpds').replace(/\/$/, '');
  manager = new UserManager({
    authority,
    client_id: import.meta.env.VITE_OIDC_CLIENT_ID ?? 'pds-web',
    redirect_uri: `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    scope: 'openid profile',
    automaticSilentRenew: true,
    monitorSession: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage })
  });
  manager.events.addUserLoaded((user) => { currentUser = user; });
  manager.events.addUserUnloaded(() => { currentUser = null; });
  manager.events.addAccessTokenExpired(() => {
    currentUser = null;
    void manager?.signinRedirect({ state: { returnUrl: window.location.pathname } });
  });
  return manager;
};

export const initializeAuth = async (): Promise<void> => {
  if (typeof window === 'undefined' || import.meta.env.VITE_DATA_SOURCE === 'mock') return;
  const oidc = getManager();
  if (window.location.pathname === '/auth/callback') {
    const user = await oidc.signinRedirectCallback();
    currentUser = user;
    const state = user.state as { returnUrl?: string } | undefined;
    window.history.replaceState({}, document.title, state?.returnUrl || '/');
    return;
  }
  const user = await oidc.getUser();
  currentUser = user && !user.expired ? user : null;
};

export const signIn = async (returnUrl = '/'): Promise<void> => {
  await getManager().signinRedirect({ state: { returnUrl } });
};

export const signInAs = async (username: string, returnUrl = '/'): Promise<void> => {
  await getManager().signinRedirect({
    state: { returnUrl },
    prompt: 'login',
    login_hint: username
  });
};

export const signOut = async (): Promise<void> => {
  currentUser = null;
  await getManager().signoutRedirect();
};

const decodeClaims = (accessToken: string): Record<string, unknown> => {
  try {
    return JSON.parse(atob(accessToken.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const getCurrentIdentity = (): WebIdentity | null => {
  if (!currentUser?.access_token || currentUser.expired) return null;
  const claims = decodeClaims(currentUser.access_token);
  const realmAccess = claims.realm_access as { roles?: unknown } | undefined;
  const resourceAccess = claims.resource_access as Record<string, { roles?: unknown }> | undefined;
  const claimed = [
    ...(Array.isArray(realmAccess?.roles) ? realmAccess.roles : []),
    ...(Array.isArray(resourceAccess?.['pds-api']?.roles) ? resourceAccess['pds-api'].roles : [])
  ];
  const roles = WEB_ROLES.filter((role) => claimed.includes(role));
  const identity: WebIdentity = {
    subject: currentUser.profile.sub,
    displayName: currentUser.profile.name || currentUser.profile.preferred_username || currentUser.profile.sub,
    roles
  };
  if (typeof claims.pds_org_id === 'string') identity.organizationId = claims.pds_org_id;
  if (typeof claims.pds_stakeholder_id === 'string') identity.stakeholderId = claims.pds_stakeholder_id;
  if (typeof claims.pds_msp_id === 'string') identity.mspId = claims.pds_msp_id;
  return identity;
};

export const hasAccessToken = (): boolean => Boolean(currentUser?.access_token && !currentUser.expired);

export const authHeaders = (): HeadersInit =>
  currentUser?.access_token && !currentUser.expired
    ? { Authorization: `Bearer ${currentUser.access_token}` }
    : {};
