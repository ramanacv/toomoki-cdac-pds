import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import {
  BENEFICIARY_REMOVAL_REASONS,
  ELIGIBILITY_CHECKS,
  ELIGIBILITY_DECISIONS,
  type BeneficiaryRemovalReason
} from '@pds/shared-types';

export class RunEligibilityScreeningDto {
  @IsString() screeningRequestId!: string;
  @IsString() demoBeneficiaryId!: string;
  @IsArray() @IsIn(ELIGIBILITY_CHECKS, { each: true }) checks!: Array<(typeof ELIGIBILITY_CHECKS)[number]>;
}

export class EligibilityActionDto {
  @IsString() idempotencyKey!: string;
  @IsInt() @Min(1) expectedVersion!: number;
  @IsString() outcomeCode!: string;
  @IsString() reasonCode!: string;
  @IsOptional() @IsString() note?: string;
}

export class EligibilityDecisionDto extends EligibilityActionDto {
  @IsIn(ELIGIBILITY_DECISIONS) decision!: (typeof ELIGIBILITY_DECISIONS)[number];
}

export class EligibilityGateDto {
  @IsString() demoBeneficiaryId!: string;
  @IsOptional() @IsInt() @Min(1) requestedQtyKg = 1;
}

/** Officer bulk removal of beneficiaries confirmed fraudulent (or duplicates). */
export class BeneficiaryRemovalDto {
  @IsString() idempotencyKey!: string;
  @IsIn(BENEFICIARY_REMOVAL_REASONS) reasonCode!: BeneficiaryRemovalReason;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) demoBeneficiaryIds!: string[];
  @IsOptional() @IsString() note?: string;
}
