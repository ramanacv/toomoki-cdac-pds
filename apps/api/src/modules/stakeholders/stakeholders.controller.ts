import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { StakeholderCreateDto } from './dto/stakeholder.dto.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';

@Plane('control')
@Controller()
@Roles(...OPERATIONAL_ROLES)
export class StakeholdersController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/stakeholders')
  stakeholders() {
    return this.ledger.listStakeholders();
  }

  @Post('/stakeholders')
  @Roles('department')
  registerStakeholder(@Body() body: StakeholderCreateDto) {
    return this.ledger.registerStakeholderPersisted(body);
  }
}
