import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { AuthMode, AuthResult } from '@pds/shared-types';
import type { AuthTransaction } from '@pds/shared-types';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { AuthOtpDto, SupervisorExceptionAuthDto } from './dto/auth.dto.js';
import { Roles } from './roles.decorator.js';
import type { AuthenticatedRequest } from './identity-provider.js';
import { fpsAssignmentForRead, hideCrossShopResource, requireFpsAssignment } from './fps-scope.js';

@Plane('data')
@Controller()
@Roles('fps', 'department', 'auditor')
export class AuthController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/auth/transactions')
  async authTransactions(@Req() request?: AuthenticatedRequest) {
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    const transactions = await Promise.resolve(this.ledger.listAuthTransactions()) as AuthTransaction[];
    return assignment ? transactions.filter((item) => item.fpsId === assignment.fpsId) : transactions;
  }

  @Get('/auth/transactions/:authTxnId')
  async authTransaction(@Param('authTxnId') authTxnId: string, @Req() request?: AuthenticatedRequest) {
    const transaction = await Promise.resolve(this.ledger.getAuthTransaction(authTxnId));
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    if (assignment && transaction.fpsId !== assignment.fpsId) hideCrossShopResource('Authentication transaction');
    return transaction;
  }

  @Post('/auth/mock-otp')
  @Roles('fps')
  async authOtp(@Body() body: AuthOtpDto, @Req() request?: AuthenticatedRequest) {
    const assignment = await requireFpsAssignment(this.ledger, request);
    return this.ledger.simulateAuthenticationPersisted({
      ...body,
      ...assignment,
      authMode: AuthMode.MOCK_OTP
    });
  }

  @Post('/auth/simulated-biometric')
  @Roles('fps')
  async authBiometric(@Body() body: AuthOtpDto, @Req() request?: AuthenticatedRequest) {
    const assignment = await requireFpsAssignment(this.ledger, request);
    return this.ledger.simulateAuthenticationPersisted({
      ...body,
      ...assignment,
      authMode: AuthMode.SIMULATED_BIOMETRIC
    });
  }

  @Post('/auth/supervisor-exception')
  @Roles('fps')
  async authException(@Body() body: SupervisorExceptionAuthDto, @Req() request?: AuthenticatedRequest) {
    const assignment = await requireFpsAssignment(this.ledger, request);
    return this.ledger.simulateAuthenticationPersisted({
      ...body,
      ...assignment,
      authMode: AuthMode.SUPERVISOR_EXCEPTION,
      authResult: AuthResult.EXCEPTION_APPROVED
    });
  }
}
