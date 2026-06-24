import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';

@Controller()
export class TraceController {
  constructor(private readonly ledger: PdsLedgerFacade) {}

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
  verifyLedger(@Body() body: { digest: string }) {
    return this.ledger.verifyLedgerDigest(body.digest);
  }
}
