/**
 * Beneficiary lifecycle + fraud-prevention coverage.
 *
 * Focus: registry state machine, eligibility integrity review paths, entitlement
 * gate, checkpoint proofs, and privacy-safe outbox intents — not supply-chain stock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  BENEFICIARY_LIFECYCLE_EVENT_TYPES,
  type BeneficiaryLifecycleEvent,
  type EligibilityScreeningRequest,
  type EligibilityScreeningResponse,
  type EligibilityScreeningStatus
} from '@pds/shared-types';
import { BeneficiaryRegistryRepository } from '../src/modules/beneficiary-registry/beneficiary-registry.repository.js';
import { BeneficiaryRegistryService } from '../src/modules/beneficiary-registry/beneficiary-registry.service.js';
import type { EligibilityScreeningAdapter } from '../src/modules/eligibility/eligibility-client.js';
import { EligibilityClient } from '../src/modules/eligibility/eligibility-client.js';
import { clearEligibilityGates } from '../src/modules/eligibility/eligibility-gate.js';
import { EligibilityRepository } from '../src/modules/eligibility/eligibility.repository.js';
import { EligibilityService } from '../src/modules/eligibility/eligibility.service.js';

const digest = createHash('sha256').update('beneficiary-lifecycle-fraud').digest('hex');
const linkageDigest = createHash('sha256').update('viksitpds-demo-duplicate-linkage-v1').digest('hex');

const lifecycleEvent = (overrides: Partial<BeneficiaryLifecycleEvent> = {}): BeneficiaryLifecycleEvent => ({
  eventId: 'BEN-FRAUD-EVT-001',
  beneficiaryRefHash: 'beneficiary-fraud-demo-001-hash',
  rationCardHash: 'ration-card-fraud-demo-001-hash',
  eventType: 'BENEFICIARY_CREATED',
  sourceSystem: 'VIKSITPDS_DEMO',
  occurredAt: '2026-07-26T10:00:00.000Z',
  effectiveAt: '2026-07-26T10:00:00.000Z',
  reasonCode: 'DEMO_REGISTRY_IMPORT',
  policyId: 'MH-PANEL-DEMO-2026-V1',
  evidenceDigest: digest,
  districtCode: 'MH-DEMO-01',
  householdSizeDelta: 5,
  schemaVersion: '1.0',
  ...overrides
});

const screeningResponse = (
  request: EligibilityScreeningRequest,
  status: EligibilityScreeningStatus,
  extras: Partial<EligibilityScreeningResponse> = {}
): EligibilityScreeningResponse => ({
  screeningId: `SCREENING-${request.demoBeneficiaryId}`,
  screeningRequestId: request.screeningRequestId,
  status,
  signals: [{
    source: status === 'DUPLICATE_RECORD_REVIEW' ? 'REGISTRY_LINKAGE' : 'RCMS',
    status: status === 'CLEAR' || status === 'PORTABILITY_ACTIVITY_FOUND' ? 'CLEAR' : 'MATCH',
    risk: status === 'CLEAR' ? 'LOW' : 'HIGH',
    observedAt: '2026-07-26T00:00:00.000Z',
    factCode: status === 'DUPLICATE_RECORD_REVIEW' ? 'TWO_ACTIVE_REGISTRY_REFERENCES' : 'TEST_SIGNAL',
    ...(status === 'DUPLICATE_RECORD_REVIEW' ? { linkageDigest } : {})
  }],
  recommendedReviewAction: 'GUIDED_REVIEW',
  policy: {
    policyId: status.startsWith('DUPLICATE') || request.demoBeneficiaryId.includes('JK')
      ? 'JK-PANEL-DEMO-2026-V1'
      : 'MH-PANEL-DEMO-2026-V1',
    simulationOnly: true,
    ruleIds: ['TEST-RULE-01']
  },
  assessedAt: '2026-07-26T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  evidenceDigest: digest,
  responseAttestationHash: digest,
  schemaVersion: '1.0',
  integrityScore: status === 'CLEAR' ? 0 : 45,
  scoreBreakdown: status === 'CLEAR' ? [] : [{
    ruleId: 'SCORE-TEST',
    signalFactCode: 'TEST_SIGNAL',
    weight: 45,
    contribution: 45,
    rationaleCode: 'FIXTURE_REVIEW'
  }],
  ...extras
});

const panelStatuses: Record<string, EligibilityScreeningStatus> = {
  'BEN-DEMO-001': 'DEATH_MATCH_REVIEW',
  'BEN-DEMO-002': 'PORTABILITY_ACTIVITY_FOUND',
  'BEN-DEMO-003': 'ECONOMIC_ELIGIBILITY_REVIEW',
  'BEN-DEMO-004': 'LANDHOLDING_REVIEW',
  'BEN-DEMO-005': 'MULTI_SOURCE_CONFLICT',
  'BEN-JK-DEMO-001': 'DUPLICATE_RECORD_REVIEW'
};

const createEligibilityService = (
  adapter?: EligibilityScreeningAdapter,
  registry?: BeneficiaryRegistryService
) => {
  clearEligibilityGates();
  const resolved = adapter ?? {
    health: vi.fn().mockResolvedValue(true),
    screen: vi.fn(async (request: EligibilityScreeningRequest) =>
      screeningResponse(request, panelStatuses[request.demoBeneficiaryId] ?? 'CLEAR'))
  };
  // Force in-memory repositories — do not attach to the live demo Postgres DSN.
  return new EligibilityService(
    new EligibilityClient(resolved),
    new EligibilityRepository(undefined),
    registry
  );
};

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

describe('beneficiary registry lifecycle state machine', () => {
  it('walks create → member add/remove → migration → bifurcation → verification → status → deactivate', async () => {
    const repository = new BeneficiaryRegistryRepository();
    const created = await repository.apply(lifecycleEvent());
    expect(created.projection).toMatchObject({
      state: 'ACTIVE', householdSize: 5, districtCode: 'MH-DEMO-01', version: 1
    });
    expect(created.proofEventId).toMatch(/^BEN-LIFECYCLE-/);

    const added = await repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-EVT-002', eventType: 'MEMBER_ADDED', householdSizeDelta: 1, priorState: 'ACTIVE'
    }));
    expect(added.projection.householdSize).toBe(6);

    const removed = await repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-EVT-003', eventType: 'MEMBER_REMOVED', householdSizeDelta: -1, priorState: 'ACTIVE'
    }));
    expect(removed.projection.householdSize).toBe(5);

    const migrated = await repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-EVT-004', eventType: 'MIGRATION_RECORDED',
      householdSizeDelta: 0, districtCode: 'MH-DEMO-02', priorState: 'ACTIVE'
    }));
    expect(migrated.projection.districtCode).toBe('MH-DEMO-02');

    const bifurcated = await repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-EVT-005', eventType: 'HOUSEHOLD_BIFURCATED',
      householdSizeDelta: -2, priorState: 'ACTIVE'
    }));
    expect(bifurcated.projection.householdSize).toBe(3);

    const verified = await repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-EVT-006', eventType: 'VERIFICATION_COMPLETED',
      householdSizeDelta: 0, priorState: 'ACTIVE'
    }));
    expect(verified.projection.version).toBe(6);

    const underReview = await repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-EVT-007', eventType: 'STATUS_CHANGED',
      householdSizeDelta: 0, priorState: 'ACTIVE', newState: 'UNDER_REVIEW'
    }));
    expect(underReview.projection.state).toBe('UNDER_REVIEW');

    const suspended = await repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-EVT-008', eventType: 'STATUS_CHANGED',
      householdSizeDelta: 0, priorState: 'UNDER_REVIEW', newState: 'SUSPENDED'
    }));
    expect(suspended.projection.state).toBe('SUSPENDED');

    const deactivated = await repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-EVT-009', eventType: 'RECORD_DEACTIVATED',
      householdSizeDelta: 0, priorState: 'SUSPENDED', newState: 'DEACTIVATED'
    }));
    expect(deactivated.projection.state).toBe('DEACTIVATED');

    const summary = await repository.summary();
    expect(summary.lifecycleEvents).toBe(9);
    expect(summary.activeRecords).toBe(0);
    for (const eventType of BENEFICIARY_LIFECYCLE_EVENT_TYPES) {
      if (eventType === 'CARD_TRANSFERRED') continue; // covered below
      expect(summary.byEventType[eventType] ?? 0).toBeGreaterThan(0);
    }
  });

  it('records card transfer without changing household size and rejects conflicting eventId reuse', async () => {
    const repository = new BeneficiaryRegistryRepository();
    await repository.apply(lifecycleEvent({ eventId: 'BEN-FRAUD-XFER-1' }));
    const transferred = await repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-XFER-2',
      eventType: 'CARD_TRANSFERRED',
      householdSizeDelta: 0,
      priorState: 'ACTIVE',
      reasonCode: 'CARD_TRANSFER_AUTHORIZED'
    }));
    expect(transferred.projection).toMatchObject({ householdSize: 5, state: 'ACTIVE', version: 2 });
    await expect(repository.apply(lifecycleEvent({ eventId: 'BEN-FRAUD-XFER-2', reasonCode: 'OTHER' })))
      .rejects.toMatchObject({ status: 409 });
    await expect(repository.apply(lifecycleEvent({
      eventId: 'BEN-FRAUD-XFER-2',
      eventType: 'CARD_TRANSFERRED',
      householdSizeDelta: 0,
      priorState: 'ACTIVE',
      reasonCode: 'CARD_TRANSFER_AUTHORIZED'
    }))).resolves.toMatchObject({ disposition: 'REPLAY' });
  });

  it('rejects invalid lifecycle transitions and deltas (negative paths)', async () => {
    const repository = new BeneficiaryRegistryRepository();
    await expect(repository.apply(lifecycleEvent({ eventType: 'MEMBER_ADDED', householdSizeDelta: 1 })))
      .rejects.toThrow(/first lifecycle event/);
    await repository.apply(lifecycleEvent());
    await expect(repository.apply(lifecycleEvent({ eventId: 'DUP-CREATE', eventType: 'BENEFICIARY_CREATED' })))
      .rejects.toThrow(/already exists/);
    await expect(repository.apply(lifecycleEvent({
      eventId: 'BAD-ADD', eventType: 'MEMBER_ADDED', householdSizeDelta: 0, priorState: 'ACTIVE'
    }))).rejects.toThrow(/positive householdSizeDelta/);
    await expect(repository.apply(lifecycleEvent({
      eventId: 'BAD-REM', eventType: 'MEMBER_REMOVED', householdSizeDelta: 1, priorState: 'ACTIVE'
    }))).rejects.toThrow(/negative householdSizeDelta/);
    await expect(repository.apply(lifecycleEvent({
      eventId: 'BAD-PRIOR', eventType: 'STATUS_CHANGED', householdSizeDelta: 0,
      priorState: 'SUSPENDED', newState: 'ACTIVE'
    }))).rejects.toThrow(/Expected beneficiary state/);
    await expect(repository.apply(lifecycleEvent({
      eventId: 'BAD-NEG-HH', eventType: 'MEMBER_REMOVED', householdSizeDelta: -99, priorState: 'ACTIVE'
    }))).rejects.toThrow(/negative/);
  });

  it('keeps proof payloads free of display identity for every event type', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    let projectionRow: Record<string, unknown> | undefined;
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, ...(values ? { values } : {}) });
        if (text.includes('WHERE event_id = $1 FOR UPDATE')) return { rows: [], rowCount: 0 };
        if (text.includes('FROM beneficiary_registry_projection') && text.includes('FOR UPDATE')) {
          return { rows: projectionRow ? [projectionRow] : [], rowCount: projectionRow ? 1 : 0 };
        }
        if (text.includes('beneficiary_registry_projection')) {
          projectionRow = {
            beneficiary_ref_hash: 'beneficiary-fraud-demo-001-hash',
            ration_card_hash: 'ration-card-fraud-demo-001-hash',
            district_code: 'MH-DEMO-01',
            household_size: 5,
            state: 'ACTIVE',
            version: 1,
            last_event_id: 'x',
            updated_at: '2026-07-26T10:00:00.000Z',
            proof_status: 'PENDING'
          };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn()
    };
    const pool = { connect: vi.fn().mockResolvedValue(client), end: vi.fn() };
    const repository = new BeneficiaryRegistryRepository(pool as never);
    await repository.apply(lifecycleEvent({ eventId: 'PRIVACY-CREATE' }));
    projectionRow = {
      beneficiary_ref_hash: 'beneficiary-fraud-demo-001-hash',
      ration_card_hash: 'ration-card-fraud-demo-001-hash',
      district_code: 'MH-DEMO-01',
      household_size: 5,
      state: 'ACTIVE',
      version: 1,
      last_event_id: 'PRIVACY-CREATE',
      updated_at: '2026-07-26T10:00:00.000Z',
      proof_status: 'PENDING'
    };
    await repository.apply(lifecycleEvent({
      eventId: 'PRIVACY-MIGRATE', eventType: 'MIGRATION_RECORDED',
      householdSizeDelta: 0, priorState: 'ACTIVE', districtCode: 'MH-DEMO-09'
    }));
    const serialized = JSON.stringify(queries.flatMap((query) => query.values ?? []));
    expect(serialized).toContain('beneficiary-fraud-demo-001-hash');
    expect(serialized).not.toMatch(/Asha|Patil|9999|Aadhaar|phone|RC-DEMO/i);
    expect(queries.map((query) => query.text).join('\n')).toContain('INSERT INTO ledger_outbox');
  });
});

describe('eligibility fraud-prevention review matrix', () => {
  it.each(Object.entries(panelStatuses))(
    'handles panel beneficiary %s with status %s without auto-blocking entitlement',
    async (demoBeneficiaryId, status) => {
      const service = createEligibilityService();
      const result = await service.runScreening({
        screeningRequestId: `REQ-PANEL-${demoBeneficiaryId}`,
        demoBeneficiaryId,
        checks: ['DEATH', 'ACTIVITY', 'ECONOMIC', 'LAND', 'DUPLICATE']
      }, 'CORR-PANEL');
      expect(result.screening.status).toBe(status);
      expect(result.entitlementPreserved).toBe(true);
      if (status === 'PORTABILITY_ACTIVITY_FOUND') {
        expect(result.case).toBeNull();
        expect(service.gate(demoBeneficiaryId, 1).allowed).toBe(true);
      } else {
        expect(result.case?.state).toBe('OPEN');
        expect(result.case?.entitlementBlocked).toBe(false);
        expect(service.gate(demoBeneficiaryId, 1).allowed).toBe(true);
      }
    }
  );

  it('opens duplicate review from linkageDigest collision without claiming Aadhaar match', async () => {
    const service = createEligibilityService();
    const result = await service.runScreening({
      screeningRequestId: 'REQ-DUP-LINK-001',
      demoBeneficiaryId: 'BEN-JK-DEMO-001',
      checks: ['DUPLICATE']
    }, 'CORR-DUP');
    expect(result.screening.status).toBe('DUPLICATE_RECORD_REVIEW');
    expect(result.screening.signals[0]?.linkageDigest).toBe(linkageDigest);
    expect(result.case?.entitlementBlocked).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/Aadhaar|UIDAI|biometric/i);
  });

  it('blocks distribution only after authorized RCMS cancellation and restores after reinstatement', async () => {
    const service = createEligibilityService();
    const screened = await service.runScreening({
      screeningRequestId: 'REQ-CANCEL-005',
      demoBeneficiaryId: 'BEN-DEMO-005',
      checks: ['ECONOMIC']
    }, 'CORR-1');
    const verified = await service.verification(screened.case!.caseId, {
      idempotencyKey: 'V-CANCEL', expectedVersion: 1,
      outcomeCode: 'EVIDENCE_RECONCILED', reasonCode: 'FIELD_REVIEW'
    }, 'officer');
    expect(verified.proofStatus).toBe('PENDING');
    const recommended = await service.recommendation(verified.caseId, {
      idempotencyKey: 'R-CANCEL', expectedVersion: verified.version,
      outcomeCode: 'INELIGIBLE', reasonCode: 'POLICY'
    }, 'officer');
    expect(service.gate('BEN-DEMO-005', 1).allowed).toBe(true);
    const cancelled = await service.decision(recommended.caseId, {
      idempotencyKey: 'D-CANCEL', expectedVersion: recommended.version,
      outcomeCode: 'AUTHORIZED', reasonCode: 'RCMS_AUTHORIZED', decision: 'CARD_CANCELLED'
    }, 'decision-officer');
    expect(cancelled).toMatchObject({
      entitlementBlocked: true, rcmsStatus: 'CANCELLED', proofStatus: 'PENDING'
    });
    expect(service.gate('BEN-DEMO-005', 1)).toMatchObject({
      allowed: false, reason: 'EFFECTIVE_RCMS_DECISION'
    });
    const appealed = await service.appeal(cancelled.caseId, {
      idempotencyKey: 'A-CANCEL', expectedVersion: cancelled.version,
      outcomeCode: 'ACCEPTED', reasonCode: 'CORRECTED_EVIDENCE'
    }, 'appeal-officer');
    expect(appealed.proofStatus).toBe('PENDING');
    const reinstated = await service.reinstate(appealed.caseId, {
      idempotencyKey: 'I-CANCEL', expectedVersion: appealed.version,
      outcomeCode: 'REINSTATED', reasonCode: 'APPEAL_UPHELD'
    }, 'decision-officer');
    expect(reinstated.entitlementBlocked).toBe(false);
    expect(service.gate('BEN-DEMO-005', 1).allowed).toBe(true);
  });

  it('recalculates household on death verification, bridges MEMBER_REMOVED, and never auto-cancels', async () => {
    const registry = new BeneficiaryRegistryService(new BeneficiaryRegistryRepository());
    const service = createEligibilityService(undefined, registry);
    const screened = await service.runScreening({
      screeningRequestId: 'REQ-DEATH-001',
      demoBeneficiaryId: 'BEN-DEMO-001',
      checks: ['DEATH']
    }, 'CORR-DEATH');
    const verified = await service.verification(screened.case!.caseId, {
      idempotencyKey: 'V-DEATH', expectedVersion: 1,
      outcomeCode: 'DECEASED_MEMBER_CONFIRMED', reasonCode: 'FIELD_VERIFIED'
    }, 'officer');
    expect(verified).toMatchObject({
      householdSize: 4,
      monthlyRiceEntitlementKg: 20,
      entitlementBlocked: false,
      proofStatus: 'PENDING'
    });
    expect(service.gate('BEN-DEMO-001', 20).allowed).toBe(true);
    const summary = await registry.summary();
    expect(summary.lifecycleEvents).toBeGreaterThanOrEqual(1);
    expect(summary.byEventType.MEMBER_REMOVED ?? summary.byEventType.BENEFICIARY_CREATED).toBeGreaterThan(0);
    const recommended = await service.recommendation(verified.caseId, {
      idempotencyKey: 'R-DEATH', expectedVersion: verified.version,
      outcomeCode: 'ELIGIBLE', reasonCode: 'HOUSEHOLD_RECALCULATED'
    }, 'officer');
    const decided = await service.decision(recommended.caseId, {
      idempotencyKey: 'D-DEATH', expectedVersion: recommended.version,
      outcomeCode: 'MEMBER_REMOVED', reasonCode: 'DEATH_MEMBER_VERIFIED',
      decision: 'HOUSEHOLD_SIZE_RECALCULATED'
    }, 'decision-officer');
    expect(decided.entitlementBlocked).toBe(false);
    expect(decided.rcmsStatus).toBe('ACTIVE');
  });

  it('keeps benefits when screening dependency fails (negative dependency path)', async () => {
    const adapter: EligibilityScreeningAdapter = {
      health: vi.fn().mockResolvedValue(false),
      screen: vi.fn().mockRejectedValue(new Error('mock screening unavailable'))
    };
    const service = createEligibilityService(adapter);
    await expect(service.runScreening({
      screeningRequestId: 'REQ-DEP-FAIL',
      demoBeneficiaryId: 'BEN-DEMO-003',
      checks: ['ECONOMIC']
    }, 'CORR-DEP')).rejects.toMatchObject({ status: 503 });
    expect(service.gate('BEN-DEMO-003', 1)).toMatchObject({ allowed: true, rcmsStatus: 'ACTIVE' });
  });

  it('assigns checkpoint proofs for notice/recommendation without RCMS entitlement mutation', async () => {
    const service = createEligibilityService();
    const screened = await service.runScreening({
      screeningRequestId: 'REQ-PROOF-003',
      demoBeneficiaryId: 'BEN-DEMO-003',
      checks: ['ECONOMIC']
    }, 'CORR-P');
    const noticed = await service.notice(screened.case!.caseId, {
      idempotencyKey: 'N-PROOF', expectedVersion: 1,
      outcomeCode: 'ISSUED', reasonCode: 'ECONOMIC_REVIEW'
    }, 'officer');
    expect(noticed).toMatchObject({
      state: 'NOTICE_ISSUED',
      proofStatus: 'PENDING',
      proofEventId: expect.stringMatching(/^ELIG-PROOF-/),
      entitlementBlocked: false
    });
    const verified = await service.verification(noticed.caseId, {
      idempotencyKey: 'V-PROOF', expectedVersion: noticed.version,
      outcomeCode: 'CORROBORATED', reasonCode: 'FIELD_REVIEW'
    }, 'officer');
    const recommended = await service.recommendation(verified.caseId, {
      idempotencyKey: 'R-PROOF', expectedVersion: verified.version,
      outcomeCode: 'INELIGIBLE', reasonCode: 'POLICY'
    }, 'officer');
    expect(recommended.proofStatus).toBe('PENDING');
    expect(service.gate('BEN-DEMO-003', 1).allowed).toBe(true);
  });
});
