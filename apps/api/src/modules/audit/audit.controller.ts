import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { ResolveAuditAlertDto } from './dto/resolve-audit-alert.dto.js';

@Plane('data')
@Controller()
export class AuditController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/audit-alerts')
  alerts() {
    return this.ledger.getAlerts();
  }

  @Post('/audit-alerts/reconcile')
  reconcile() {
    return this.ledger.reconcileAlertsPersisted();
  }

  @Post('/audit-alerts/:alertId/resolve')
  resolveAlert(@Param('alertId') alertId: string, @Body() body: ResolveAuditAlertDto) {
    return this.ledger.resolveAuditAlertPersisted({
      alertId,
      resolvedBy: body.resolvedBy,
      resolutionNote: body.resolutionNote ?? ''
    });
  }
}
