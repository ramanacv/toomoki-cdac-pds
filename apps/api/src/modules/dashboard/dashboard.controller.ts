import { Plane } from '../../infrastructure/plane.decorator.js';
import { Controller, Get, Inject } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';

@Plane('data')
@Controller()
export class DashboardController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/dashboard/summary')
  summary() {
    return this.ledger.getDashboardSummary();
  }
}
