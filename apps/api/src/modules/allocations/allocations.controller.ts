import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { TransferReceiveDto } from '../transfers/dto/transfer.dto.js';
import { AllocationDto } from './dto/allocation.dto.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';

@Plane('data')
@Controller()
@Roles(...OPERATIONAL_ROLES)
export class AllocationsController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/fps-allocations')
  allocations() {
    return this.ledger.listAllocations();
  }

  @Get('/fps-allocations/:allocationId')
  allocation(@Param('allocationId') allocationId: string) {
    return this.ledger.getAllocation(allocationId);
  }

  @Post('/fps-allocations')
  @Roles('department', 'godown')
  allocate(@Body() body: AllocationDto) {
    return this.ledger.allocateToFpsPersisted(body);
  }

  @Post('/fps-allocations/:allocationId/receipt')
  @Roles('fps')
  fpsReceipt(@Param('allocationId') allocationId: string, @Body() body: TransferReceiveDto) {
    return this.ledger.recordFpsReceiptPersisted({ allocationId, receivedQtyKg: body.receivedQtyKg });
  }
}
