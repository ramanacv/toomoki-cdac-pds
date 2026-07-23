import { describe, expect, it, vi } from 'vitest';
import type { EligibilityCase } from '@pds/shared-types';
import { EligibilityRepository } from '../src/modules/eligibility/eligibility.repository.js';

const item: EligibilityCase = {
  caseId: 'ELIG-CASE-003', demoBeneficiaryId: 'BEN-DEMO-003',
  subjectRefHash: 'beneficiary-demo-003-hash', rationCardHash: 'ration-card-demo-003-hash',
  screening: {
    screeningId: 'SCREENING-003', screeningRequestId: 'REQUEST-003', status: 'ECONOMIC_ELIGIBILITY_REVIEW',
    signals: [{ source: 'INCOME_TAX', status: 'MATCH', risk: 'HIGH', observedAt: '2026-07-23T00:00:00Z', factCode: 'DEMO_BAND' }],
    recommendedReviewAction: 'ISSUE_NOTICE',
    policy: { policyId: 'MH-PANEL-DEMO-2026-V1', simulationOnly: true, ruleIds: ['ECON-01'] },
    assessedAt: '2026-07-23T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
    evidenceDigest: 'a'.repeat(64), responseAttestationHash: 'b'.repeat(64), schemaVersion: '1.0'
  },
  state: 'DECIDED', version: 4, decision: 'CARD_CANCELLED', rcmsStatus: 'CANCELLED',
  entitlementBlocked: true, householdSize: 3, monthlyRiceEntitlementKg: 15, alreadyLiftedKg: 5,
  proofStatus: 'PENDING', proofEventId: 'ELIG-PROOF-ATOMIC-003',
  history: [{
    actionId: 'ACTION-003', action: 'DECISION', outcomeCode: 'AUTHORIZED', reasonCode: 'RCMS_AUTHORIZED',
    actorRef: 'department-officer-ref', occurredAt: '2026-07-23T01:00:00Z',
    priorState: 'RECOMMENDED_INELIGIBLE', newState: 'DECIDED'
  }],
  updatedAt: '2026-07-23T01:00:00Z'
};

type FakeOptions = { currentVersion?: number; failOn?: string };
const fakePool = ({ currentVersion, failOn }: FakeOptions = {}) => {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, ...(values ? { values } : {}) });
      if (failOn && text.includes(failOn)) throw new Error('injected database failure');
      if (text.includes('SELECT version')) return { rows: currentVersion === undefined ? [] : [{ version: currentVersion }] };
      return { rows: [], rowCount: 1 };
    }),
    release: vi.fn()
  };
  return {
    queries, client,
    pool: { connect: vi.fn().mockResolvedValue(client), end: vi.fn().mockResolvedValue(undefined) }
  };
};

