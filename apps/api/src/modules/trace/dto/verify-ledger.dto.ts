import { IsHexadecimal, IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * Request body for `POST /trace/verify` (T5.3). `digest` is the SHA-256 hex
 * digest of the database snapshot being verified against the chain ledger.
 */
export class VerifyLedgerDto {
  @IsString()
  @IsNotEmpty()
  @IsHexadecimal()
  @Length(8, 128)
  digest!: string;
}
