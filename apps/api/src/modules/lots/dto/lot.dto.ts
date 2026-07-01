import { IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';

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

export class LotTransformDto {
  @IsString()
  parentLotId!: string;

  @IsString()
  childLotId!: string;

  @IsString()
  transformedBy!: string;

  @IsString()
  commodity!: string;

  @IsOptional()
  @IsString()
  season?: string;

  @IsInt()
  @Min(1)
  quantityKg!: number;

  @IsString()
  qualityGrade!: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsISO8601()
  transformedAt?: string;
}
