import { createHash } from 'node:crypto';
import {
  ELIGIBILITY_POLICY_ID,
  JK_ELIGIBILITY_POLICY_ID,
  type EligibilityScreeningResponse,
  type EligibilityScreeningStatus,
  type EligibilitySignal,
  validateEligibilityScreeningRequest
} from '@pds/shared-types';
import { scoreSignals, statusForScenario } from './scoring.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value, Object.keys(value as object).sort());

/** Shared opaque linkage digest for deterministic duplicate-collision fixtures (not Aadhaar). */
export const DUPLICATE_LINKAGE_DIGEST = sha256('viksitpds-demo-duplicate-linkage-v1');

type Scenario = {
  status: EligibilityScreeningStatus;
  action: string;
  ruleIds: string[];
  signals: EligibilitySignal[];
  policyId?: typeof ELIGIBILITY_POLICY_ID | typeof JK_ELIGIBILITY_POLICY_ID;
};

const observedAt = '2026-07-23T06:30:00.000Z';
const signal = (
  source: EligibilitySignal['source'],
  status: EligibilitySignal['status'],
  risk: EligibilitySignal['risk'],
  factCode: string,
  linkageDigest?: string
): EligibilitySignal => ({
  source,
  status,
  risk,
  observedAt,
  factCode,
  ...(linkageDigest ? { linkageDigest } : {})
});

const scenarios: Record<string, Scenario> = {
  'BEN-DEMO-INACTIVE': {
    status: 'INACTIVITY_REVIEW',
    action: 'CHECK_PORTABILITY_BEFORE_FIELD_REVIEW',
    ruleIds: ['INACTIVE-12M-01'],
    signals: [signal('AEPDS_ONORC', 'MATCH', 'MEDIUM', 'NO_RECENT_ACTIVITY_OBSERVED'), signal('RCMS', 'CLEAR', 'LOW', 'CARD_ACTIVE')]
  },
  'BEN-DEMO-001': {
    status: 'DEATH_MATCH_REVIEW',
    action: 'VERIFY_MEMBER_AND_RECALCULATE_HOUSEHOLD',
    ruleIds: ['DEATH-MEMBER-01'],
    signals: [signal('DEATH_REGISTRY', 'MATCH', 'HIGH', 'ONE_MEMBER_POSSIBLE_MATCH'), signal('RCMS', 'CLEAR', 'LOW', 'HOUSEHOLD_ACTIVE')]
  },
  'BEN-DEMO-002': {
    status: 'PORTABILITY_ACTIVITY_FOUND',
    action: 'CLEAR_INACTIVITY_SUSPICION',
    ruleIds: ['INACTIVE-ONORC-01'],
    signals: [signal('AEPDS_ONORC', 'MATCH', 'LOW', 'PORTABILITY_ACTIVITY_CURRENT'), signal('RCMS', 'CLEAR', 'LOW', 'CARD_ACTIVE')]
  },
  'BEN-DEMO-003': {
    status: 'ECONOMIC_ELIGIBILITY_REVIEW',
    action: 'ISSUE_NOTICE_AND_REVIEW_CORROBORATED_BANDS',
    ruleIds: ['ECON-ITR-GST-01'],
    signals: [signal('INCOME_TAX', 'MATCH', 'HIGH', 'ABOVE_DEMO_POLICY_BAND'), signal('GST_TURNOVER', 'MATCH', 'HIGH', 'CORROBORATED_TURNOVER_BAND')]
  },
  'BEN-DEMO-004': {
    status: 'LANDHOLDING_REVIEW',
    action: 'FIELD_VERIFY_SOURCE_FRESHNESS',
    ruleIds: ['LAND-FRESHNESS-01'],
    signals: [signal('LAND_RECORDS', 'STALE', 'MEDIUM', 'OWNERSHIP_SNAPSHOT_REQUIRES_REVIEW'), signal('RCMS', 'CLEAR', 'LOW', 'CARD_ACTIVE')]
  },
  'BEN-DEMO-005': {
    status: 'MULTI_SOURCE_CONFLICT',
    action: 'RECONCILE_SOURCES_AND_ALLOW_APPEAL',
    ruleIds: ['MULTI-CONFLICT-01'],
    signals: [signal('EMPLOYMENT', 'MATCH', 'HIGH', 'FORMAL_EMPLOYMENT_BAND'), signal('AEPDS_ONORC', 'CONFLICT', 'MEDIUM', 'ACTIVE_LIFT_CONTRADICTS_SOURCE')]
  },
  'BEN-JK-DEMO-001': {
    status: 'DUPLICATE_RECORD_REVIEW',
    action: 'VERIFY_CROSS_REGISTRY_LINKAGE_WITHOUT_AUTOMATIC_DEACTIVATION',
    ruleIds: ['JK-DUPLICATE-LINK-01'],
    signals: [
      signal('REGISTRY_LINKAGE', 'MATCH', 'HIGH', 'TWO_ACTIVE_REGISTRY_REFERENCES', DUPLICATE_LINKAGE_DIGEST),
      signal('RCMS', 'CONFLICT', 'MEDIUM', 'ACTIVE_CARD_LINKAGE_REQUIRES_REVIEW')
    ],
    policyId: JK_ELIGIBILITY_POLICY_ID
  },
  /** Second card sharing the same linkageDigest — hash-collision duplicate narrative, not Aadhaar match. */
  'BEN-JK-DEMO-001B': {
    status: 'DUPLICATE_RECORD_REVIEW',
    action: 'VERIFY_CROSS_REGISTRY_LINKAGE_WITHOUT_AUTOMATIC_DEACTIVATION',
    ruleIds: ['JK-DUPLICATE-LINK-01'],
    signals: [
      signal('REGISTRY_LINKAGE', 'MATCH', 'HIGH', 'TWO_ACTIVE_REGISTRY_REFERENCES', DUPLICATE_LINKAGE_DIGEST),
      signal('RCMS', 'CONFLICT', 'MEDIUM', 'ACTIVE_CARD_LINKAGE_REQUIRES_REVIEW')
    ],
    policyId: JK_ELIGIBILITY_POLICY_ID
  },
  'BEN-JK-DEMO-002': {
    status: 'DEATH_MATCH_REVIEW',
    action: 'REMOTE_FIELD_VERIFY_MEMBER',
    ruleIds: ['JK-DEATH-MEMBER-01'],
    signals: [signal('DEATH_REGISTRY', 'MATCH', 'HIGH', 'ONE_MEMBER_POSSIBLE_MATCH'), signal('RCMS', 'CLEAR', 'LOW', 'HOUSEHOLD_ACTIVE')],
    policyId: JK_ELIGIBILITY_POLICY_ID
  },
  'BEN-JK-DEMO-003': {
    status: 'PORTABILITY_ACTIVITY_FOUND',
    action: 'RECORD_MIGRATION_AND_PRESERVE_ENTITLEMENT',
    ruleIds: ['JK-ONORC-MIGRATION-01'],
    signals: [signal('AEPDS_ONORC', 'MATCH', 'LOW', 'INTER_DISTRICT_PORTABILITY_ACTIVITY'), signal('RCMS', 'CLEAR', 'LOW', 'CARD_ACTIVE')],
    policyId: JK_ELIGIBILITY_POLICY_ID
  },
  'BEN-JK-DEMO-004': {
    status: 'MULTI_SOURCE_CONFLICT',
    action: 'AWAIT_DELAYED_FIELD_EVIDENCE',
    ruleIds: ['JK-REMOTE-EVIDENCE-01'],
    signals: [signal('RCMS', 'CONFLICT', 'MEDIUM', 'HOUSEHOLD_SPLIT_PENDING'), signal('AEPDS_ONORC', 'MATCH', 'LOW', 'CURRENT_ACTIVITY_FOUND')],
    policyId: JK_ELIGIBILITY_POLICY_ID
  }
};

