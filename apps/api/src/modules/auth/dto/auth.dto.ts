import { IsEnum, IsString } from 'class-validator';
import { AuthMode, AuthResult } from '@pds/shared-types';

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

export { AuthMode, AuthResult };
