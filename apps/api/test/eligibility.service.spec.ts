import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EligibilityScreeningAdapter } from '../src/modules/eligibility/eligibility-client.js';
import { EligibilityClient, EligibilityDependencyError } from '../src/modules/eligibility/eligibility-client.js';
import { EligibilityRepository } from '../src/modules/eligibility/eligibility.repository.js';
import { EligibilityService } from '../src/modules/eligibility/eligibility.service.js';
import { clearEligibilityGates } from '../src/modules/eligibility/eligibility-gate.js';
import type { EligibilityScreeningRequest, EligibilityScreeningResponse, EligibilityScreeningStatus } from '@pds/shared-types';
import { createHash } from 'node:crypto';

const priorPersistence = process.env.PDS_PERSISTENCE_BACKEND;
const priorDsn = process.env.PDS_POSTGRES_DSN;

beforeEach(() => {
  delete process.env.PDS_PERSISTENCE_BACKEND;
  delete process.env.PDS_POSTGRES_DSN;
});

afterEach(() => {
  if (priorPersistence === undefined) delete process.env.PDS_PERSISTENCE_BACKEND;
  else process.env.PDS_PERSISTENCE_BACKEND = priorPersistence;
  if (priorDsn === undefined) delete process.env.PDS_POSTGRES_DSN;
  else process.env.PDS_POSTGRES_DSN = priorDsn;
  clearEligibilityGates();
});

const digest = createHash('sha256').update('eligibility-test').digest('hex');
const response = (request: EligibilityScreeningRequest, status: EligibilityScreeningStatus): EligibilityScreeningResponse => ({
  screeningId: `SCREENING-${request.demoBeneficiaryId}`,
  screeningRequestId: request.screeningRequestId,
  status,
  signals: [{ source: 'RCMS', status: status === 'CLEAR' ? 'CLEAR' : 'MATCH', risk: 'HIGH', observedAt: '2026-07-23T00:00:00.000Z', factCode: 'TEST_SIGNAL' }],
  recommendedReviewAction: 'GUIDED_REVIEW',
  policy: { policyId: 'MH-PANEL-DEMO-2026-V1', simulationOnly: true, ruleIds: ['TEST-RULE-01'] },
  assessedAt: '2026-07-23T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  evidenceDigest: digest,
  responseAttestationHash: digest,
  schemaVersion: '1.0'
});

const statusByBeneficiary: Record<string, EligibilityScreeningStatus> = {
  'BEN-DEMO-001': 'DEATH_MATCH_REVIEW',
  'BEN-DEMO-002': 'PORTABILITY_ACTIVITY_FOUND',
  'BEN-DEMO-003': 'ECONOMIC_ELIGIBILITY_REVIEW',
  'BEN-DEMO-004': 'LANDHOLDING_REVIEW',
  'BEN-DEMO-005': 'MULTI_SOURCE_CONFLICT'
};

const createService = (adapter?: EligibilityScreeningAdapter, repository = new EligibilityRepository()) => {
  clearEligibilityGates();
  const resolved = adapter ?? {
    health: vi.fn().mockResolvedValue(true),
    screen: vi.fn(async (request: EligibilityScreeningRequest) => response(request, statusByBeneficiary[request.demoBeneficiaryId] ?? 'CLEAR'))
  };
  return new EligibilityService(new EligibilityClient(resolved), repository);
};

const run = (service: EligibilityService, id: string) =>
  service.runScreening({ screeningRequestId: `REQ-${id}`, demoBeneficiaryId: id, checks: ['DEATH', 'ACTIVITY'] }, 'CORR-001');

