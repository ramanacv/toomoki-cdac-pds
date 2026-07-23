export const BENEFICIARY_LIFECYCLE_SCHEMA_VERSION = '1.0' as const;

export const BENEFICIARY_LIFECYCLE_EVENT_TYPES = [
  'BENEFICIARY_CREATED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'HOUSEHOLD_BIFURCATED',
  'MIGRATION_RECORDED',
  'CARD_TRANSFERRED',
  'VERIFICATION_COMPLETED',
  'STATUS_CHANGED',
  'RECORD_DEACTIVATED'
] as const;
export type BeneficiaryLifecycleEventType = (typeof BENEFICIARY_LIFECYCLE_EVENT_TYPES)[number];

export type BeneficiaryRegistryState = 'ACTIVE' | 'UNDER_REVIEW' | 'SUSPENDED' | 'DEACTIVATED';

export type BeneficiaryLifecycleEvent = {
  eventId: string;
  beneficiaryRefHash: string;
  rationCardHash: string;
  eventType: BeneficiaryLifecycleEventType;
  sourceSystem: 'SMARTPDS_RCMS' | 'FIELD_VERIFICATION' | 'VIKSITPDS_DEMO';
  occurredAt: string;
  effectiveAt: string;
  reasonCode: string;
  policyId: string;
  evidenceDigest: string;
  districtCode?: string;
  householdSizeDelta?: number;
  priorState?: BeneficiaryRegistryState;
  newState?: BeneficiaryRegistryState;
  parentBeneficiaryRefHash?: string;
  schemaVersion: typeof BENEFICIARY_LIFECYCLE_SCHEMA_VERSION;
};

export type BeneficiaryRegistryProjection = {
  beneficiaryRefHash: string;
  rationCardHash: string;
  districtCode: string;
  householdSize: number;
  state: BeneficiaryRegistryState;
  version: number;
  lastEventId: string;
  updatedAt: string;
  proofStatus: 'PENDING' | 'COMMITTED' | 'FAILED' | 'DEAD_LETTER';
};

export type BeneficiaryLifecycleEventResult = {
  disposition: 'NEW' | 'REPLAY';
  event: BeneficiaryLifecycleEvent;
  projection: BeneficiaryRegistryProjection;
  proofEventId: string;
};

export type BeneficiaryRegistrySummary = {
  activeRecords: number;
  activeHouseholdMembers: number;
  lifecycleEvents: number;
  pendingProofs: number;
  byEventType: Partial<Record<BeneficiaryLifecycleEventType, number>>;
  projections: BeneficiaryRegistryProjection[];
};
