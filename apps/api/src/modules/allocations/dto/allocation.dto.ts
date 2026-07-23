import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AllocationDto {
  @IsString()
  allocationId!: string;

  @IsOptional()
  @IsString()
  fpsId?: string;

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
