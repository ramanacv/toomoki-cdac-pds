import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { StakeholderCreateDto } from './dto/stakeholder.dto.js';

@Controller()
export class StakeholdersController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/stakeholders')
  stakeholders() {
    return this.ledger.listStakeholders();
  }

  @Post('/stakeholders')
  registerStakeholder(@Body() body: StakeholderCreateDto) {
    return this.ledger.registerStakeholder(body);
  }
}
