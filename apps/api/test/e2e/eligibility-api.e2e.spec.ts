import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { ELIGIBILITY_SCREENING_ADAPTER, type EligibilityScreeningAdapter } from '../../src/modules/eligibility/eligibility-client.js';
import type { EligibilityScreeningRequest, EligibilityScreeningResponse } from '@pds/shared-types';
import { createHash } from 'node:crypto';
import { GlobalExceptionFilter } from '../../src/infrastructure/exception.filter.js';

const digest = createHash('sha256').update('http-test').digest('hex');
const adapter: EligibilityScreeningAdapter = {
  health: vi.fn().mockResolvedValue(true),
  screen: vi.fn(async (input: EligibilityScreeningRequest): Promise<EligibilityScreeningResponse> => ({
    screeningId: 'SCREENING-HTTP-001',
    screeningRequestId: input.screeningRequestId,
    status: 'ECONOMIC_ELIGIBILITY_REVIEW',
    signals: [{ source: 'INCOME_TAX', status: 'MATCH', risk: 'HIGH', observedAt: '2026-07-23T00:00:00.000Z', factCode: 'DEMO_BAND' }],
    recommendedReviewAction: 'ISSUE_NOTICE',
    policy: { policyId: 'MH-PANEL-DEMO-2026-V1', simulationOnly: true, ruleIds: ['ECON-01'] },
    assessedAt: '2026-07-23T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
    evidenceDigest: digest, responseAttestationHash: digest, schemaVersion: '1.0'
  }))
};

