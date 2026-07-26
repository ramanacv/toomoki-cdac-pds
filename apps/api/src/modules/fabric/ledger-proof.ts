import { createHash } from 'node:crypto';
import type { LedgerEvent, LedgerProof, ProofAnalyticsModule } from '@pds/shared-types';

const isProhibitedKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Approved opaque refs may contain sensitive stems when they end in hash/refHash/digest.
  const opaqueApproved = /(hash|refhash|digest)$/.test(normalized);
  if (normalized.includes('aadhaar')) return !opaqueApproved;
  if (['mobile', 'phone', 'otp', 'biometric', 'address', 'credential'].some((term) => normalized.includes(term))) {
    return !opaqueApproved;
  }
  if (normalized === 'name' || normalized.endsWith('beneficiaryname') || normalized.endsWith('dealername')) return true;
  return normalized.includes('rationcard') && !opaqueApproved;
};

const looksLikeRawNumericIdentifier = (value: string): boolean =>
  /^\d{10,16}$/.test(value.replace(/[\s-]/g, ''));

const ELIGIBILITY_EVENT_TYPES = new Set([
  'EligibilityNoticeIssued',
  'EligibilityVerificationRecorded',
  'EligibilityRecommendationRecorded',
  'EligibilityAppealOpened',
  'EligibilityDecisionAuthorized',
  'EligibilityDecisionReversed',
  'BENEFICIARY_CREATED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'HOUSEHOLD_BIFURCATED',
  'MIGRATION_RECORDED',
  'CARD_TRANSFERRED',
  'VERIFICATION_COMPLETED',
  'STATUS_CHANGED',
  'RECORD_DEACTIVATED'
]);

const SUPPLY_CHAIN_EVENT_TYPES = new Set([
  'RegisterStakeholder',
  'CreateCommodityLot',
  'AuthorizeMovement',
  'DispatchLot',
  'ReceiveLot',
  'AllocateToFPS',
  'RecordFPSReceipt',
  'CreateMonthlyEntitlement',
  'RaiseAuditFlag',
  'ResolveAuditFlag',
  'ResetTransactionalData',
  'MASTER_REFERENCE',
  'ALLOCATION',
  'MOVEMENT',
  'IntegrationReconciliation'
]);

/** Bucket durable proof events into the three demo modules for Trust analytics. */
export const proofAnalyticsModuleFor = (eventType: string, entityType: string): ProofAnalyticsModule => {
  if (ELIGIBILITY_EVENT_TYPES.has(eventType) || entityType === 'eligibility-case' || entityType === 'beneficiary-registry') {
    return 'eligibility';
  }
  if (eventType === 'AuthTransaction' || entityType === 'auth') return 'fps';
  if (eventType === 'RecordDistribution' || eventType === 'DISTRIBUTION') return 'fps';
  if (entityType === 'distribution' && eventType !== 'CreateMonthlyEntitlement') return 'fps';
  if (SUPPLY_CHAIN_EVENT_TYPES.has(eventType)) return 'supply-chain';
  if (entityType === 'lot' || entityType === 'transfer' || entityType === 'allocation' || entityType === 'stakeholder') {
    return 'supply-chain';
  }
  return 'other';
};

/** Strip prohibited keys/values for dashboard display without throwing. */
export const privacySafeCopy = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return looksLikeRawNumericIdentifier(value) ? '[REDACTED]' : value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => privacySafeCopy(item));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isProhibitedKey(key)) continue;
    out[key] = privacySafeCopy(item);
  }
  return out;
};

export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
};

export const payloadHashFor = (payload: Record<string, unknown>): string =>
  createHash('sha256').update(canonicalJson(payload)).digest('hex');

export const assertPrivacySafe = (value: unknown, path = 'payload'): void => {
  if (typeof value === 'string' && looksLikeRawNumericIdentifier(value)) {
    throw new Error(`${path} looks like a raw numeric personal identifier`);
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPrivacySafe(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isProhibitedKey(key)) throw new Error(`${path}.${key} contains prohibited personal data`);
    assertPrivacySafe(item, `${path}.${key}`);
  }
};

export type ProofActor = LedgerProof['actor'];

/**
 * Stakeholder operational records may carry display names in PostgreSQL, but
 * Fabric proofs must not. Redact prohibited keys at the proof boundary only —
 * other event types still fail loudly if they embed personal data.
 */
const proofPayloadFor = (event: LedgerEvent): Record<string, unknown> => {
  if (event.eventType === 'RegisterStakeholder' || event.entityType === 'stakeholder') {
    return privacySafeCopy(event.payload) as Record<string, unknown>;
  }
  return event.payload;
};

export const ledgerProofFromEvent = (
  event: LedgerEvent,
  actor: ProofActor,
  operationId = event.ledgerTxId
): LedgerProof => {
  const proofPayload = proofPayloadFor(event);
  assertPrivacySafe(proofPayload, 'proofPayload');
  const payloadHash = payloadHashFor(proofPayload);
  return {
    eventId: event.ledgerTxId,
    operationId,
    eventType: event.eventType,
    schemaVersion: 1,
    entityType: event.entityType,
    entityId: event.entityId,
    actor,
    payloadHash,
    proofPayload,
    businessTimestamp: event.timestamp
  };
};
