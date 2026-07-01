import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AuthMode, AuthResult } from '@pds/shared-types';

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

  @IsOptional()
  @IsString()
  approvedBy?: string;

  @IsOptional()
  @IsString()
  exceptionReason?: string;
}
