import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { VerifyLedgerDto } from './dto/verify-ledger.dto.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import { fpsAssignmentForRead, hideCrossShopResource } from '../auth/fps-scope.js';

@Plane('data')
@Controller()
@Roles(...OPERATIONAL_ROLES)
export class TraceController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/trace/lots/:lotId')
  lotTrace(@Param('lotId') lotId: string) {
    return this.ledger.getTraceForLotFromChain(lotId);
  }

  @Get('/trace/distributions/:distributionId')
  async distributionTrace(
    @Param('distributionId') distributionId: string,
    @Req() request?: AuthenticatedRequest
  ) {
    const distribution = await Promise.resolve(this.ledger.getDistributionReceipt(distributionId));
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    if (assignment && distribution.fpsId !== assignment.fpsId) hideCrossShopResource('Distribution');
    return {
      distribution,
      history: await this.ledger.getDistributionHistoryFromChainAsync(distributionId)
    };
  }

  @Post('/trace/verify')
  verifyLedger(@Body() body: VerifyLedgerDto) {
    return this.ledger.verifyLedgerDigest(body.digest);
  }
}
