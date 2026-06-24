import { Controller, Get } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';

@Controller()
export class DashboardController {
  constructor(private readonly ledger: PdsLedgerFacade) {}

  @Get('/dashboard/summary')
  summary() {
    return this.ledger.getDashboardSummary();
  }
}