describe('PostgreSQL eligibility final-decision atomicity', () => {
  it('reloads durable cases, action idempotency snapshots, and screening replays after restart', async () => {
    const snapshot = structuredClone(item);
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes('FROM eligibility_cases')) {
          return { rows: [{
            case_id: item.caseId, demo_beneficiary_id: item.demoBeneficiaryId,
            subject_ref_hash: item.subjectRefHash, ration_card_hash: item.rationCardHash,
            screening: item.screening, state: item.state, version: item.version, decision: item.decision,
            rcms_status: item.rcmsStatus, entitlement_blocked: item.entitlementBlocked,
            household_size: item.householdSize, monthly_rice_entitlement_kg: item.monthlyRiceEntitlementKg,
            already_lifted_kg: item.alreadyLiftedKg, proof_status: item.proofStatus,
            proof_event_id: item.proofEventId, updated_at: item.updatedAt
          }] };
        }
        if (text.includes('FROM eligibility_case_actions')) {
          return { rows: [{
            idempotency_key: 'DECISION-IDEMPOTENCY-003',
            request_hash: 'c'.repeat(64),
            case_snapshot: snapshot
          }] };
        }
        return { rows: [{
          screening_request_id: item.screening.screeningRequestId,
          request_hash: 'd'.repeat(64),
          response: { screening: item.screening, case: snapshot, entitlementPreserved: false }
        }] };
      }),
      release: vi.fn()
    };
    const repository = new EligibilityRepository({
      connect: vi.fn().mockResolvedValue(client), end: vi.fn()
    } as never);
    await expect(repository.loadState()).resolves.toMatchObject({
      cases: [{ caseId: item.caseId, history: item.history }],
      actions: [{ idempotencyKey: 'DECISION-IDEMPOTENCY-003', requestHash: 'c'.repeat(64) }],
      screenings: [{ screeningRequestId: item.screening.screeningRequestId, requestHash: 'd'.repeat(64) }]
    });
  });

  it('durably writes a non-final case action without creating a Fabric proof', async () => {
    const fake = fakePool({ currentVersion: 3 });
    const caseWithoutFinalDecision = structuredClone(item);
    delete caseWithoutFinalDecision.decision;
    delete caseWithoutFinalDecision.proofEventId;
    const reviewReady: EligibilityCase = {
      ...caseWithoutFinalDecision,
      state: 'REVIEW_READY' as const,
      version: 4,
      rcmsStatus: 'ACTIVE' as const,
      entitlementBlocked: false,
      proofStatus: 'NOT_REQUIRED' as const,
      history: [{
        actionId: 'VERIFY-003', action: 'VERIFICATION' as const, outcomeCode: 'CORROBORATED',
        reasonCode: 'FIELD_REVIEW', actorRef: 'department-officer-ref',
        occurredAt: '2026-07-23T00:30:00Z', priorState: 'OPEN' as const, newState: 'REVIEW_READY' as const
      }]
    };
    await new EligibilityRepository(fake.pool as never)
      .persistCaseAction(reviewReady, 'VERIFY-IDEMPOTENCY-003', 'c'.repeat(64));
    const sql = fake.queries.map((entry) => entry.text).join('\n');
    expect(sql).toContain('eligibility_cases');
    expect(sql).toContain('eligibility_case_actions');
    expect(sql).toContain('case_snapshot');
    expect(sql).not.toContain('ledger_outbox');
  });

  it('writes case, action, RCMS card, entitlement, ledger event, and outbox in one transaction', async () => {
    const fake = fakePool();
    await new EligibilityRepository(fake.pool as never).persistFinalDecision(item, 'DECISION-IDEMPOTENCY-003');
    const sql = fake.queries.map((entry) => entry.text).join('\n');
    expect(fake.queries[0]?.text).toBe('BEGIN');
    expect(fake.queries.at(-1)?.text).toBe('COMMIT');
    expect(sql).toContain('eligibility_cases');
    expect(sql).toContain('eligibility_case_actions');
    expect(sql).toContain('UPDATE ration_cards_mock');
    expect(sql).toContain('UPDATE monthly_entitlements');
    expect(sql).toContain('INSERT INTO ledger_events');
    expect(sql).toContain('INSERT INTO ledger_outbox');
    const serializedValues = JSON.stringify(fake.queries.flatMap((entry) => entry.values ?? []));
    expect(serializedValues).not.toContain('Meera');
    expect(serializedValues).not.toContain('RC-DEMO');
    expect(serializedValues).toContain('beneficiary-demo-003-hash');
  });

  it('rolls the entire unit back on failure', async () => {
    const fake = fakePool({ failOn: 'UPDATE monthly_entitlements' });
    await expect(new EligibilityRepository(fake.pool as never).persistFinalDecision(item, 'DECISION-IDEMPOTENCY-003'))
      .rejects.toThrow('injected database failure');
    expect(fake.queries.map((entry) => entry.text)).toContain('ROLLBACK');
    expect(fake.queries.map((entry) => entry.text)).not.toContain('COMMIT');
  });

  it('rejects a simultaneous stale decision under the locked optimistic version check', async () => {
    const fake = fakePool({ currentVersion: 99 });
    await expect(new EligibilityRepository(fake.pool as never).persistFinalDecision(item, 'DECISION-IDEMPOTENCY-003'))
      .rejects.toThrow(/changed concurrently/);
    expect(fake.queries.map((entry) => entry.text)).toContain('ROLLBACK');
  });
});
