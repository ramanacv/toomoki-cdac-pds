import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { DistributionDto } from './dto/distribution.dto.js';

@Plane('data')
@Controller()
export class DistributionsController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/distributions')
  distributions() {
    return this.ledger.listDistributions();
  }

  @Post('/distributions')
  distribute(@Body() body: DistributionDto) {
    return this.ledger.recordDistribution(body);
  }

  @Get('/distributions/:distributionId')
  distribution(@Param('distributionId') distributionId: string) {
    return this.ledger.getDistributionReceipt(distributionId);
  }
}
