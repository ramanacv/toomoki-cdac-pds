import { IsInt, IsString, Min } from 'class-validator';

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