describe('eligibility HTTP authorization and contract', () => {
  let app: INestApplication;
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PDS_AUTH_MODE = 'test';
    process.env.PDS_TEST_AUTH_TOKEN = 'eligibility-token';
    process.env.PDS_TEST_AUTH_ROLE = 'department';
    process.env.PDS_AUTHORIZATION_MODE = 'claims';
    process.env.PDS_LEDGER_MODE = 'demo';
    process.env.PDS_LEDGER_BACKEND = 'local-file';
    process.env.PDS_PERSISTENCE_BACKEND = 'file';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ELIGIBILITY_SCREENING_ADAPTER).useValue(adapter).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });
  afterEach(async () => { await app.close(); });

  const auth = (role: string) => ({ Authorization: `Bearer eligibility-token:${role}` });

  it('allows department mutation and oversight reads while denying auditor/management mutation', async () => {
    const screened = await request(app.getHttpServer()).post('/eligibility/v1/screenings').set(auth('department')).send({
      screeningRequestId: 'SCREEN-HTTP-001', demoBeneficiaryId: 'BEN-DEMO-003', checks: ['ECONOMIC']
    }).expect(201);
    expect(screened.body.case.entitlementBlocked).toBe(false);
    await request(app.getHttpServer()).get('/eligibility/v1/cases').set(auth('auditor')).expect(200);
    await request(app.getHttpServer()).get('/eligibility/v1/summary').set(auth('management')).expect(200);
    await request(app.getHttpServer()).post('/eligibility/v1/screenings').set(auth('auditor')).send({
      screeningRequestId: 'SCREEN-HTTP-002', demoBeneficiaryId: 'BEN-DEMO-003', checks: ['ECONOMIC']
    }).expect(403);
    await request(app.getHttpServer()).post('/eligibility/v1/screenings').set(auth('management')).send({
      screeningRequestId: 'SCREEN-HTTP-003', demoBeneficiaryId: 'BEN-DEMO-003', checks: ['ECONOMIC']
    }).expect(403);
  });

  it('rejects unknown beneficiaries and invalid checks at the boundary', async () => {
    await request(app.getHttpServer()).post('/eligibility/v1/screenings').set(auth('department')).send({
      screeningRequestId: 'SCREEN-HTTP-X', demoBeneficiaryId: 'BEN-DEMO-999', checks: ['ECONOMIC']
    }).expect(404);
    await request(app.getHttpServer()).post('/eligibility/v1/screenings').set(auth('department')).send({
      screeningRequestId: 'SCREEN-HTTP-X', demoBeneficiaryId: 'BEN-DEMO-001', checks: ['BIOMETRIC']
    }).expect(400);
  });

  it('allows only department to mutate the beneficiary lifecycle registry', async () => {
    const body = {
      eventId: 'HTTP-JK-LIFECYCLE-001',
      beneficiaryRefHash: 'beneficiary-jk-http-001-hash',
      rationCardHash: 'ration-card-jk-http-001-hash',
      eventType: 'BENEFICIARY_CREATED',
      sourceSystem: 'VIKSITPDS_DEMO',
      occurredAt: '2026-07-23T10:00:00.000Z',
      effectiveAt: '2026-07-23T10:00:00.000Z',
      reasonCode: 'DEMO_REGISTRY_IMPORT',
      policyId: 'JK-PANEL-DEMO-2026-V1',
      evidenceDigest: 'a'.repeat(64),
      districtCode: 'JK-DEMO-01',
      householdSizeDelta: 5,
      schemaVersion: '1.0'
    };
    await request(app.getHttpServer()).post('/beneficiary-registry/v1/events')
      .set(auth('department')).send(body).expect(201);
    await request(app.getHttpServer()).post('/beneficiary-registry/v1/events')
      .set(auth('auditor')).send({ ...body, eventId: 'HTTP-JK-LIFECYCLE-002' }).expect(403);
    await request(app.getHttpServer()).get('/beneficiary-registry/v1/summary')
      .set(auth('auditor')).expect(200);
  });

  it('keeps the real entitlement validator open during review, blocks after cancellation, and reopens after reinstatement', async () => {
    await request(app.getHttpServer()).post('/entitlements').set(auth('department')).send({
      rationCardHash: 'ration-card-demo-003-hash', commodity: 'Rice', month: '2026-07',
      monthlyEntitlementKg: 15, alreadyLiftedKg: 5, availableBalanceKg: 10, active: true
    }).expect(201);
    const validate = () => request(app.getHttpServer()).post('/entitlements/validate').set(auth('department')).send({
      rationCardHash: 'ration-card-demo-003-hash', commodity: 'Rice', month: '2026-07', requestedQtyKg: 1
    });
    await validate().expect(201);
    const screened = await request(app.getHttpServer()).post('/eligibility/v1/screenings').set(auth('department')).send({
      screeningRequestId: 'SCREEN-GATE-003', demoBeneficiaryId: 'BEN-DEMO-003', checks: ['ECONOMIC']
    }).expect(201);
    await validate().expect(201);
    const verified = await request(app.getHttpServer())
      .post(`/eligibility/v1/cases/${screened.body.case.caseId}/verification`).set(auth('department')).send({
        idempotencyKey: 'HTTP-VERIFY-3', expectedVersion: 1, outcomeCode: 'CORROBORATED', reasonCode: 'FIELD_REVIEW'
      }).expect(201);
    const recommendation = await request(app.getHttpServer())
      .post(`/eligibility/v1/cases/${screened.body.case.caseId}/recommendation`).set(auth('department')).send({
        idempotencyKey: 'HTTP-RECOMMEND-3', expectedVersion: verified.body.version,
        outcomeCode: 'INELIGIBLE', reasonCode: 'DEMO_POLICY_MATCH'
      }).expect(201);
    const decision = await request(app.getHttpServer())
      .post(`/eligibility/v1/cases/${screened.body.case.caseId}/decision`).set(auth('department')).send({
        idempotencyKey: 'HTTP-DECISION-3', expectedVersion: recommendation.body.version,
        outcomeCode: 'AUTHORIZED', reasonCode: 'RCMS_AUTHORIZED', decision: 'CARD_CANCELLED'
      }).expect(201);
    expect(decision.body).toMatchObject({ entitlementBlocked: true, rcmsStatus: 'CANCELLED', proofStatus: 'PENDING' });
    await validate().expect(400);
    const appealed = await request(app.getHttpServer())
      .post(`/eligibility/v1/cases/${screened.body.case.caseId}/appeals`).set(auth('department')).send({
        idempotencyKey: 'HTTP-APPEAL-3', expectedVersion: decision.body.version,
        outcomeCode: 'ACCEPTED', reasonCode: 'CORRECTED_EVIDENCE'
      }).expect(201);
    await validate().expect(400);
    await request(app.getHttpServer())
      .post(`/eligibility/v1/cases/${screened.body.case.caseId}/reinstate`).set(auth('department')).send({
        idempotencyKey: 'HTTP-REINSTATE-3', expectedVersion: appealed.body.version,
        outcomeCode: 'REINSTATED', reasonCode: 'APPEAL_UPHELD'
      }).expect(201);
    await validate().expect(201);
  });
});
