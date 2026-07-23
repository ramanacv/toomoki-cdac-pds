import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import type { DistributionTransaction } from '@pds/shared-types';
import { DistributionDto } from './dto/distribution.dto.js';
import { Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import {
  assertCompatibleFpsIdentity,
  fpsAssignmentForRead,
  hideCrossShopResource,
  requireFpsAssignment
} from '../auth/fps-scope.js';

@Plane('data')
@Controller()
@Roles('fps', 'department', 'auditor', 'management')
export class DistributionsController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/distributions')
  async distributions(@Req() request?: AuthenticatedRequest) {
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    const distributions = await Promise.resolve(this.ledger.listDistributions()) as DistributionTransaction[];
    return assignment ? distributions.filter((item) => item.fpsId === assignment.fpsId) : distributions;
  }

  @Post('/distributions')
  @Roles('fps')
  async distribute(@Body() body: DistributionDto, @Req() request?: AuthenticatedRequest) {
    const assignment = await requireFpsAssignment(this.ledger, request);
    assertCompatibleFpsIdentity(assignment, body);
    return this.ledger.recordDistributionPersisted({
      ...body,
      fpsId: assignment.fpsId,
      dealerId: assignment.operatorRef
    });
  }

  @Get('/distributions/:distributionId')
  async distribution(@Param('distributionId') distributionId: string, @Req() request?: AuthenticatedRequest) {
    const distribution = await Promise.resolve(this.ledger.getDistributionReceipt(distributionId));
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    if (assignment && distribution.fpsId !== assignment.fpsId) hideCrossShopResource('Distribution');
    return distribution;
  }
}
