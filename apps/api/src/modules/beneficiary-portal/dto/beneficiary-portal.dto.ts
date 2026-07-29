import { IsString, Length } from 'class-validator';

/**
 * Simulated RCMS citizen login (J&K / Maharashtra pattern): the beneficiary
 * enters an Aadhaar number and receives an OTP on the Aadhaar-seeded mobile.
 *
 * This DTO only ever accepts the synthetic demo Aadhaar range (9999…).
 * Validation messages must never echo the submitted value.
 */
export class CitizenOtpRequestDto {
  /** Synthetic 12-digit demo Aadhaar number (must start with 9999). */
  @IsString()
  @Length(1, 32, { message: 'demoAadhaarNumber is required' })
  demoAadhaarNumber!: string;
}

export class CitizenOtpVerifyDto {
  @IsString()
  @Length(1, 64)
  challengeId!: string;

  @IsString()
  @Length(1, 12)
  otp!: string;
}

export class CitizenSurrenderDto {
  /** Must be the literal string SURRENDER — an explicit, typed confirmation. */
  @IsString()
  @Length(1, 32)
  confirmation!: string;
}
