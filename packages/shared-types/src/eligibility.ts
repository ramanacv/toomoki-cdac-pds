export const ELIGIBILITY_SCHEMA_VERSION = '1.0' as const;
export const ELIGIBILITY_POLICY_ID = 'MH-PANEL-DEMO-2026-V1' as const;
export const JK_ELIGIBILITY_POLICY_ID = 'JK-PANEL-DEMO-2026-V1' as const;
export const ELIGIBILITY_POLICY_IDS = [ELIGIBILITY_POLICY_ID, JK_ELIGIBILITY_POLICY_ID] as const;
export type EligibilityPolicyId = (typeof ELIGIBILITY_POLICY_IDS)[number];

export const ELIGIBILITY_CHECKS = ['DEATH', 'ACTIVITY', 'ECONOMIC', 'LAND', 'DUPLICATE'] as const;
export type EligibilityCheck = (typeof ELIGIBILITY_CHECKS)[number];

export const ELIGIBILITY_SCREENING_STATUSES = [
  'CLEAR',
  'DEATH_MATCH_REVIEW',
  'INACTIVITY_REVIEW',
  'PORTABILITY_ACTIVITY_FOUND',
  'ECONOMIC_ELIGIBILITY_REVIEW',
  'LANDHOLDING_REVIEW',
  'MULTI_SOURCE_CONFLICT',
  'DUPLICATE_RECORD_REVIEW'
] as const;
export type EligibilityScreeningStatus = (typeof ELIGIBILITY_SCREENING_STATUSES)[number];

export type EligibilitySignal = {
  source:
    | 'DEATH_REGISTRY'
    | 'AEPDS_ONORC'
    | 'GST_TURNOVER'
    | 'INCOME_TAX'
    | 'EMPLOYMENT'
    | 'LAND_RECORDS'
    | 'RCMS'
    | 'REGISTRY_LINKAGE';
  status: 'CLEAR' | 'MATCH' | 'CONFLICT' | 'STALE' | 'UNAVAILABLE';
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  observedAt: string;
  factCode: string;
  /** Opaque multi-registry linkage digest for deterministic duplicate fixtures (hash-only). */
  linkageDigest?: string;
};

export type EligibilityScoreBreakdownEntry = {
  ruleId: string;
  signalFactCode: string;
  weight: number;
  contribution: number;
  rationaleCode: string;
};

export type EligibilityScreeningRequest = {
  screeningRequestId: string;
  demoBeneficiaryId: string;
  subjectRefHash: string;
  rationCardHash: string;
  checks: EligibilityCheck[];
  schemaVersion: typeof ELIGIBILITY_SCHEMA_VERSION;
};

export type EligibilityScreeningResponse = {
  screeningId: string;
  screeningRequestId: string;
  status: EligibilityScreeningStatus;
  signals: EligibilitySignal[];
  recommendedReviewAction: string;
  policy: {
    policyId: EligibilityPolicyId;
    simulationOnly: true;
    ruleIds: string[];
  };
  assessedAt: string;
  expiresAt: string;
  evidenceDigest: string;
  responseAttestationHash: string;
  schemaVersion: typeof ELIGIBILITY_SCHEMA_VERSION;
  /** Deterministic mock integrity score 0–100 (not ML). */
  integrityScore?: number;
  scoreBreakdown?: EligibilityScoreBreakdownEntry[];
};

export const ELIGIBILITY_CASE_STATES = [
  'OPEN',
  'AWAITING_DATA',
  'AWAITING_FIELD_VERIFICATION',
  'NOTICE_ISSUED',
  'REVIEW_READY',
  'RECOMMENDED_ELIGIBLE',
  'RECOMMENDED_INELIGIBLE',
  'DECIDED',
  'APPEALED',
  'REINSTATED',
  'CLOSED',
  'QUARANTINED'
] as const;
export type EligibilityCaseState = (typeof ELIGIBILITY_CASE_STATES)[number];

export const ELIGIBILITY_DECISIONS = [
  'NO_CHANGE',
  'MEMBER_REMOVED',
  'HOUSEHOLD_SIZE_RECALCULATED',
  'TRANSFER_REQUIRED',
  'TEMPORARILY_SUSPENDED',
  'CARD_CANCELLED',
  'REINSTATED'
] as const;
export type EligibilityDecision = (typeof ELIGIBILITY_DECISIONS)[number];

export type EligibilityProofStatus = 'NOT_REQUIRED' | 'PENDING' | 'COMMITTED' | 'FAILED' | 'DEAD_LETTER';

export type EligibilityCaseAction = {
  actionId: string;
  action: 'SCREENING' | 'NOTICE' | 'VERIFICATION' | 'RECOMMENDATION' | 'DECISION' | 'APPEAL' | 'REINSTATEMENT';
  outcomeCode: string;
  reasonCode: string;
  actorRef: string;
  occurredAt: string;
  priorState: EligibilityCaseState;
  newState: EligibilityCaseState;
};