describe('eligibility review workflow', () => {
  it('keeps clear and portability outcomes eligible without opening a case', async () => {
    const service = createService();
    const portability = await run(service, 'BEN-DEMO-002');
    expect(portability.case).toBeNull();
    expect(portability.entitlementPreserved).toBe(true);
    expect(service.gate('BEN-DEMO-002', 1)).toMatchObject({ allowed: true, rcmsStatus: 'ACTIVE' });
  });

  it('replays identical on-demand screenings without changing case version and rejects conflicting request reuse', async () => {
    const service = createService();
    const first = await service.runScreening({
      screeningRequestId: 'SCREEN-REPLAY-001', demoBeneficiaryId: 'BEN-DEMO-001', checks: ['DEATH']
    }, 'CORR-1');
    const replay = await service.runScreening({
      screeningRequestId: 'SCREEN-REPLAY-001', demoBeneficiaryId: 'BEN-DEMO-001', checks: ['DEATH']
    }, 'CORR-2');
    expect(replay).toEqual(first);
    expect(replay.case?.version).toBe(1);
    await expect(service.runScreening({
      screeningRequestId: 'SCREEN-REPLAY-001', demoBeneficiaryId: 'BEN-DEMO-002', checks: ['ACTIVITY']
    }, 'CORR-3')).rejects.toMatchObject({ status: 409 });
  });

  it('recalculates a confirmed deceased member without blocking the household', async () => {
    const service = createService();
    const screened = await run(service, 'BEN-DEMO-001');
    const verified = await service.verification(screened.case!.caseId, {
      idempotencyKey: 'VERIFY-ASHA-1', expectedVersion: 1,
      outcomeCode: 'DECEASED_MEMBER_CONFIRMED', reasonCode: 'FIELD_VERIFIED'
    }, 'officer-1');
    expect(verified).toMatchObject({
      householdSize: 4, monthlyRiceEntitlementKg: 20, entitlementBlocked: false,
      proofStatus: 'PENDING', proofEventId: expect.stringMatching(/^ELIG-PROOF-/)
    });
    expect(service.gate('BEN-DEMO-001', 20)).toMatchObject({ allowed: true, availableBalanceKg: 20 });
    const recommended = await service.recommendation(verified.caseId, {
      idempotencyKey: 'RECOMMEND-ASHA-1', expectedVersion: verified.version,
      outcomeCode: 'ELIGIBLE', reasonCode: 'HOUSEHOLD_RECALCULATED'
    }, 'officer-1');
    const decided = await service.decision(recommended.caseId, {
      idempotencyKey: 'DECIDE-ASHA-1', expectedVersion: recommended.version,
      outcomeCode: 'MEMBER_REMOVED', reasonCode: 'DEATH_MEMBER_VERIFIED',
      decision: 'HOUSEHOLD_SIZE_RECALCULATED'
    }, 'decision-officer');
    expect(decided).toMatchObject({
      householdSize: 4, monthlyRiceEntitlementKg: 20, entitlementBlocked: false,
      rcmsStatus: 'ACTIVE', proofStatus: 'PENDING'
    });
  });

  it('blocks only after an effective cancellation and restores the consumed balance after appeal', async () => {
    const service = createService();
    const screened = await run(service, 'BEN-DEMO-005');
    const verified = await service.verification(screened.case!.caseId, {
      idempotencyKey: 'V-5', expectedVersion: 1, outcomeCode: 'EVIDENCE_RECONCILED', reasonCode: 'FIELD_REVIEW'
    }, 'officer');
    const recommended = await service.recommendation(verified.caseId, {
      idempotencyKey: 'R-5', expectedVersion: verified.version, outcomeCode: 'INELIGIBLE', reasonCode: 'DEMO_POLICY_MATCH'
    }, 'officer');
    expect(service.gate('BEN-DEMO-005', 1).allowed).toBe(true);
    const cancelled = await service.decision(recommended.caseId, {
      idempotencyKey: 'D-5', expectedVersion: recommended.version, outcomeCode: 'AUTHORIZED',
      reasonCode: 'RCMS_AUTHORIZED', decision: 'CARD_CANCELLED'
    }, 'decision-officer');
    await expect(service.decision(recommended.caseId, {
      idempotencyKey: 'D-5', expectedVersion: recommended.version, outcomeCode: 'AUTHORIZED',
      reasonCode: 'RCMS_AUTHORIZED', decision: 'CARD_CANCELLED'
    }, 'decision-officer')).resolves.toEqual(cancelled);
    expect(service.gate('BEN-DEMO-005', 1)).toMatchObject({ allowed: false, rcmsStatus: 'CANCELLED', alreadyLiftedKg: 10 });
    const appealed = await service.appeal(cancelled.caseId, {
      idempotencyKey: 'A-5', expectedVersion: cancelled.version, outcomeCode: 'ACCEPTED', reasonCode: 'CORRECTED_EVIDENCE'
    }, 'appeal-officer');
    const reinstated = await service.reinstate(appealed.caseId, {
      idempotencyKey: 'I-5', expectedVersion: appealed.version, outcomeCode: 'REINSTATED', reasonCode: 'APPEAL_UPHELD'
    }, 'decision-officer');
    expect(reinstated.proofStatus).toBe('PENDING');
    expect(service.gate('BEN-DEMO-005', 15)).toMatchObject({ allowed: true, availableBalanceKg: 15, alreadyLiftedKg: 10 });
  });

  it('persists refreshed Fabric proof status from the outbox onto eligibility cases', async () => {
    const pendingCase = {
      caseId: 'ELIG-CASE-PROOF', demoBeneficiaryId: 'BEN-DEMO-003',
      subjectRefHash: 'beneficiary-demo-003-hash', rationCardHash: 'ration-card-demo-003-hash',
      screening: response({
        screeningRequestId: 'REQ-PROOF', demoBeneficiaryId: 'BEN-DEMO-003',
        subjectRefHash: 'beneficiary-demo-003-hash', rationCardHash: 'ration-card-demo-003-hash',
        checks: ['ECONOMIC'], schemaVersion: '1.0'
      }, 'ECONOMIC_ELIGIBILITY_REVIEW'),
      state: 'NOTICE_ISSUED' as const, version: 2, rcmsStatus: 'ACTIVE' as const,
      entitlementBlocked: false, householdSize: 3, monthlyRiceEntitlementKg: 15,
      alreadyLiftedKg: 0, proofStatus: 'PENDING' as const, proofEventId: 'ELIG-PROOF-1',
      history: [], updatedAt: '2026-07-23T00:00:00.000Z'
    };
    const syncProofStatuses = vi.fn().mockResolvedValue(undefined);
    const repository = {
      loadState: vi.fn().mockResolvedValue({ cases: [pendingCase], actions: [], screenings: [] }),
      persistScreening: vi.fn(), persistCaseAction: vi.fn(), persistFinalDecision: vi.fn(),
      loadProofStatuses: vi.fn().mockResolvedValue(new Map([['ELIG-PROOF-1', 'COMMITTED']])),
      syncProofStatuses
    } as unknown as EligibilityRepository;
    const service = createService(undefined, repository);
    await service.onModuleInit();
    const listed = await service.listCases();
    expect(listed[0]?.proofStatus).toBe('COMMITTED');
    expect(syncProofStatuses).toHaveBeenCalledWith([
      { caseId: 'ELIG-CASE-PROOF', proofEventId: 'ELIG-PROOF-1', proofStatus: 'COMMITTED' }
    ]);
  });

  it('restores entitlement gates from durable eligibility cases after restart', async () => {
    const blockedCase = {
      caseId: 'ELIG-CASE-GATE', demoBeneficiaryId: 'BEN-DEMO-003',
      subjectRefHash: 'beneficiary-demo-003-hash', rationCardHash: 'ration-card-demo-003-hash',
      screening: response({
        screeningRequestId: 'REQ-GATE', demoBeneficiaryId: 'BEN-DEMO-003',
        subjectRefHash: 'beneficiary-demo-003-hash', rationCardHash: 'ration-card-demo-003-hash',
        checks: ['ECONOMIC'], schemaVersion: '1.0'
      }, 'ECONOMIC_ELIGIBILITY_REVIEW'),
      state: 'DECIDED' as const, version: 2, decision: 'CARD_CANCELLED' as const,
      rcmsStatus: 'CANCELLED' as const, entitlementBlocked: true, householdSize: 3,
      monthlyRiceEntitlementKg: 15, alreadyLiftedKg: 5, proofStatus: 'COMMITTED' as const,
      proofEventId: 'ELIG-PROOF-GATE', history: [], updatedAt: '2026-07-23T00:00:00.000Z'
    };
    const repository = {
      loadState: vi.fn().mockResolvedValue({ cases: [blockedCase], actions: [], screenings: [] }),
      persistScreening: vi.fn(), persistCaseAction: vi.fn(), persistFinalDecision: vi.fn(),
      loadProofStatuses: vi.fn().mockResolvedValue(new Map()),
      syncProofStatuses: vi.fn().mockResolvedValue(undefined)
    } as unknown as EligibilityRepository;
    const service = createService(undefined, repository);
    await service.onModuleInit();
    expect(service.gate('BEN-DEMO-003', 1)).toMatchObject({
      allowed: false, rcmsStatus: 'CANCELLED', reason: 'EFFECTIVE_RCMS_DECISION'
    });
  });

  it('enforces valid transitions, optimistic versions, identical replay, and conflicting idempotency reuse', async () => {
    const service = createService();
    const screened = await run(service, 'BEN-DEMO-003');
    const action = {
      idempotencyKey: 'NOTICE-3', expectedVersion: 1, outcomeCode: 'ISSUED', reasonCode: 'ECONOMIC_REVIEW'
    };
    const first = await service.notice(screened.case!.caseId, action, 'officer');
    expect(first).toMatchObject({ proofStatus: 'PENDING', proofEventId: expect.stringMatching(/^ELIG-PROOF-/) });
    await expect(service.notice(screened.case!.caseId, action, 'officer')).resolves.toEqual(first);
    await expect(service.notice(screened.case!.caseId, { ...action, reasonCode: 'DIFFERENT' }, 'officer')).rejects.toThrow(/Idempotency/);
    await expect(service.verification(screened.case!.caseId, {
      idempotencyKey: 'BAD-VERSION', expectedVersion: 1, outcomeCode: 'CONFIRMED', reasonCode: 'TEST'
    }, 'officer')).rejects.toThrow(/current version/);
    await expect(service.appeal(screened.case!.caseId, {
      idempotencyKey: 'BAD-STATE', expectedVersion: first.version, outcomeCode: 'ACCEPTED', reasonCode: 'TEST'
    }, 'officer')).rejects.toThrow(/invalid/);
  });

  it('allows only one of two simultaneous final decisions', async () => {
    const service = createService();
    const screened = await run(service, 'BEN-DEMO-003');
    const verified = await service.verification(screened.case!.caseId, {
      idempotencyKey: 'SIM-V', expectedVersion: 1, outcomeCode: 'CORROBORATED', reasonCode: 'FIELD_REVIEW'
    }, 'officer');
    const recommended = await service.recommendation(verified.caseId, {
      idempotencyKey: 'SIM-R', expectedVersion: verified.version, outcomeCode: 'INELIGIBLE', reasonCode: 'POLICY'
    }, 'officer');
    const decisions = await Promise.allSettled([
      service.decision(recommended.caseId, {
        idempotencyKey: 'SIM-D-1', expectedVersion: recommended.version,
        outcomeCode: 'AUTHORIZED', reasonCode: 'RCMS', decision: 'CARD_CANCELLED'
      }, 'officer-1'),
      service.decision(recommended.caseId, {
        idempotencyKey: 'SIM-D-2', expectedVersion: recommended.version,
        outcomeCode: 'AUTHORIZED', reasonCode: 'RCMS', decision: 'TEMPORARILY_SUSPENDED'
      }, 'officer-2')
    ]);
    expect(decisions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('restores in-memory case and entitlement gate when the PostgreSQL unit rolls back', async () => {
    const failingRepository = {
      loadState: vi.fn().mockResolvedValue({ cases: [], actions: [], screenings: [] }),
      persistScreening: vi.fn().mockResolvedValue(undefined),
      persistCaseAction: vi.fn().mockResolvedValue(undefined),
      persistFinalDecision: vi.fn().mockRejectedValue(new Error('database transaction rolled back'))
    } as unknown as EligibilityRepository;
    const service = createService(undefined, failingRepository);
    const screened = await run(service, 'BEN-DEMO-003');
    const verified = await service.verification(screened.case!.caseId, {
      idempotencyKey: 'ROLL-V', expectedVersion: 1, outcomeCode: 'CORROBORATED', reasonCode: 'FIELD_REVIEW'
    }, 'officer');
    const recommended = await service.recommendation(verified.caseId, {
      idempotencyKey: 'ROLL-R', expectedVersion: verified.version, outcomeCode: 'INELIGIBLE', reasonCode: 'POLICY'
    }, 'officer');
    await expect(service.decision(recommended.caseId, {
      idempotencyKey: 'ROLL-D', expectedVersion: recommended.version,
      outcomeCode: 'AUTHORIZED', reasonCode: 'RCMS', decision: 'CARD_CANCELLED'
    }, 'officer')).rejects.toThrow(/rolled back/);
    expect(service.getCase(recommended.caseId)).toMatchObject({
      state: 'RECOMMENDED_INELIGIBLE', version: recommended.version, entitlementBlocked: false
    });
    expect(service.gate('BEN-DEMO-003', 1)).toMatchObject({ allowed: true, rcmsStatus: 'ACTIVE' });
  });

  it.each(['NOT_CONFIGURED', 'TIMEOUT', 'UNAVAILABLE', 'CONFLICT', 'INVALID_RESPONSE'] as const)(
    'quarantines %s dependency failures without blocking entitlement',
    async (kind) => {
      const adapter: EligibilityScreeningAdapter = {
        health: vi.fn().mockResolvedValue(false),
        screen: vi.fn().mockRejectedValue(new EligibilityDependencyError('dependency failure', kind))
      };
      const service = createService(adapter);
      await expect(run(service, 'BEN-DEMO-003')).rejects.toMatchObject({ status: 503 });
      expect(service.gate('BEN-DEMO-003', 1)).toMatchObject({ allowed: true, rcmsStatus: 'ACTIVE' });
      expect((await service.summary()).quarantined).toBe(1);
    }
  );
});
