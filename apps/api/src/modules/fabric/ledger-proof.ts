import { createHash } from 'node:crypto';
import type { LedgerEvent, LedgerProof } from '@pds/shared-types';

const isProhibitedKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['aadhaar', 'mobile', 'phone', 'otp', 'biometric'].some((term) => normalized.includes(term))) return true;
  return normalized.includes('rationcard') && !/(hash|refhash|digest)$/.test(normalized);
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

const assertProofSafe = (value: unknown, path = 'proofPayload'): void => {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertProofSafe(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isProhibitedKey(key)) throw new Error(`${path}.${key} contains prohibited personal data`);
    assertProofSafe(item, `${path}.${key}`);
  }
};

export type ProofActor = LedgerProof['actor'];

export const ledgerProofFromEvent = (
  event: LedgerEvent,
  actor: ProofActor,
  operationId = event.ledgerTxId
): LedgerProof => {
  assertProofSafe(event.payload);
  const payloadHash = createHash('sha256').update(canonicalJson(event.payload)).digest('hex');
  return {
    eventId: event.ledgerTxId,
    operationId,
    eventType: event.eventType,
    schemaVersion: 1,
    entityType: event.entityType,
    entityId: event.entityId,
    actor,
    payloadHash,
    proofPayload: event.payload,
    businessTimestamp: event.timestamp
  };
};
