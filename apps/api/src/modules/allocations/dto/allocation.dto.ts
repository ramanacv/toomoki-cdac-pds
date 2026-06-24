import { IsInt, IsString, Min } from 'class-validator';

export class AllocationDto {
  @IsString()
  allocationId!: string;

  @IsString()
  fpsId!: string;

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
