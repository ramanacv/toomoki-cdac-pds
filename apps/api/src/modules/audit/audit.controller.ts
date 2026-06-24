import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';

@Controller()
export class AuditController {
  constructor(private readonly ledger: PdsLedgerFacade) {}

  @Get('/audit-alerts')
  alerts() {
    return this.ledger.getAlerts();
  }

  @Post('/audit-alerts/reconcile')
  reconcile() {
    return this.ledger.reconcileAlerts();
  }

  @Post('/audit-alerts/:alertId/resolve')
  resolveAlert(
    @Param('alertId') alertId: string,
    @Body() body: { resolvedBy: string; resolutionNote: string }
  ) {
    return this.ledger.resolveAuditAlert({
      alertId,
      resolvedBy: body.resolvedBy,
      resolutionNote: body.resolutionNote
    });
  }
}
