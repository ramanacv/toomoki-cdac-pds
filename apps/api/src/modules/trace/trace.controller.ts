import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { VerifyLedgerDto } from './dto/verify-ledger.dto.js';

@Plane('data')
@Controller()
export class TraceController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/trace/lots/:lotId')
  lotTrace(@Param('lotId') lotId: string) {
    return this.ledger.getTraceForLot(lotId);
  }

  @Get('/trace/distributions/:distributionId')
  distributionTrace(@Param('distributionId') distributionId: string) {
    return {
      distribution: this.ledger.getDistributionReceipt(distributionId),
      history: this.ledger.getDistributionHistoryFromChain(distributionId)
    };
  }

  @Post('/trace/verify')
  verifyLedger(@Body() body: VerifyLedgerDto) {
    return this.ledger.verifyLedgerDigest(body.digest);
  }
}
