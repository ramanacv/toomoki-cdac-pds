/**
 * Client for the simulated beneficiary self-service portal
 * (`/beneficiary-portal/v1`), which models the J&K / Maharashtra RCMS
 * public login journey (Aadhaar + OTP to the head-of-family mobile).
 *
 * The citizen session is separate from the Keycloak operational personas:
 * it is a short-lived opaque token stored in sessionStorage and sent via the
 * `x-citizen-session` header. Only synthetic demo Aadhaar numbers (9999…)
 * are ever accepted by the API.
 */

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';
const SESSION_STORAGE_KEY = 'pds-citizen-session';

export type CitizenOtpChallenge = {
  simulationOnly: true;
  challengeId: string;
  maskedMobile: string;
  otpExpiresInSeconds: number;
  demoOtpHint: string;
};

export type CitizenProfile = {
  simulationOnly: true;
  demoBeneficiaryId: string;
  fictionalName: string;
  maskedCardRef: string;
  maskedAadhaar: string;
  maskedMobile: string;
  fpsId: string;
  blockName: string;
  tehsilName: string;
  householdSize: number;
  eligibility: {
    status: string;
    monthlyRiceEntitlementKg: number;
    alreadyLiftedKg: number;
    availableBalanceKg: number;
  };
  familyMembers: Array<{
    fictionalName: string;
    relation: string;
    ageYears: number;
    maskedAadhaar?: string;
  }>;
  removal?: {
    reasonCode: string;
    source: string;
    removedAt: string;
  };
  statusNotification?: {
    title: string;
    reason: string;
    message: string;
    effectiveAt: string;
    caseId: string;
    appealMessage: string;
  };
};

export type CitizenDistribution = {
  distributionId: string;
  fpsId: string;
  commodity: string;
  deliveredKg: number;
  authMode: string;
  authResult: string;
  timestamp: string;
  ledgerTxId?: string;
  proofStatus?: string;
  fabricTxId?: string;
};

export type CitizenAuthEvent = {
  authTxnId: string;
  authMode: string;
  authResult: string;
  timestamp: string;
  fpsId?: string;
};

export const getCitizenSession = (): string | null => sessionStorage.getItem(SESSION_STORAGE_KEY);
export const setCitizenSession = (token: string): void => sessionStorage.setItem(SESSION_STORAGE_KEY, token);
export const clearCitizenSession = (): void => sessionStorage.removeItem(SESSION_STORAGE_KEY);

const citizenError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    return message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
};

const postJson = async <T>(path: string, payload: Record<string, unknown>): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await citizenError(response));
  return (await response.json()) as T;
};

const getWithSession = async <T>(path: string): Promise<T> => {
  const token = getCitizenSession();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: token ? { 'x-citizen-session': token } : {}
  });
  if (!response.ok) throw new Error(await citizenError(response));
  return (await response.json()) as T;
};

export const requestCitizenOtp = (demoAadhaarNumber: string): Promise<CitizenOtpChallenge> =>
  postJson('/beneficiary-portal/v1/login/request-otp', { demoAadhaarNumber });

export const verifyCitizenOtp = async (
  challengeId: string,
  otp: string
): Promise<{ sessionToken: string; profile: CitizenProfile }> => {
  const result = await postJson<{ sessionToken: string; profile: CitizenProfile }>(
    '/beneficiary-portal/v1/login/verify-otp',
    { challengeId, otp }
  );
  setCitizenSession(result.sessionToken);
  return result;
};

export const fetchCitizenProfile = (): Promise<CitizenProfile> =>
  getWithSession('/beneficiary-portal/v1/me');

export const fetchCitizenDistributions = async (): Promise<CitizenDistribution[]> => {
  const result = await getWithSession<{ distributions: CitizenDistribution[] }>(
    '/beneficiary-portal/v1/me/distributions'
  );
  return result.distributions;
};

export const fetchCitizenAuthHistory = async (): Promise<CitizenAuthEvent[]> => {
  const result = await getWithSession<{ authTransactions: CitizenAuthEvent[] }>(
    '/beneficiary-portal/v1/me/auth-history'
  );
  return result.authTransactions;
};

export const surrenderCitizenCard = async (): Promise<{
  simulationOnly: true;
  disposition: 'REMOVED' | 'ALREADY_REMOVED';
  profile: CitizenProfile;
}> => {
  const token = getCitizenSession();
  const response = await fetch(`${apiBaseUrl}/beneficiary-portal/v1/me/surrender`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-citizen-session': token } : {})
    },
    body: JSON.stringify({ confirmation: 'SURRENDER' })
  });
  if (!response.ok) throw new Error(await citizenError(response));
  return (await response.json()) as {
    simulationOnly: true;
    disposition: 'REMOVED' | 'ALREADY_REMOVED';
    profile: CitizenProfile;
  };
};

export const citizenLogout = async (): Promise<void> => {
  const token = getCitizenSession();
  clearCitizenSession();
  if (!token) return;
  try {
    await fetch(`${apiBaseUrl}/beneficiary-portal/v1/logout`, {
      method: 'POST',
      headers: { 'x-citizen-session': token }
    });
  } catch {
    // Session is already cleared locally; server sessions expire on TTL.
  }
};
