import { IsInt, IsString, Min } from 'class-validator';

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
