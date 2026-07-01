import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Request body for `POST /audit-alerts/:alertId/resolve` (T5.3).
 */
export class ResolveAuditAlertDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'resolvedBy must not be blank' })
  @MaxLength(128)
  resolvedBy!: string;

  @IsString()
  @IsOptional()
  @MaxLength(1024)
  resolutionNote?: string;
}
