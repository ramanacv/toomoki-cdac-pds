import type {
  EligibilityScoreBreakdownEntry,
  EligibilityScreeningStatus,
  EligibilitySignal
} from '@pds/shared-types';

type WeightedRule = {
  ruleId: string;
  match: (signal: EligibilitySignal) => boolean;
  weight: number;
  rationaleCode: string;
};

/** Deterministic fixture weights — not ML. Higher score ⇒ stronger review pressure. */
const RULES: WeightedRule[] = [
  {
    ruleId: 'SCORE-DEATH-HIGH',
    match: (signal) => signal.source === 'DEATH_REGISTRY' && signal.status === 'MATCH' && signal.risk === 'HIGH',
    weight: 40,
    rationaleCode: 'DEATH_REGISTRY_MATCH_HIGH'
  },
  {
    ruleId: 'SCORE-INACTIVE-MEDIUM',
    match: (signal) =>
      signal.source === 'AEPDS_ONORC' && signal.factCode.includes('NO_RECENT_ACTIVITY') && signal.risk !== 'LOW',
    weight: 15,
    rationaleCode: 'INACTIVITY_SIGNAL'
  },
  {
    ruleId: 'SCORE-ECON-HIGH',
    match: (signal) =>
      (signal.source === 'INCOME_TAX' || signal.source === 'GST_TURNOVER' || signal.source === 'EMPLOYMENT')
      && signal.status === 'MATCH'
      && signal.risk === 'HIGH',
    weight: 25,
    rationaleCode: 'ECONOMIC_BAND_MATCH'
  },
  {
    ruleId: 'SCORE-LAND-MEDIUM',
    match: (signal) => signal.source === 'LAND_RECORDS' && (signal.status === 'MATCH' || signal.status === 'STALE'),
    weight: 20,
    rationaleCode: 'LAND_REVIEW_SIGNAL'
  },
  {
    ruleId: 'SCORE-LINKAGE-COLLISION',
    match: (signal) =>
      signal.source === 'REGISTRY_LINKAGE'
      && Boolean(signal.linkageDigest)
      && (signal.status === 'MATCH' || signal.status === 'CONFLICT'),
    weight: 35,
    rationaleCode: 'LINKAGE_DIGEST_COLLISION'
  },
  {
    ruleId: 'SCORE-PORTABILITY-CLEAR',
    match: (signal) =>
      signal.source === 'AEPDS_ONORC'
      && signal.status === 'MATCH'
      && signal.risk === 'LOW'
      && (signal.factCode.includes('PORTABILITY') || signal.factCode.includes('CURRENT_ACTIVITY')),
    weight: -30,
    rationaleCode: 'PORTABILITY_CLEARS_INACTIVITY'
  },
  {
    ruleId: 'SCORE-MULTI-CONFLICT',
    match: (signal) => signal.status === 'CONFLICT',
    weight: 20,
    rationaleCode: 'SOURCE_CONFLICT'
  }
];

export type IntegrityScoreResult = {
  integrityScore: number;
  scoreBreakdown: EligibilityScoreBreakdownEntry[];
};

export const scoreSignals = (signals: EligibilitySignal[]): IntegrityScoreResult => {
  const scoreBreakdown: EligibilityScoreBreakdownEntry[] = [];
  let raw = 0;
  for (const signal of signals) {
    for (const rule of RULES) {
      if (!rule.match(signal)) continue;
      scoreBreakdown.push({
        ruleId: rule.ruleId,
        signalFactCode: signal.factCode,
        weight: rule.weight,
        contribution: rule.weight,
        rationaleCode: rule.rationaleCode
      });
      raw += rule.weight;
    }
  }
  const integrityScore = Math.max(0, Math.min(100, raw));
  return { integrityScore, scoreBreakdown };
};

/** Keep categorical statuses for API compatibility; score is explainability only. */
export const statusForScenario = (
  configured: EligibilityScreeningStatus,
  integrityScore: number
): EligibilityScreeningStatus => {
  if (configured !== 'CLEAR') return configured;
  if (integrityScore >= 35) return 'MULTI_SOURCE_CONFLICT';
  return 'CLEAR';
};
