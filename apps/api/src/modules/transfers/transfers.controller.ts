import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { DispatchDto, TransferAuthorizeDto, TransferReceiveDto } from './dto/transfer.dto.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';

@Plane('data')
@Controller()
@Roles(...OPERATIONAL_ROLES)
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

  @Get('/ledger-events')
  ledgerEvents() {
    return this.ledger.listLedgerEvents();
  }

  @Post('/transfers')
  @Roles('procurement', 'fci', 'godown')
  dispatch(@Body() body: DispatchDto) {
    return this.ledger.dispatchLotPersisted(body);
  }

  @Post('/transfers/:transferId/receive')
  @Roles('fci', 'godown')
  receive(@Param('transferId') transferId: string, @Body() body: TransferReceiveDto) {
    return this.ledger.receiveLotPersisted({ transferId, receivedQtyKg: body.receivedQtyKg });
  }

  @Post('/transfers/:transferId/authorize')
  @Roles('department')
  authorize(@Param('transferId') transferId: string, @Body() body: TransferAuthorizeDto) {
    return this.ledger.authorizeMovementPersisted({ transferId, ...body });
  }
}
