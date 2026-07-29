import { Body, Controller, Get, Headers, HttpCode, Inject, Ip, Post } from '@nestjs/common';
import { Plane } from '../../infrastructure/plane.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { BeneficiaryPortalService } from './beneficiary-portal.service.js';
import { CitizenOtpRequestDto, CitizenOtpVerifyDto, CitizenSurrenderDto } from './dto/beneficiary-portal.dto.js';

/**
 * Simulated RCMS citizen portal endpoints (see service for the boundary).
 *
 * These endpoints are @Public with respect to the operational Keycloak/OIDC
 * identity model because beneficiaries are not operational personas. Access
 * is instead gated by the portal's own simulated Aadhaar+OTP session, which
 * only ever resolves synthetic fixture identities.
 */
@Plane('data')
@Controller('/beneficiary-portal/v1')
@Public()
export class BeneficiaryPortalController {
  constructor(@Inject(BeneficiaryPortalService) private readonly portal: BeneficiaryPortalService) {}

  @Post('/login/request-otp')
  @HttpCode(200)
  requestOtp(@Body() body: CitizenOtpRequestDto, @Ip() requestIp?: string) {
    return this.portal.requestOtp(body.demoAadhaarNumber, requestIp);
  }

  @Post('/login/verify-otp')
  @HttpCode(200)
  verifyOtp(@Body() body: CitizenOtpVerifyDto) {
    return this.portal.verifyOtp(body.challengeId, body.otp);
  }

  @Get('/me')
  me(@Headers('x-citizen-session') sessionToken?: string) {
    return this.portal.profile(sessionToken);
  }

  @Get('/me/distributions')
  distributions(@Headers('x-citizen-session') sessionToken?: string) {
    return this.portal.distributions(sessionToken);
  }

  @Get('/me/auth-history')
  authHistory(@Headers('x-citizen-session') sessionToken?: string) {
    return this.portal.authHistory(sessionToken);
  }

  @Post('/me/surrender')
  @HttpCode(200)
  surrender(@Body() body: CitizenSurrenderDto, @Headers('x-citizen-session') sessionToken?: string) {
    return this.portal.surrender(sessionToken, body.confirmation);
  }

  @Post('/logout')
  @HttpCode(200)
  logout(@Headers('x-citizen-session') sessionToken?: string) {
    return this.portal.signOut(sessionToken);
  }
}
