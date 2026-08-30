import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthMode, AuthResult } from '@pds/shared-types';
import type { EligibilityScreeningRequest } from '@pds/shared-types';
import {
  BeneficiaryPortalService,
  CITIZEN_DEMO_OTP
} from '../src/modules/beneficiary-portal/beneficiary-portal.service.js';
import { EligibilityClient } from '../src/modules/eligibility/eligibility-client.js';
import { EligibilityRepository } from '../src/modules/eligibility/eligibility.repository.js';
import { EligibilityService } from '../src/modules/eligibility/eligibility.service.js';
import { clearEligibilityGates } from '../src/modules/eligibility/eligibility-gate.js';
import { BeneficiaryRegistryRepository } from '../src/modules/beneficiary-registry/beneficiary-registry.repository.js';
import { BeneficiaryRegistryService } from '../src/modules/beneficiary-registry/beneficiary-registry.service.js';
import { createDemoLedgerFixture, prepareFpsStock, type DemoLedgerFixture } from './helpers/demo-ledger.js';

/**
 * Simulated RCMS citizen login (Aadhaar + OTP) for the beneficiary
 * self-service portal. Covers the synthetic-only guard, OTP challenge
 * lifecycle, privacy masking, and per-card history scoping.
 */
describe('BeneficiaryPortalService', () => {
  let fixture: DemoLedgerFixture;
  let service: BeneficiaryPortalService;

  beforeEach(async () => {
    fixture = await createDemoLedgerFixture();
    service = new BeneficiaryPortalService(fixture.facade);
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  const signIn = (demoAadhaarNumber = '999988880001'): string => {
    const challenge = service.requestOtp(demoAadhaarNumber, '127.0.0.1');
    const verified = service.verifyOtp(challenge.challengeId, CITIZEN_DEMO_OTP);
    return verified.sessionToken;
  };

  it('rejects non-synthetic Aadhaar numbers without echoing the value', () => {
    const realLooking = '234512341234';
    try {
      service.requestOtp(realLooking, '127.0.0.1');
      expect.unreachable('non-synthetic Aadhaar must be rejected');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('synthetic');
      expect(message).not.toContain(realLooking);
    }
  });

  it('rejects malformed input', () => {
    expect(() => service.requestOtp('12345', '127.0.0.1')).toThrowError(/12-digit/);
    expect(() => service.requestOtp('not-a-number', '127.0.0.1')).toThrowError(/12-digit/);
  });

  it('returns 404 semantics for an unknown synthetic number', () => {
    expect(() => service.requestOtp('999988889999', '127.0.0.1')).toThrowError(/No demo beneficiary/);
  });

  it('directs family members to the head-of-family number', () => {
    expect(() => service.requestOtp('999988880011', '127.0.0.1')).toThrowError(/head-of-family/);
  });

  it('issues a challenge with masked mobile and verifies the demo OTP', () => {
    const challenge = service.requestOtp('999988880001', '127.0.0.1');
    expect(challenge.simulationOnly).toBe(true);
    expect(challenge.maskedMobile).toBe('XXXXXX0001');
    expect(challenge.demoOtpHint).toBe(CITIZEN_DEMO_OTP);

    const verified = service.verifyOtp(challenge.challengeId, CITIZEN_DEMO_OTP);
    expect(verified.sessionToken).toBeTruthy();
    expect(verified.profile.demoBeneficiaryId).toBe('BEN-DEMO-001');
    expect(verified.profile.maskedAadhaar).toBe('XXXX-XXXX-0001');
  });

  it('rejects wrong OTPs and locks the challenge after repeated attempts', () => {
    const challenge = service.requestOtp('999988880001', '127.0.0.1');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(() => service.verifyOtp(challenge.challengeId, '000000')).toThrowError(/Incorrect OTP/);
    }
    expect(() => service.verifyOtp(challenge.challengeId, '000000')).toThrowError(/Too many incorrect/);
    // Challenge is consumed; even the correct OTP no longer works.
    expect(() => service.verifyOtp(challenge.challengeId, CITIZEN_DEMO_OTP)).toThrowError(/expired or not found/);
  });

  it('never exposes full synthetic Aadhaar or mobile numbers in the profile', () => {
    const sessionToken = signIn();
    const profile = service.profile(sessionToken);
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toContain('999988880001');
    expect(serialized).not.toContain('9000080001');
    expect(profile.familyMembers.length).toBeGreaterThan(1);
    for (const member of profile.familyMembers) {
      expect(member.maskedAadhaar ?? '').not.toMatch(/^\d{12}$/);
    }
  });

  it('requires a valid session for profile and history reads', async () => {
    expect(() => service.profile(undefined)).toThrowError(/session required/);
    expect(() => service.profile('not-a-session')).toThrowError(/expired/);
    await expect(service.distributions('not-a-session')).rejects.toThrowError(/expired/);
    await expect(service.authHistory('not-a-session')).rejects.toThrowError(/expired/);
  });

  it('scopes distribution history to the signed-in card hash', async () => {
    const month = new Date().toISOString().slice(0, 7);
    prepareFpsStock(fixture.facade, 'ALLOC-CITIZEN-1', 100);

    fixture.facade.createOrUpdateEntitlement({
      rationCardHash: 'ration-card-demo-001-hash',
      commodity: 'Rice',
      month,
      monthlyEntitlementKg: 25,
      alreadyLiftedKg: 0,
      availableBalanceKg: 25,
      active: true
    });
    fixture.facade.createOrUpdateEntitlement({
      rationCardHash: 'ration-card-demo-002-hash',
      commodity: 'Rice',
      month,
      monthlyEntitlementKg: 20,
      alreadyLiftedKg: 0,
      availableBalanceKg: 20,
      active: true
    });

    fixture.facade.recordDistribution({
      distributionId: 'DIST-CITIZEN-001',
      fpsId: 'FPS-101',
      rationCardHash: 'ration-card-demo-001-hash',
      beneficiaryRefHash: 'beneficiary-demo-001-hash',
      commodity: 'Rice',
      deliveredKg: 5,
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS,
      authTxnRefHash: 'auth-txn-ref-citizen-001',
      dealerId: 'DLR-101'
    });
    fixture.facade.recordDistribution({
      distributionId: 'DIST-CITIZEN-002',
      fpsId: 'FPS-101',
      rationCardHash: 'ration-card-demo-002-hash',
      beneficiaryRefHash: 'beneficiary-demo-002-hash',
      commodity: 'Rice',
      deliveredKg: 5,
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS,
      authTxnRefHash: 'auth-txn-ref-citizen-002',
      dealerId: 'DLR-101'
    });

    const sessionToken = signIn('999988880001');
    const result = await service.distributions(sessionToken);
    expect(result.distributions.map((item) => item.distributionId)).toEqual(['DIST-CITIZEN-001']);

    const otherSession = signIn('999988880002');
    const otherResult = await service.distributions(otherSession);
    expect(otherResult.distributions.map((item) => item.distributionId)).toEqual(['DIST-CITIZEN-002']);
  });

  it('rate limits repeated OTP requests from one address', () => {
    for (let index = 0; index < 10; index += 1) {
      service.requestOtp('999988880001', '10.0.0.9');
    }
    expect(() => service.requestOtp('999988880001', '10.0.0.9')).toThrowError(/Too many OTP requests/);
  });
});

/**
 * Voluntary card surrender from the citizen portal: the signed-in beneficiary
 * confirms surrender, is removed from the active list via the eligibility
 * removal path, and sees the removed state on their own profile.
 */
describe('BeneficiaryPortalService card surrender', () => {
  let fixture: DemoLedgerFixture;
  let service: BeneficiaryPortalService;
  let eligibility: EligibilityService;

  beforeEach(async () => {
    clearEligibilityGates();
    fixture = await createDemoLedgerFixture();
    eligibility = new EligibilityService(
      new EligibilityClient({
        health: vi.fn().mockResolvedValue(true),
        screen: vi.fn(async (request: EligibilityScreeningRequest) => ({
          screeningId: `SCREEN-${request.demoBeneficiaryId}`,
          screeningRequestId: request.screeningRequestId,
          status: 'MULTI_SOURCE_CONFLICT' as const,
          signals: [{
            source: 'RCMS' as const,
            status: 'CONFLICT' as const,
            risk: 'HIGH' as const,
            observedAt: '2026-07-29T10:00:00.000Z',
            factCode: 'DEMO_SOURCE_CONFLICT'
          }],
          recommendedReviewAction: 'RECONCILE_SOURCES_AND_ALLOW_APPEAL',
          policy: {
            policyId: 'MH-PANEL-DEMO-2026-V1' as const,
            simulationOnly: true as const,
            ruleIds: ['MULTI-CONFLICT-01']
          },
          assessedAt: '2026-07-29T10:00:00.000Z',
          expiresAt: '2099-12-31T23:59:59.000Z',
          evidenceDigest: 'a'.repeat(64),
          responseAttestationHash: 'b'.repeat(64),
          schemaVersion: '1.0' as const
        }))
      }),
      new EligibilityRepository(),
      new BeneficiaryRegistryService(new BeneficiaryRegistryRepository())
    );
    service = new BeneficiaryPortalService(fixture.facade, eligibility);
  });

  afterEach(async () => {
    clearEligibilityGates();
    await fixture?.cleanup();
  });

  const signIn = (): string => {
    const challenge = service.requestOtp('999988880001', '127.0.0.1');
    return service.verifyOtp(challenge.challengeId, CITIZEN_DEMO_OTP).sessionToken;
  };

  it('requires a session and an explicit typed confirmation', async () => {
    await expect(service.surrender(undefined, 'SURRENDER')).rejects.toThrowError(/session required/);
    const sessionToken = signIn();
    await expect(service.surrender(sessionToken, 'yes please')).rejects.toThrowError(/Type SURRENDER/);
  });

  it('removes the card from the active list and reflects it on the citizen profile', async () => {
    const sessionToken = signIn();
    const result = await service.surrender(sessionToken, 'SURRENDER');
    expect(result.disposition).toBe('REMOVED');
    expect(result.profile.removal?.reasonCode).toBe('VOLUNTARY_SURRENDER');
    expect(result.profile.removal?.source).toBe('BENEFICIARY_SURRENDER');
    expect(result.profile.eligibility.status).toBe('CANCELLED');

    // The actor recorded for the removal is the opaque subject hash, not a name.
    const beneficiary = eligibility.getBeneficiary('BEN-DEMO-001');
    expect(beneficiary.removal?.removedBy).toBe(beneficiary.subjectRefHash);

    // The FPS entitlement gate now refuses issuance for this household.
    expect(eligibility.gate('BEN-DEMO-001', 1).allowed).toBe(false);

    // Repeat surrender replays idempotently instead of failing.
    const repeat = await service.surrender(sessionToken, 'SURRENDER');
    expect(['REMOVED', 'ALREADY_REMOVED']).toContain(repeat.disposition);
    expect(repeat.profile.removal?.reasonCode).toBe('VOLUNTARY_SURRENDER');
  });

  it('shows the reason and appeal guidance after an authorized DSO cancellation', async () => {
    const screened = await eligibility.runScreening({
      screeningRequestId: 'PORTAL-CASE-SCREEN-005',
      demoBeneficiaryId: 'BEN-DEMO-005',
      checks: ['ACTIVITY', 'ECONOMIC']
    }, 'PORTAL-CORR-005');
    const verified = await eligibility.verification(screened.case!.caseId, {
      idempotencyKey: 'PORTAL-VERIFY-005',
      expectedVersion: screened.case!.version,
      outcomeCode: 'EVIDENCE_RECONCILED',
      reasonCode: 'FIELD_VERIFIED'
    }, 'dso-officer');
    const recommended = await eligibility.recommendation(verified.caseId, {
      idempotencyKey: 'PORTAL-RECOMMEND-005',
      expectedVersion: verified.version,
      outcomeCode: 'INELIGIBLE',
      reasonCode: 'DEMO_POLICY_MATCH'
    }, 'dso-officer');
    await eligibility.decision(recommended.caseId, {
      idempotencyKey: 'PORTAL-DECIDE-005',
      expectedVersion: recommended.version,
      outcomeCode: 'AUTHORIZED',
      reasonCode: 'RCMS_AUTHORIZED_AFTER_REVIEW',
      decision: 'CARD_CANCELLED'
    }, 'dso-officer');

    const challenge = service.requestOtp('999988880005', '127.0.0.5');
    const token = service.verifyOtp(challenge.challengeId, CITIZEN_DEMO_OTP).sessionToken;
    const profile = service.profile(token);

    expect(profile.eligibility.status).toBe('CANCELLED');
    expect(profile.statusNotification).toMatchObject({
      title: 'Your ration card status has changed',
      caseId: screened.case!.caseId,
      reason: 'Conflicting eligibility records reconciled by the department.'
    });
    expect(profile.statusNotification?.message).toMatch(/conflicting eligibility records/i);
    expect(profile.statusNotification?.appealMessage).toMatch(/appeal/i);
  });
});
