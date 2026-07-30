import { describe, expect, it } from 'vitest';
import {
  INELIGIBLE_BENEFICIARY_CODE,
  INELIGIBLE_BENEFICIARY_NOTICE,
  validateEligibilityScreeningRequest,
  validateEligibilityScreeningResponse
} from '../src/eligibility.js';

describe('eligibility contracts', () => {
  it('exports the FPS ineligible-beneficiary notice constants used by the API gate', () => {
    expect(INELIGIBLE_BENEFICIARY_CODE).toBe('INELIGIBLE_BENEFICIARY');
    expect(INELIGIBLE_BENEFICIARY_NOTICE).toBe('Ineligible Beneficiary');
  });
  it('rejects unknown, malformed, and expired responses', () => {
    const base = {
      screeningId: 'SCREENING-001', screeningRequestId: 'REQUEST-001', status: 'CLEAR',
      signals: [{ source: 'RCMS', status: 'CLEAR', risk: 'LOW', observedAt: '2026-01-01T00:00:00Z', factCode: 'CLEAR' }],
      recommendedReviewAction: 'NONE',
      policy: { policyId: 'MH-PANEL-DEMO-2026-V1', simulationOnly: true, ruleIds: ['CLEAR-01'] },
      assessedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
      evidenceDigest: 'a'.repeat(64), responseAttestationHash: 'b'.repeat(64), schemaVersion: '1.0'
    };
    expect(validateEligibilityScreeningResponse(base).status).toBe('CLEAR');
    expect(() => validateEligibilityScreeningResponse({ ...base, status: 'AUTO_DELETE' })).toThrow(/Unknown/);
    expect(() => validateEligibilityScreeningResponse({ ...base, evidenceDigest: 'raw-evidence' })).toThrow(/SHA-256/);
    expect(() => validateEligibilityScreeningResponse({ ...base, expiresAt: '2020-01-01T00:00:00Z' })).toThrow(/expired/);
    expect(() => validateEligibilityScreeningResponse({
      ...base,
      signals: [{ ...base.signals[0], status: 'UNAVAILABLE' }]
    })).toThrow(/unavailable source/);
    expect(() => validateEligibilityScreeningResponse({ ...base, beneficiaryName: 'Sensitive Person' }))
      .toThrow(/prohibited field/);
    expect(() => validateEligibilityScreeningResponse({
      ...base,
      signals: [{ ...base.signals[0], landParcelIdentifier: 'raw-parcel' }]
    })).toThrow(/malformed source signal/);
  });

  it('accepts only the privacy-safe allowlist', () => {
    const request = {
      screeningRequestId: 'SCREEN-DEMO-001', demoBeneficiaryId: 'BEN-DEMO-001',
      subjectRefHash: 'beneficiary-demo-001-hash', rationCardHash: 'ration-card-demo-001-hash',
      checks: ['DEATH'], schemaVersion: '1.0'
    };
    expect(validateEligibilityScreeningRequest(request)).toEqual(request);
    expect(() => validateEligibilityScreeningRequest({ ...request, aadhaar: 'not-allowed' })).toThrow(/prohibited/);
    expect(() => validateEligibilityScreeningRequest({ ...request, subjectRefHash: '123456789012' })).toThrow(/raw numeric/);
    expect(() => validateEligibilityScreeningRequest({ ...request, rationCardHash: 'RCFULLVALUE001' })).toThrow(/hash-labelled/);
  });

  it('accepts the simulation-only J&K duplicate contract without identity fields', () => {
    const response = validateEligibilityScreeningResponse({
      screeningId: 'SCREEN-JK-001', screeningRequestId: 'REQUEST-JK-001',
      status: 'DUPLICATE_RECORD_REVIEW',
      signals: [{
        source: 'REGISTRY_LINKAGE', status: 'MATCH', risk: 'HIGH',
        observedAt: '2026-07-23T00:00:00.000Z', factCode: 'TWO_ACTIVE_REGISTRY_REFERENCES',
        linkageDigest: 'c'.repeat(64)
      }],
      recommendedReviewAction: 'VERIFY_CROSS_REGISTRY_LINKAGE',
      policy: { policyId: 'JK-PANEL-DEMO-2026-V1', simulationOnly: true, ruleIds: ['JK-DUPLICATE-LINK-01'] },
      assessedAt: '2026-07-23T00:00:00.000Z', expiresAt: '2099-12-31T00:00:00.000Z',
      evidenceDigest: 'a'.repeat(64), responseAttestationHash: 'b'.repeat(64), schemaVersion: '1.0',
      integrityScore: 55,
      scoreBreakdown: [{
        ruleId: 'SCORE-LINKAGE-COLLISION', signalFactCode: 'TWO_ACTIVE_REGISTRY_REFERENCES',
        weight: 35, contribution: 35, rationaleCode: 'LINKAGE_DIGEST_COLLISION'
      }]
    }, new Date('2026-07-23T01:00:00.000Z'));
    expect(response.status).toBe('DUPLICATE_RECORD_REVIEW');
    expect(response.integrityScore).toBe(55);
    expect(response.signals[0]?.linkageDigest).toBe('c'.repeat(64));
  });
});
