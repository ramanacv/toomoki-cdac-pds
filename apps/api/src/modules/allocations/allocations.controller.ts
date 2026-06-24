import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { TransferReceiveDto } from '../transfers/dto/transfer.dto.js';
import { AllocationDto } from './dto/allocation.dto.js';

@Controller()
export class AllocationsController {
  constructor(private readonly ledger: PdsLedgerFacade) {}

  @Get('/fps-allocations')
  allocations() {
    return this.ledger.listAllocations();
  }

  @Get('/fps-allocations/:allocationId')
  allocation(@Param('allocationId') allocationId: string) {
    return this.ledger.getAllocation(allocationId);
  }

  @Post('/fps-allocations')
  allocate(@Body() body: AllocationDto) {
    return this.ledger.allocateToFps(body);
  }

  @Post('/fps-allocations/:allocationId/receipt')
  fpsReceipt(@Param('allocationId') allocationId: string, @Body() body: TransferReceiveDto) {
    return this.ledger.recordFpsReceipt({ allocationId, receivedQtyKg: body.receivedQtyKg });
  }
}
