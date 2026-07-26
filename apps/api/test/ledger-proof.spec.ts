import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  ledgerProofFromEvent,
  privacySafeCopy,
  proofAnalyticsModuleFor
} from '../src/modules/fabric/ledger-proof.js';

const actor = { subject: 'demo-user', applicationRole: 'DEPARTMENT', submittingOrganization: 'FoodAndCivilSuppliesMSP' };

describe('LedgerProof', () => {
  it('hashes semantically identical payloads identically', () => {
    expect(canonicalJson({ b: 2, a: { y: 2, x: 1 } })).toBe(canonicalJson({ a: { x: 1, y: 2 }, b: 2 }));
  });

  it('creates a traceable versioned proof', () => {
    const proof = ledgerProofFromEvent({ ledgerTxId: 'evt-1', entityType: 'lot', entityId: 'lot-1', eventType: 'DispatchLot', payload: { quantityKg: 2 }, timestamp: '2026-01-01T00:00:00.000Z' }, actor, 'op-1');
    expect(proof).toMatchObject({ eventId: 'evt-1', operationId: 'op-1', schemaVersion: 1, actor });
    expect(proof.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects sensitive fields at any depth', () => {
    expect(() => ledgerProofFromEvent({ ledgerTxId: 'evt-1', entityType: 'auth', entityId: 'auth-1', eventType: 'AuthTransaction', payload: { evidence: { otp: '1234' } }, timestamp: '2026-01-01T00:00:00.000Z' }, actor)).toThrow(/prohibited personal data/);
  });

  it('redacts RegisterStakeholder display names at the proof boundary', () => {
    const proof = ledgerProofFromEvent(
      {
        ledgerTxId: 'evt-stakeholder',
        entityType: 'stakeholder',
        entityId: 'FCI-001',
        eventType: 'RegisterStakeholder',
        payload: {
          stakeholderId: 'FCI-001',
          stakeholderType: 'FCI',
          name: 'FCI Depot Pune',
          dealerName: 'Should Not Appear',
          district: 'Pune',
          licenseNo: 'LIC-1',
          status: 'ACTIVE'
        },
        timestamp: '2026-01-01T00:00:00.000Z'
      },
      actor
    );
    expect(proof.proofPayload).toMatchObject({
      stakeholderId: 'FCI-001',
      stakeholderType: 'FCI',
      district: 'Pune',
      licenseNo: 'LIC-1',
      status: 'ACTIVE'
    });
    expect(proof.proofPayload).not.toHaveProperty('name');
    expect(proof.proofPayload).not.toHaveProperty('dealerName');
  });

  it.each(['aadhaarNumber', 'customer_aadhaar', 'phoneNumber', 'mobileNo', 'otpValue', 'biometricPayload', 'ration_card_value']) (
    'rejects normalized sensitive alias %s',
    (key) => {
      expect(() => ledgerProofFromEvent({
        ledgerTxId: 'evt-alias', entityType: 'auth', entityId: 'auth-1', eventType: 'AuthTransaction',
        payload: { nested: { [key]: 'prohibited' } }, timestamp: '2026-01-01T00:00:00.000Z'
      }, actor)).toThrow(/prohibited personal data/);
    }
  );

  it('allows approved opaque ration-card and aadhaar reference hashes', () => {
    expect(() => ledgerProofFromEvent({
      ledgerTxId: 'evt-hash', entityType: 'distribution', entityId: 'distribution-1', eventType: 'Distribution',
      payload: { rationCardHash: 'opaque-hash', aadhaarRefHash: 'aadhaar-demo-001-hash', beneficiaryRefHash: 'beneficiary-hash' },
      timestamp: '2026-01-01T00:00:00.000Z'
    }, actor)).not.toThrow();
  });

  it('rejects raw numeric personal identifiers even under an unrecognized nested key', () => {
    expect(() => ledgerProofFromEvent({
      ledgerTxId: 'evt-raw', entityType: 'auth', entityId: 'auth-1', eventType: 'AuthTransaction',
      payload: { externalValue: '123456789012' }, timestamp: '2026-01-01T00:00:00.000Z'
    }, actor)).toThrow(/raw numeric personal identifier/);
  });

  it('buckets event types into demo modules', () => {
    expect(proofAnalyticsModuleFor('DispatchLot', 'transfer')).toBe('supply-chain');
    expect(proofAnalyticsModuleFor('EligibilityDecisionAuthorized', 'eligibility-case')).toBe('eligibility');
    expect(proofAnalyticsModuleFor('EligibilityNoticeIssued', 'eligibility-case')).toBe('eligibility');
    expect(proofAnalyticsModuleFor('EligibilityVerificationRecorded', 'eligibility-case')).toBe('eligibility');
    expect(proofAnalyticsModuleFor('EligibilityRecommendationRecorded', 'eligibility-case')).toBe('eligibility');
    expect(proofAnalyticsModuleFor('EligibilityAppealOpened', 'eligibility-case')).toBe('eligibility');
    expect(proofAnalyticsModuleFor('AuthTransaction', 'auth')).toBe('fps');
    expect(proofAnalyticsModuleFor('RecordDistribution', 'distribution')).toBe('fps');
  });

  it('redacts prohibited fields for analytics detail without throwing', () => {
    expect(privacySafeCopy({
      rationCardHash: 'demo-ration-card-hash',
      otp: '123456',
      evidence: { phone: '9999999999', ok: true },
      externalValue: '123456789012'
    })).toEqual({
      rationCardHash: 'demo-ration-card-hash',
      evidence: { ok: true },
      externalValue: '[REDACTED]'
    });
  });
});
