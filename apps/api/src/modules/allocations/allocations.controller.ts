import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { TransferReceiveDto } from '../transfers/dto/transfer.dto.js';
import { AllocationDto } from './dto/allocation.dto.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import {
  fpsAssignmentForRead,
  hideCrossShopResource,
  requireFpsAssignment
} from '../auth/fps-scope.js';

@Plane('data')
@Controller()
@Roles(...OPERATIONAL_ROLES)
export class AllocationsController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/fps-allocations')
  async allocations(@Req() request?: AuthenticatedRequest) {
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    const allocations = await Promise.resolve(this.ledger.listAllocations());
    return assignment ? allocations.filter((item: { fpsId: string }) => item.fpsId === assignment.fpsId) : allocations;
  }

  @Get('/fps-allocations/:allocationId')
  async allocation(@Param('allocationId') allocationId: string, @Req() request?: AuthenticatedRequest) {
    const allocation = await Promise.resolve(this.ledger.getAllocation(allocationId));
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    if (assignment && allocation.fpsId !== assignment.fpsId) hideCrossShopResource('Allocation');
    return allocation;
  }

  @Post('/fps-allocations')
  @Roles('department', 'block-office')
  allocate(@Body() body: AllocationDto) {
    return this.ledger.allocateToFpsPersisted(body as Required<AllocationDto>);
  }

  @Post('/fps-allocations/:allocationId/receipt')
  @Roles('fps')
  async fpsReceipt(
    @Param('allocationId') allocationId: string,
    @Body() body: TransferReceiveDto,
    @Req() request?: AuthenticatedRequest
  ) {
    const assignment = await requireFpsAssignment(this.ledger, request);
    const allocation = await Promise.resolve(this.ledger.getAllocation(allocationId));
    if (allocation.fpsId !== assignment.fpsId) hideCrossShopResource('Allocation');
    return this.ledger.recordFpsReceiptPersisted({ allocationId, receivedQtyKg: body.receivedQtyKg });
  }
}
