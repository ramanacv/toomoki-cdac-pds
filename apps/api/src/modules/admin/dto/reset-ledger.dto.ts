import { IsOptional, IsString } from 'class-validator';

export class ResetLedgerDto {
  @IsOptional()
  @IsString()
  commodity?: string;
}
