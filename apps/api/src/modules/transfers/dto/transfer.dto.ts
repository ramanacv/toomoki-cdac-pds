import { IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';

export class DispatchDto {
  @IsString()
  transferId!: string;

  @IsString()
  lotId!: string;

  @IsString()
  fromOrg!: string;

  @IsString()
  toOrg!: string;

  @IsInt()
  @Min(1)
  dispatchedQtyKg!: number;

  @IsString()
  vehicleNo!: string;

  @IsOptional()
  @IsISO8601()
  dispatchTimestamp?: string;
}

export class TransferReceiveDto {
  @IsInt()
  @Min(1)
  receivedQtyKg!: number;
}
