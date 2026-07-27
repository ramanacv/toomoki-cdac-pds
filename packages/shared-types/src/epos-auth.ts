/**
 * Privacy-safe simulated Aadhaar/ePoS authentication contract.
 *
 * This models UIDAI-style auth *outcomes* (OTP / biometric / supervisor exception)
 * for controlled demos. It is not a live UIDAI integration.
 *
 * Prohibited in requests/responses: raw Aadhaar numbers, OTP values, biometrics,
 * phone numbers, full ration-card values, and unmasked personal names/addresses.
 * Use opaque hashes only (`aadhaarRefHash`, `beneficiaryRefHash`, `rationCardHash`).
 */

export const EPOS_AUTH_SCHEMA_VERSION = '1.0';

export const EPOS_AUTH_MODES = ['MOCK_OTP', 'SIMULATED_BIOMETRIC', 'SUPERVISOR_EXCEPTION'] as const;
export type EposAuthMode = (typeof EPOS_AUTH_MODES)[number];

export const EPOS_AUTH_RESULTS = ['SUCCESS', 'FAILURE', 'EXCEPTION_APPROVED'] as const;
export type EposAuthResultCode = (typeof EPOS_AUTH_RESULTS)[number];

export const EPOS_AUTH_REASON_CODES = [
  'AADHAAR_AUTH_SUCCESS',
  'AADHAAR_AUTH_FAILED',
  'AADHAAR_SUSPENDED_REF',
  'AADHAAR_DEMOGRAPHIC_MISMATCH',
  'SUPERVISOR_EXCEPTION',
  'LOCAL_CLIENT_SIMULATION'
] as const;
export type EposAuthReasonCode = (typeof EPOS_AUTH_REASON_CODES)[number];

export type EposAuthRequest = {
  authTxnId: string;
  /** Opaque Aadhaar reference hash — never a raw 12-digit Aadhaar number. */
  aadhaarRefHash: string;
  beneficiaryRefHash: string;
  rationCardHash: string;
  fpsRef: string;
  authMode: EposAuthMode;
  approvedBy?: string;
  schemaVersion: typeof EPOS_AUTH_SCHEMA_VERSION;
};

export type EposAuthResponse = {
  authTxnId: string;
  authMode: EposAuthMode;
  authResult: EposAuthResultCode;
  aadhaarRefHash: string;
  beneficiaryRefHash: string;
  rationCardHash: string;
  fpsRef: string;
  reasonCode: EposAuthReasonCode | string;
  /** Synthetic masked display label only (e.g. XXXX-XXXX-0001). Never a real Aadhaar. */
  maskedAadhaarLabel?: string;
  simulationOnly: true;
  assessedAt: string;
  schemaVersion: typeof EPOS_AUTH_SCHEMA_VERSION;
};

const opaqueRef = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{5,127}$/;
const prohibitedRawKey =
  /^(aadhaar|uid|vid|biometric|otp|phone|mobile|address|name|rationcardnumber|ration_card_number)$/i;

const isProhibitedKey = (key: string): boolean => {
  if (/RefHash$/i.test(key) || /(^|_)hash$/i.test(key)) return false;
  return prohibitedRawKey.test(key) || /^(otp|biometric|finger|iris|face)$/i.test(key);
};

