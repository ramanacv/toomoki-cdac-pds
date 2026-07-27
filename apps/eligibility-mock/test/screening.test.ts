import { describe, expect, it } from 'vitest';
import { ELIGIBILITY_SCREENING_STATUSES, validateEligibilityScreeningResponse } from '@pds/shared-types';
import { EligibilityScreeningEngine, ScreeningConflictError } from '../src/screening.js';

const request = (demoBeneficiaryId: string, screeningRequestId = `REQ-${demoBeneficiaryId}`) => ({
  screeningRequestId,
  demoBeneficiaryId,
  subjectRefHash: `subject-${demoBeneficiaryId.toLowerCase()}-hash`,
  rationCardHash: `card-${demoBeneficiaryId.toLowerCase()}-hash`,
  checks: ['DEATH', 'ACTIVITY', 'ECONOMIC', 'LAND'],
  schemaVersion: '1.0'
});

describe('external eligibility screening engine', () => {
  it('returns every deterministic panel status and a valid response contract', () => {
    const engine = new EligibilityScreeningEngine();
    const statuses = ['BEN-DEMO-001', 'BEN-DEMO-INACTIVE', 'BEN-DEMO-002', 'BEN-DEMO-003', 'BEN-DEMO-004', 'BEN-DEMO-005', 'BEN-DEMO-999']
      .map((id) => validateEligibilityScreeningResponse(engine.screen(request(id))).status);
    expect(statuses).toEqual([
      'DEATH_MATCH_REVIEW', 'INACTIVITY_REVIEW', 'PORTABILITY_ACTIVITY_FOUND', 'ECONOMIC_ELIGIBILITY_REVIEW',
      'LANDHOLDING_REVIEW', 'MULTI_SOURCE_CONFLICT', 'CLEAR'
    ]);
    expect(statuses.every((status) => ELIGIBILITY_SCREENING_STATUSES.includes(status))).toBe(true);
    const serialized = JSON.stringify(engine.screen(request('BEN-DEMO-003', 'PRIVACY-RESPONSE-003')));
    expect(serialized).not.toMatch(/Meera|"PAN"|GSTIN|phone|address|parcel|employer/i);
  });

  it('detects a fictional J&K duplicate using opaque registry linkage only', () => {
    const response = new EligibilityScreeningEngine().screen({
      ...request('BEN-JK-DEMO-001'),
      checks: ['DUPLICATE']
    });
    expect(response).toMatchObject({
      status: 'DUPLICATE_RECORD_REVIEW',
      policy: { policyId: 'JK-PANEL-DEMO-2026-V1', simulationOnly: true }
    });
    expect(response.signals[0]).toMatchObject({ source: 'REGISTRY_LINKAGE', status: 'MATCH', risk: 'HIGH' });
    expect(response.signals[0]?.linkageDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(response)).not.toMatch(/Zoya|ration.?card.?number|address/i);
  });

  it('scores deterministic integrity rules and shares linkageDigest across duplicate fixtures', () => {
    const engine = new EligibilityScreeningEngine();
    const death = validateEligibilityScreeningResponse(engine.screen(request('BEN-DEMO-001', 'SCORE-DEATH-001')));
    expect(death.integrityScore).toBeGreaterThanOrEqual(40);
    expect(death.scoreBreakdown?.some((row) => row.ruleId === 'SCORE-DEATH-HIGH')).toBe(true);

    const a = engine.screen({ ...request('BEN-JK-DEMO-001', 'DUP-LINK-A-001'), checks: ['DUPLICATE'] });
    const b = engine.screen({ ...request('BEN-JK-DEMO-001B', 'DUP-LINK-B-001'), checks: ['DUPLICATE'] });
    expect(a.signals[0]?.linkageDigest).toBe(b.signals[0]?.linkageDigest);
    expect(a.integrityScore).toBeGreaterThanOrEqual(35);
    expect(a.status).toBe('DUPLICATE_RECORD_REVIEW');
    expect(JSON.stringify(a)).not.toMatch(/Aadhaar|UIDAI|biometric/i);
  });

  it('replays identical request IDs and rejects conflicting reuse', () => {
    const engine = new EligibilityScreeningEngine();
    const first = engine.screen(request('BEN-DEMO-001', 'SCREEN-SAME-001'));
    expect(engine.screen(request('BEN-DEMO-001', 'SCREEN-SAME-001'))).toEqual(first);
    expect(() => engine.screen(request('BEN-DEMO-002', 'SCREEN-SAME-001'))).toThrow(ScreeningConflictError);
  });

  it.each(['aadhaar', 'PAN', 'phone', 'address', 'beneficiaryName', 'rationCardNumber'])(
    'rejects prohibited identity field %s',
    (field) => {
      const engine = new EligibilityScreeningEngine();
      expect(() => engine.screen({ ...request('BEN-DEMO-001'), [field]: 'sensitive' })).toThrow(/prohibited field/);
    }
  );

  it('rejects invalid checks and non-opaque identifiers', () => {
    const engine = new EligibilityScreeningEngine();
    expect(() => engine.screen({ ...request('BEN-DEMO-001'), checks: ['BIOMETRIC'] })).toThrow();
    expect(() => engine.screen({ ...request('BEN-DEMO-001'), subjectRefHash: '1' })).toThrow();
  });
});