export type EligibilityCase = {
  caseId: string;
  demoBeneficiaryId: string;
  subjectRefHash: string;
  rationCardHash: string;
  screening: EligibilityScreeningResponse;
  state: EligibilityCaseState;
  version: number;
  decision?: EligibilityDecision;
  rcmsStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  entitlementBlocked: boolean;
  householdSize: number;
  monthlyRiceEntitlementKg: number;
  alreadyLiftedKg: number;
  proofStatus: EligibilityProofStatus;
  proofEventId?: string;
  history: EligibilityCaseAction[];
  updatedAt: string;
};

export type EligibilityFamilyMember = {
  fictionalName: string;
  relation: string;
  ageYears: number;
  /** Synthetic demo Aadhaar for UI only (9999-prefixed). Never send to Fabric proofs. */
  demoAadhaarNumber?: string;
  /** Synthetic OTP handset for household head in UI demos (90000…). */
  demoMobileNumber?: string;
  aadhaarRefHash?: string;
};

export type EligibilityBeneficiary = {
  demoBeneficiaryId: string;
  fictionalName: string;
  /** Synthetic demo residential address for UI only. Never send to Fabric proofs. */
  fictionalAddress: string;
  maskedCardRef: string;
  /**
   * Synthetic 12-digit demo Aadhaar for controlled UI demos (must start with 9999).
   * Never persist into Fabric proofs — use aadhaarRefHash / subjectRefHash instead.
   */
  demoAadhaarNumber: string;
  /**
   * Synthetic Indian mobile used only to narrate where mock OTP is received.
   * Must start with 90000 for controlled demos. Never send to Fabric proofs or
   * epos-auth-mock request bodies.
   */
  demoMobileNumber: string;
  aadhaarRefHash: string;
  subjectRefHash: string;
  rationCardHash: string;
  householdSize: number;
  monthlyRiceEntitlementKg: number;
  alreadyLiftedKg: number;
  fpsId: string;
  blockName: string;
  tehsilName: string;
  familyMembers: EligibilityFamilyMember[];
  jurisdictionCode?: string;
  districtCode?: string;
  eligibilityStatus: 'ELIGIBLE' | 'UNDER_REVIEW' | 'SUSPENDED' | 'CANCELLED';
  caseId?: string;
};

export type EligibilitySummary = {
  simulationOnly: true;
  policyId: typeof ELIGIBILITY_POLICY_ID;
  service: {
    status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
    lastSuccessfulCallAt?: string;
    latencyMs?: number;
    warning?: string;
  };
  statusCounts: Partial<Record<EligibilityScreeningStatus, number>>;
  openCases: number;
  decisions: number;
  appeals: number;
  reversals: number;
  quarantined: number;
  planningImpact: {
    simulationOnly: true;
    baselineHouseholdMembers: number;
    currentEligibleHouseholdMembers: number;
    baselineMonthlyRiceKg: number;
    currentMonthlyRiceKg: number;
    allocationDeltaKg: number;
    indicativeSubsidyRateInrPerKg: number;
    indicativeMonthlySubsidyDeltaInr: number;
  };
  beneficiaries: EligibilityBeneficiary[];
};

const opaqueRef = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{5,127}$/;
const prohibitedKey = /(aadhaar|pan|gstin|phone|mobile|address|name|parcel|employer|taxreturn|rationcardnumber)/i;

export const validateEligibilityScreeningRequest = (value: unknown): EligibilityScreeningRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Screening request must be an object');
  const request = value as Record<string, unknown>;
  const allowed = new Set(['screeningRequestId', 'demoBeneficiaryId', 'subjectRefHash', 'rationCardHash', 'checks', 'schemaVersion']);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key) || prohibitedKey.test(key)) throw new Error(`Screening request contains prohibited field: ${key}`);
  }
  for (const key of ['screeningRequestId', 'demoBeneficiaryId', 'subjectRefHash', 'rationCardHash'] as const) {
    if (typeof request[key] !== 'string' || !opaqueRef.test(request[key])) throw new Error(`${key} must be an opaque reference`);
    if (/^\d{10,16}$/.test(request[key])) throw new Error(`${key} must not contain a raw numeric personal identifier`);
  }
  for (const key of ['subjectRefHash', 'rationCardHash'] as const) {
    const reference = request[key] as string;
    if (!/hash/i.test(reference) && !/^[a-f0-9]{64}$/.test(reference)) {
      throw new Error(`${key} must be a hash-labelled or SHA-256 opaque reference`);
    }
  }
  if (request.schemaVersion !== ELIGIBILITY_SCHEMA_VERSION) throw new Error('Unsupported screening schemaVersion');
  if (!Array.isArray(request.checks) || request.checks.length === 0 ||
      request.checks.some((check) => !ELIGIBILITY_CHECKS.includes(check as EligibilityCheck))) {
    throw new Error('checks contains an unsupported eligibility check');
  }
  return request as EligibilityScreeningRequest;
};