const assertOpaqueHash = (key: string, value: unknown): string => {
  if (typeof value !== 'string' || !opaqueRef.test(value)) {
    throw new Error(`${key} must be an opaque reference`);
  }
  if (/^\d{10,16}$/.test(value)) {
    throw new Error(`${key} must not contain a raw numeric personal identifier`);
  }
  if (!/hash/i.test(value) && !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${key} must be a hash-labelled or SHA-256 opaque reference`);
  }
  return value;
};

export const validateEposAuthRequest = (value: unknown): EposAuthRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ePoS auth request must be an object');
  }
  const request = value as Record<string, unknown>;
  const allowed = new Set([
    'authTxnId',
    'aadhaarRefHash',
    'beneficiaryRefHash',
    'rationCardHash',
    'fpsRef',
    'authMode',
    'approvedBy',
    'schemaVersion'
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key) || isProhibitedKey(key)) {
      throw new Error(`ePoS auth request contains prohibited field: ${key}`);
    }
  }
  if (typeof request.authTxnId !== 'string' || !opaqueRef.test(request.authTxnId)) {
    throw new Error('authTxnId must be an opaque reference');
  }
  if (typeof request.fpsRef !== 'string' || !opaqueRef.test(request.fpsRef)) {
    throw new Error('fpsRef must be an opaque reference');
  }
  const aadhaarRefHash = assertOpaqueHash('aadhaarRefHash', request.aadhaarRefHash);
  const beneficiaryRefHash = assertOpaqueHash('beneficiaryRefHash', request.beneficiaryRefHash);
  const rationCardHash = assertOpaqueHash('rationCardHash', request.rationCardHash);
  if (!EPOS_AUTH_MODES.includes(request.authMode as EposAuthMode)) {
    throw new Error('authMode is unsupported');
  }
  if (request.schemaVersion !== EPOS_AUTH_SCHEMA_VERSION) {
    throw new Error('Unsupported ePoS auth schemaVersion');
  }
  if (request.authMode === 'SUPERVISOR_EXCEPTION') {
    if (typeof request.approvedBy !== 'string' || request.approvedBy.length < 2) {
      throw new Error('approvedBy is required for supervisor exception authentication');
    }
  } else if (request.approvedBy !== undefined) {
    throw new Error('approvedBy is only permitted for supervisor exception authentication');
  }

  return {
    authTxnId: request.authTxnId,
    aadhaarRefHash,
    beneficiaryRefHash,
    rationCardHash,
    fpsRef: request.fpsRef,
    authMode: request.authMode as EposAuthMode,
    ...(typeof request.approvedBy === 'string' ? { approvedBy: request.approvedBy } : {}),
    schemaVersion: EPOS_AUTH_SCHEMA_VERSION
  };
};

export const validateEposAuthResponse = (value: unknown): EposAuthResponse => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('ePoS auth response must be an object');
  }
  const raw = value as Record<string, unknown>;
  const allowed = new Set([
    'authTxnId',
    'authMode',
    'authResult',
    'aadhaarRefHash',
    'beneficiaryRefHash',
    'rationCardHash',
    'fpsRef',
    'reasonCode',
    'maskedAadhaarLabel',
    'simulationOnly',
    'assessedAt',
    'schemaVersion'
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key) || isProhibitedKey(key))) {
    throw new Error('ePoS auth response contains an unknown or prohibited field');
  }
  if (raw.simulationOnly !== true) {
    throw new Error('ePoS auth response must be simulationOnly');
  }
  if (raw.schemaVersion !== EPOS_AUTH_SCHEMA_VERSION) {
    throw new Error('Unsupported ePoS auth response schemaVersion');
  }
  if (!EPOS_AUTH_MODES.includes(raw.authMode as EposAuthMode)) {
    throw new Error('authMode is unsupported');
  }
  if (!EPOS_AUTH_RESULTS.includes(raw.authResult as EposAuthResultCode)) {
    throw new Error('authResult is unsupported');
  }
  if (
    typeof raw.authTxnId !== 'string' ||
    typeof raw.fpsRef !== 'string' ||
    typeof raw.reasonCode !== 'string'
  ) {
    throw new Error('ePoS auth response fields are incomplete');
  }
  if (!Number.isFinite(Date.parse(String(raw.assessedAt ?? '')))) {
    throw new Error('assessedAt is invalid');
  }
  assertOpaqueHash('aadhaarRefHash', raw.aadhaarRefHash);
  assertOpaqueHash('beneficiaryRefHash', raw.beneficiaryRefHash);
  assertOpaqueHash('rationCardHash', raw.rationCardHash);
  if (raw.maskedAadhaarLabel !== undefined) {
    if (typeof raw.maskedAadhaarLabel !== 'string' || !/^XXXX-XXXX-\d{4}$/.test(raw.maskedAadhaarLabel)) {
      throw new Error('maskedAadhaarLabel must be a synthetic XXXX-XXXX-NNNN label');
    }
  }

  return raw as EposAuthResponse;
};
