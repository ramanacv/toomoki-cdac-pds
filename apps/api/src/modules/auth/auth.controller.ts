import { Plane } from '../../infrastructure/plane.decorator.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req
} from '@nestjs/common';
import { AuthMode, AuthResult } from '@pds/shared-types';
import type { AuthTransaction } from '@pds/shared-types';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { AuthOtpDto, SupervisorExceptionAuthDto } from './dto/auth.dto.js';
import { Roles } from './roles.decorator.js';
import type { AuthenticatedRequest } from './identity-provider.js';
import { fpsAssignmentForRead, hideCrossShopResource, requireFpsAssignment } from './fps-scope.js';
import {
  authResultFromEposResponse,
  EposAuthClient,
  EposAuthDependencyError
} from './epos-auth-client.js';

@Plane('data')
@Controller()
@Roles('fps', 'department', 'auditor')
export class AuthController {
  constructor(
    @Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade,
    @Inject(EposAuthClient) private readonly eposAuth: EposAuthClient
  ) {}

  @Get('/auth/fps-assignment')
  @Roles('fps')
  async fpsAssignment(@Req() request?: AuthenticatedRequest) {
    return requireFpsAssignment(this.ledger, request);
  }

  @Get('/auth/transactions')
  async authTransactions(@Req() request?: AuthenticatedRequest) {
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    const transactions = (await Promise.resolve(this.ledger.listAuthTransactions())) as AuthTransaction[];
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
    return this.persistSimulatedAuth(body, AuthMode.MOCK_OTP, request);
  }

  @Post('/auth/simulated-biometric')
  @Roles('fps')
  async authBiometric(@Body() body: AuthOtpDto, @Req() request?: AuthenticatedRequest) {
    return this.persistSimulatedAuth(body, AuthMode.SIMULATED_BIOMETRIC, request);
  }

  @Post('/auth/supervisor-exception')
  @Roles('fps')
  async authException(@Body() body: SupervisorExceptionAuthDto, @Req() request?: AuthenticatedRequest) {
    return this.persistSimulatedAuth(
      { ...body, authResult: AuthResult.EXCEPTION_APPROVED },
      AuthMode.SUPERVISOR_EXCEPTION,
      request,
      body.approvedBy
    );
  }

  private async persistSimulatedAuth(
    body: AuthOtpDto,
    authMode: AuthMode,
    request?: AuthenticatedRequest,
    approvedBy?: string
  ) {
    const assignment = await requireFpsAssignment(this.ledger, request);
    const aadhaarRefHash = body.aadhaarRefHash ?? body.beneficiaryRefHash;
    if (/^\d{12}$/.test(aadhaarRefHash) || /^\d{12}$/.test(body.beneficiaryRefHash)) {
      throw new BadRequestException('Raw Aadhaar numbers are prohibited; use aadhaarRefHash / beneficiaryRefHash');
    }

    let authResult = body.authResult;
    try {
      const outcome = await this.eposAuth.authenticate(
        {
          authTxnId: body.authTxnId,
          aadhaarRefHash,
          beneficiaryRefHash: body.beneficiaryRefHash,
          rationCardHash: body.rationCardHash,
          fpsRef: assignment.fpsId,
          authMode,
          authResult: body.authResult,
          ...(approvedBy ? { approvedBy } : {})
        },
        body.authTxnId
      );
      authResult = authResultFromEposResponse(outcome);
    } catch (error) {
      if (error instanceof EposAuthDependencyError && error.kind === 'NOT_CONFIGURED') {
        // Local adapter never throws NOT_CONFIGURED; keep body.authResult.
      } else if (error instanceof EposAuthDependencyError) {
        throw new BadRequestException(error.message);
      } else {
        throw error;
      }
    }

    return this.ledger.simulateAuthenticationPersisted({
      ...body,
      ...assignment,
      authMode,
      authResult
    });
  }
}