export const validateEligibilityScreeningResponse = (value: unknown, now = new Date()): EligibilityScreeningResponse => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Screening response must be an object');
  const raw = value as Record<string, unknown>;
  const allowedResponseKeys = new Set([
    'screeningId', 'screeningRequestId', 'status', 'signals', 'recommendedReviewAction',
    'policy', 'assessedAt', 'expiresAt', 'evidenceDigest', 'responseAttestationHash', 'schemaVersion',
    'integrityScore', 'scoreBreakdown'
  ]);
  if (Object.keys(raw).some((key) => !allowedResponseKeys.has(key) || prohibitedKey.test(key))) {
    throw new Error('Screening response contains an unknown or prohibited field');
  }
  const response = value as Partial<EligibilityScreeningResponse>;
  if (!response.screeningId || !response.screeningRequestId) throw new Error('Screening response identifiers are required');
  if (!ELIGIBILITY_SCREENING_STATUSES.includes(response.status as EligibilityScreeningStatus)) throw new Error('Unknown screening status');
  if (response.schemaVersion !== ELIGIBILITY_SCHEMA_VERSION) throw new Error('Unsupported screening response schemaVersion');
  if (!ELIGIBILITY_POLICY_IDS.includes(response.policy?.policyId as EligibilityPolicyId) ||
      response.policy?.simulationOnly !== true) throw new Error('Unexpected eligibility policy');
  if (!Array.isArray(response.signals) || response.signals.length === 0) throw new Error('Screening signals are required');
  const signalSources = ['DEATH_REGISTRY', 'AEPDS_ONORC', 'GST_TURNOVER', 'INCOME_TAX', 'EMPLOYMENT', 'LAND_RECORDS', 'RCMS', 'REGISTRY_LINKAGE'];
  const signalStatuses = ['CLEAR', 'MATCH', 'CONFLICT', 'STALE', 'UNAVAILABLE'];
  const signalRisks = ['LOW', 'MEDIUM', 'HIGH'];
  const allowedSignalKeys = new Set(['source', 'status', 'risk', 'observedAt', 'factCode', 'linkageDigest']);
  if (response.signals.some((signal) =>
    Object.keys(signal).some((key) => !allowedSignalKeys.has(key) || prohibitedKey.test(key)) ||
    !signalSources.includes(signal.source) || !signalStatuses.includes(signal.status) ||
    !signalRisks.includes(signal.risk) || !signal.factCode || !Number.isFinite(Date.parse(signal.observedAt))
  )) throw new Error('Screening response contains a malformed source signal');
  if (response.signals.some((signal) => signal.status === 'UNAVAILABLE')) {
    throw new Error('Screening response contains an unavailable source and must be quarantined');
  }
  if (!response.policy || Object.keys(response.policy).some((key) =>
    !['policyId', 'simulationOnly', 'ruleIds'].includes(key) || prohibitedKey.test(key)
  )) throw new Error('Screening response policy contains an unknown or prohibited field');
  if (!/^[a-f0-9]{64}$/.test(response.evidenceDigest ?? '') ||
      !/^[a-f0-9]{64}$/.test(response.responseAttestationHash ?? '')) throw new Error('Screening hashes must be SHA-256 hex digests');
  const assessedAt = Date.parse(response.assessedAt ?? '');
  const expiresAt = Date.parse(response.expiresAt ?? '');
  if (!Number.isFinite(assessedAt) || !Number.isFinite(expiresAt)) throw new Error('Screening timestamps are invalid');
  if (expiresAt <= now.getTime()) throw new Error('Screening response is expired');
  if (response.integrityScore !== undefined) {
    if (typeof response.integrityScore !== 'number' || !Number.isInteger(response.integrityScore) ||
        response.integrityScore < 0 || response.integrityScore > 100) {
      throw new Error('integrityScore must be an integer from 0 to 100');
    }
  }
  if (response.scoreBreakdown !== undefined) {
    if (!Array.isArray(response.scoreBreakdown)) throw new Error('scoreBreakdown must be an array');
    for (const entry of response.scoreBreakdown) {
      if (!entry || typeof entry !== 'object') throw new Error('scoreBreakdown entry is malformed');
      const row = entry as Record<string, unknown>;
      for (const key of Object.keys(row)) {
        if (!['ruleId', 'signalFactCode', 'weight', 'contribution', 'rationaleCode'].includes(key) || prohibitedKey.test(key)) {
          throw new Error('scoreBreakdown contains an unknown or prohibited field');
        }
      }
      if (typeof row.ruleId !== 'string' || typeof row.signalFactCode !== 'string' ||
          typeof row.rationaleCode !== 'string' || typeof row.weight !== 'number' ||
          typeof row.contribution !== 'number') {
        throw new Error('scoreBreakdown entry fields are invalid');
      }
    }
  }
  if (response.signals.some((signal) => signal.linkageDigest !== undefined &&
      (typeof signal.linkageDigest !== 'string' || !/^[a-f0-9]{64}$/.test(signal.linkageDigest)))) {
    throw new Error('linkageDigest must be a SHA-256 hex digest when present');
  }
  return response as EligibilityScreeningResponse;
};
