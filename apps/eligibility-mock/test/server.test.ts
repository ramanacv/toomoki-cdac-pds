import { describe, expect, it } from 'vitest';
import { EligibilityScreeningEngine } from '../src/screening.js';
import { handleEligibilityHttp } from '../src/server.js';

const request = (demoBeneficiaryId: string) => ({
  screeningRequestId: 'SCREEN-CONFLICT-001', demoBeneficiaryId,
  subjectRefHash: `subject-${demoBeneficiaryId}-hash`, rationCardHash: `card-${demoBeneficiaryId}-hash`,
  checks: ['DEATH'], schemaVersion: '1.0'
});

describe('eligibility mock HTTP boundary', () => {
  it('exposes public health and protects screenings with bearer authentication', () => {
    const engine = new EligibilityScreeningEngine();
    expect(handleEligibilityHttp('service-secret', engine, { method: 'GET', url: '/health' }).status).toBe(200);
    expect(handleEligibilityHttp('service-secret', engine, {
      method: 'POST', url: '/v1/screenings', body: request('BEN-DEMO-001')
    }).status).toBe(401);
    expect(handleEligibilityHttp('service-secret', engine, {
      method: 'POST', url: '/v1/screenings', authorization: 'Bearer wrong', body: request('BEN-DEMO-001')
    }).status).toBe(401);
  });

  it('returns 409 for conflicting idempotency reuse', () => {
    const engine = new EligibilityScreeningEngine();
    const send = (demoBeneficiaryId: string) => handleEligibilityHttp('service-secret', engine, {
      method: 'POST', url: '/v1/screenings', authorization: 'Bearer service-secret',
      body: request(demoBeneficiaryId)
    });
    expect(send('BEN-DEMO-001').status).toBe(200);
    expect(send('BEN-DEMO-002').status).toBe(409);
  });
});
