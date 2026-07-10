import { IsBoolean, IsInt, IsString, Min } from 'class-validator';

export class EntitlementCreateDto {
  @IsString()
  rationCardHash!: string;

  @IsString()
  commodity!: string;

  @IsString()
  month!: string;

  @IsInt()
  @Min(1)
  monthlyEntitlementKg!: number;

  @IsInt()
  @Min(0)
  alreadyLiftedKg!: number;

  @IsInt()
  @Min(0)
  availableBalanceKg!: number;

  @IsBoolean()
  active!: boolean;
}

export class EntitlementValidateDto {
  @IsString()
  rationCardHash!: string;

  @IsString()
  commodity!: string;

  @IsString()
  month!: string;

  @IsInt()
  @Min(1)
  requestedQtyKg!: number;
}
