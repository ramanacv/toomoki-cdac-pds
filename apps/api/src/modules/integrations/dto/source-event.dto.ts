import { IsEnum, IsISO8601, IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { CanonicalSourceEventType, SourceSystem } from '@pds/shared-types';

export class SourceEventEnvelopeDto {
  @IsEnum(SourceSystem)
  sourceSystem!: SourceSystem;

  @IsString()
  @MinLength(1)
  sourceEventId!: string;

  @IsEnum(CanonicalSourceEventType)
  eventType!: CanonicalSourceEventType;

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
  schemaVersion!: string;

  @IsISO8601()
  occurredAt!: string;

  @IsOptional()
  @IsISO8601()
  deviceSyncAt?: string;

  @IsOptional()
  @IsString()
  parentSourceEventId?: string;

  @IsOptional()
  @IsString()
  amendmentOfSourceEventId?: string;

  @IsOptional()
  @IsString()
  reversalOfSourceEventId?: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
