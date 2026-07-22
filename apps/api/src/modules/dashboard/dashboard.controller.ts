import { Plane } from '../../infrastructure/plane.decorator.js';
import { Controller, Get, Inject } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';

@Plane('data')
@Controller()
@Roles(...OPERATIONAL_ROLES)
export class DashboardController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/dashboard/summary')
  summary() {
    return this.ledger.getDashboardSummary();
  }
}
