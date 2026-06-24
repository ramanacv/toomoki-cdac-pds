import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { LotCreateDto } from './dto/lot.dto.js';

@Controller()
export class LotsController {
  constructor(private readonly ledger: PdsLedgerFacade) {}

  @Get('/lots')
  lots() {
    return this.ledger.listLots();
  }

  @Get('/lots/:lotId')
  lot(@Param('lotId') lotId: string) {
    return this.ledger.getLot(lotId);
  }

  @Post('/lots')
  createLot(@Body() body: LotCreateDto) {
    return this.ledger.createCommodityLot(body);
  }

  @Get('/lots/:lotId/history')
  lotHistory(@Param('lotId') lotId: string) {
    return this.ledger.getLotHistory(lotId);
  }
}
