import { IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';

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

  @IsString()
  transporterId!: string;

  @IsString()
  vehicleNo!: string;

  @IsOptional()
  @IsISO8601()
  dispatchTimestamp?: string;
}
