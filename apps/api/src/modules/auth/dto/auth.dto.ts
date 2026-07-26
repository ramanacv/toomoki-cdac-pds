import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthMode, AuthResult } from '@pds/shared-types';

export class AuthOtpDto {
  @IsString()
  authTxnId!: string;

  @IsString()
  beneficiaryRefHash!: string;

  @IsString()
  rationCardHash!: string;

  /** Opaque Aadhaar reference hash. Never a raw 12-digit Aadhaar number. */
  @IsOptional()
  @IsString()
  aadhaarRefHash?: string;

  @IsEnum(AuthResult)
  authResult!: AuthResult;
}

export class SupervisorExceptionAuthDto extends AuthOtpDto {
  @IsString()
  approvedBy!: string;
}

export { AuthMode, AuthResult };
