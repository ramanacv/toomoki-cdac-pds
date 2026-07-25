import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches } from 'class-validator';
import {
  BENEFICIARY_LIFECYCLE_EVENT_TYPES,
  BENEFICIARY_LIFECYCLE_SCHEMA_VERSION
} from '@pds/shared-types';

export class BeneficiaryLifecycleEventDto {
  @IsString() eventId!: string;
  @IsString() beneficiaryRefHash!: string;
  @IsString() rationCardHash!: string;
  @IsIn(BENEFICIARY_LIFECYCLE_EVENT_TYPES) eventType!: (typeof BENEFICIARY_LIFECYCLE_EVENT_TYPES)[number];
  @IsIn(['SMARTPDS_RCMS', 'FIELD_VERIFICATION', 'VIKSITPDS_DEMO'])
  sourceSystem!: 'SMARTPDS_RCMS' | 'FIELD_VERIFICATION' | 'VIKSITPDS_DEMO';
  @IsISO8601() occurredAt!: string;
  @IsISO8601() effectiveAt!: string;
  @IsString() reasonCode!: string;
  @IsString() policyId!: string;
  @Matches(/^[a-f0-9]{64}$/) evidenceDigest!: string;
  @IsOptional() @IsString() districtCode?: string;
  @IsOptional() @IsInt() householdSizeDelta?: number;
  @IsOptional() @IsIn(['ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'DEACTIVATED'])
  priorState?: 'ACTIVE' | 'UNDER_REVIEW' | 'SUSPENDED' | 'DEACTIVATED';
  @IsOptional() @IsIn(['ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'DEACTIVATED'])
  newState?: 'ACTIVE' | 'UNDER_REVIEW' | 'SUSPENDED' | 'DEACTIVATED';
  @IsOptional() @IsString() parentBeneficiaryRefHash?: string;
  @IsIn([BENEFICIARY_LIFECYCLE_SCHEMA_VERSION]) schemaVersion!: typeof BENEFICIARY_LIFECYCLE_SCHEMA_VERSION;
}
