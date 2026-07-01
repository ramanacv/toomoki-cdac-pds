import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';

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

  @IsOptional()
  @IsIn(['I', 'II'])
  stage?: 'I' | 'II';

  @IsOptional()
  @IsString()
  roRef?: string;

  @IsOptional()
  @IsString()
  authorizedBy?: string;

  @IsOptional()
  @IsString()
  transporterId?: string;

  @IsOptional()
  @IsString()
  transformedFromLotId?: string;
}

export class TransferReceiveDto {
  @IsInt()
  @Min(1)
  receivedQtyKg!: number;
}

export class TransferAuthorizeDto {
  @IsString()
  authorizedBy!: string;

  @IsOptional()
  @IsISO8601()
  authorizedAt?: string;

  @IsOptional()
  @IsString()
  roRef?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
