import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { AuthMode, AuthResult } from '@pds/shared-types';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { AuthOtpDto, SupervisorExceptionAuthDto } from './dto/auth.dto.js';

@Plane('data')
@Controller()
export class AuthController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/auth/transactions')
  authTransactions() {
    return this.ledger.listAuthTransactions();
  }

  @Get('/auth/transactions/:authTxnId')
  authTransaction(@Param('authTxnId') authTxnId: string) {
    return this.ledger.getAuthTransaction(authTxnId);
  }

  @Post('/auth/mock-otp')
  authOtp(@Body() body: AuthOtpDto) {
    return this.ledger.simulateAuthentication({
      ...body,
      authMode: AuthMode.MOCK_OTP
    });
  }

  @Post('/auth/simulated-biometric')
  authBiometric(@Body() body: AuthOtpDto) {
    return this.ledger.simulateAuthentication({
      ...body,
      authMode: AuthMode.SIMULATED_BIOMETRIC
    });
  }

  @Post('/auth/supervisor-exception')
  authException(@Body() body: SupervisorExceptionAuthDto) {
    return this.ledger.simulateAuthentication({
      ...body,
      authMode: AuthMode.SUPERVISOR_EXCEPTION,
      authResult: AuthResult.EXCEPTION_APPROVED
    });
  }
}