export class ScreeningConflictError extends Error {}

export class EligibilityScreeningEngine {
  private readonly responses = new Map<string, { fingerprint: string; response: EligibilityScreeningResponse }>();

  screen(raw: unknown): EligibilityScreeningResponse {
    const request = validateEligibilityScreeningRequest(raw);
    const fingerprint = sha256(canonical(request));
    const previous = this.responses.get(request.screeningRequestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ScreeningConflictError('screeningRequestId was reused with different content');
      return previous.response;
    }
    const scenario = scenarios[request.demoBeneficiaryId] ?? {
      status: 'CLEAR' as const,
      action: 'NO_REVIEW_REQUIRED',
      ruleIds: ['DEFAULT-CLEAR-01'],
      signals: [signal('RCMS', 'CLEAR', 'LOW', 'NO_DEMO_RISK_SIGNAL')]
    };
    const policyId = scenario.policyId ?? ELIGIBILITY_POLICY_ID;
    const { integrityScore, scoreBreakdown } = scoreSignals(scenario.signals);
    const status = statusForScenario(scenario.status, integrityScore);
    const evidenceDigest = sha256(canonical({
      request,
      signals: scenario.signals,
      policyId,
      integrityScore,
      scoreBreakdown
    }));
    const base = {
      screeningId: `ELIG-${sha256(request.screeningRequestId).slice(0, 16).toUpperCase()}`,
      screeningRequestId: request.screeningRequestId,
      status,
      signals: scenario.signals,
      recommendedReviewAction: scenario.action,
      policy: { policyId, simulationOnly: true as const, ruleIds: scenario.ruleIds },
      assessedAt: '2026-07-23T06:30:00.000Z',
      expiresAt: '2099-12-31T23:59:59.000Z',
      evidenceDigest,
      integrityScore,
      scoreBreakdown,
      schemaVersion: '1.0' as const
    };
    const response: EligibilityScreeningResponse = {
      ...base,
      responseAttestationHash: sha256(canonical(base))
    };
    this.responses.set(request.screeningRequestId, { fingerprint, response });
    return response;
  }
}
