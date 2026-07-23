import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ELIGIBILITY_CHECKS, ELIGIBILITY_DECISIONS } from '@pds/shared-types';

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
