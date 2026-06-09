import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min
} from 'class-validator';
import { AuthMode, AuthResult, StakeholderStatus, StakeholderType } from '@pds/shared-types';

export class StakeholderCreateDto {
  @IsString()
  stakeholderId!: string;

  @IsEnum(StakeholderType)
  stakeholderType!: StakeholderType;

  @IsString()
  name!: string;

  @IsString()
  district!: string;

  @IsString()
  licenseNo!: string;

  @IsEnum(StakeholderStatus)
  status!: StakeholderStatus;
}

export class LotCreateDto {
  @IsString()
  lotId!: string;

  @IsString()
  commodity!: string;

  @IsString()
  season!: string;

  @IsInt()
  @Min(1)
  quantityKg!: number;

  @IsString()
  qualityGrade!: string;

  @IsString()
  source!: string;

  @IsString()
  currentOwner!: string;

  @IsString()
  currentLocation!: string;
}

export class DispatchDto {
  @IsString()
  transferId!: string;

  @IsString()
  lotId!: string;

  @IsString()
  fromOrg!: string;

  @IsString()
  toOrg!: string;

  @IsInt()
  @Min(1)
  dispatchedQtyKg!: number;

  @IsString()
  vehicleNo!: string;

  @IsOptional()
  @IsISO8601()
  dispatchTimestamp?: string;
}

export class TransferReceiveDto {
  @IsInt()
  @Min(1)
  receivedQtyKg!: number;
}

export class AllocationDto {
  @IsString()
  allocationId!: string;

  @IsString()
  fpsId!: string;

  @IsString()
  commodity!: string;

  @IsInt()
  @Min(1)
  allocatedQtyKg!: number;

  @IsString()
  month!: string;

  @IsString()
  sourceGodownId!: string;
}

export class AuthOtpDto {
  @IsString()
  authTxnId!: string;

  @IsString()
  beneficiaryRefHash!: string;

  @IsString()
  rationCardHash!: string;

  @IsEnum(AuthResult)
  authResult!: AuthResult;
}

export class SupervisorExceptionAuthDto extends AuthOtpDto {
  @IsString()
  approvedBy!: string;
}

export class EntitlementValidateDto {
  @IsString()
  rationCardHash!: string;

  @IsString()
  commodity!: string;

  @IsString()
  month!: string;

  @IsInt()
  @Min(1)
  requestedQtyKg!: number;
}

export class DistributionDto {
  @IsString()
  distributionId!: string;

  @IsString()
  fpsId!: string;

  @IsString()
  rationCardHash!: string;

  @IsString()
  beneficiaryRefHash!: string;

  @IsString()
  commodity!: string;

  @IsInt()
  @Min(1)
  deliveredKg!: number;

  @IsEnum(AuthMode)
  authMode!: AuthMode;

  @IsEnum(AuthResult)
  authResult!: AuthResult;

  @IsString()
  authTxnRefHash!: string;

  @IsString()
  dealerId!: string;
}
