import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Plane } from '../../infrastructure/plane.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import { EligibilityService } from './eligibility.service.js';
import { EligibilityActionDto, EligibilityDecisionDto, EligibilityGateDto, RunEligibilityScreeningDto } from './dto/eligibility.dto.js';

@Plane('control')
@Controller('/eligibility/v1')
@Roles('department', 'auditor', 'management')
export class EligibilityController {
  constructor(@Inject(EligibilityService) private readonly service: EligibilityService) {}

  @Get('/summary') summary() { return this.service.summary(); }
  @Get('/cases') cases() { return this.service.listCases(); }
  @Get('/cases/:caseId') caseDetail(@Param('caseId') caseId: string) { return this.service.getCase(caseId); }

  @Post('/screenings')
  @Roles('department')
  screening(@Body() body: RunEligibilityScreeningDto, @Headers('x-correlation-id') correlationId?: string) {
    return this.service.runScreening(body, correlationId || randomUUID());
  }

  @Post('/cases/:caseId/notice')
  @Roles('department')
  notice(@Param('caseId') caseId: string, @Body() body: EligibilityActionDto, @Req() request: AuthenticatedRequest) {
    return this.service.notice(caseId, body, request.user?.subject ?? 'department');
  }

  @Post('/cases/:caseId/verification')
  @Roles('department')
  verification(@Param('caseId') caseId: string, @Body() body: EligibilityActionDto, @Req() request: AuthenticatedRequest) {
    return this.service.verification(caseId, body, request.user?.subject ?? 'department');
  }

  @Post('/cases/:caseId/recommendation')
  @Roles('department')
  recommendation(@Param('caseId') caseId: string, @Body() body: EligibilityActionDto, @Req() request: AuthenticatedRequest) {
    return this.service.recommendation(caseId, body, request.user?.subject ?? 'department');
  }

  @Post('/cases/:caseId/decision')
  @Roles('department')
  decision(@Param('caseId') caseId: string, @Body() body: EligibilityDecisionDto, @Req() request: AuthenticatedRequest) {
    return this.service.decision(caseId, body, request.user?.subject ?? 'department');
  }

  @Post('/cases/:caseId/appeals')
  @Roles('department')
  appeal(@Param('caseId') caseId: string, @Body() body: EligibilityActionDto, @Req() request: AuthenticatedRequest) {
    return this.service.appeal(caseId, body, request.user?.subject ?? 'department');
  }

  @Post('/cases/:caseId/reinstate')
  @Roles('department')
  reinstate(@Param('caseId') caseId: string, @Body() body: EligibilityActionDto, @Req() request: AuthenticatedRequest) {
    return this.service.reinstate(caseId, body, request.user?.subject ?? 'department');
  }

  @Post('/entitlement-gate')
  gate(@Body() body: EligibilityGateDto) { return this.service.gate(body.demoBeneficiaryId, body.requestedQtyKg); }

  @Post('/demo/reset')
  @HttpCode(200)
  @Roles('demo-reset')
  reset() {
    if (process.env.PDS_ALLOW_RESET?.toLowerCase() !== 'true') {
      throw new ForbiddenException('Eligibility demo reset is disabled');
    }
    return this.service.reset();
  }
}
