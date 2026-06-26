import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { DispatchDto, TransferReceiveDto } from './dto/transfer.dto.js';

@Plane('data')
@Controller()
export class TransfersController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/transfers')
  transfers() {
    return this.ledger.listTransfers();
  }

  @Get('/transfers/:transferId')
  transfer(@Param('transferId') transferId: string) {
    return this.ledger.getTransfer(transferId);
  }

  @Post('/transfers')
  dispatch(@Body() body: DispatchDto) {
    return this.ledger.dispatchLot(body);
  }

  @Post('/transfers/:transferId/receive')
  receive(@Param('transferId') transferId: string, @Body() body: TransferReceiveDto) {
    return this.ledger.receiveLot({ transferId, receivedQtyKg: body.receivedQtyKg });
  }
}
