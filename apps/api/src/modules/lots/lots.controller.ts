import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { LotCreateDto } from './dto/lot.dto.js';
import { Roles } from '../auth/roles.decorator.js';

@Plane('data')
@Controller()
export class LotsController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/lots')
  lots() {
    return this.ledger.listLots();
  }

  @Get('/lots/:lotId')
  lot(@Param('lotId') lotId: string) {
    return this.ledger.getLot(lotId);
  }

  @Post('/lots')
  @Roles('procurement')
  createLot(@Body() body: LotCreateDto) {
    return this.ledger.createCommodityLotPersisted(body);
  }

  @Get('/lots/:lotId/history')
  lotHistory(@Param('lotId') lotId: string) {
    return this.ledger.getLotHistory(lotId);
  }
}
