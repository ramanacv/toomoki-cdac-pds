import { Plane } from '../../infrastructure/plane.decorator.js';
import { Controller, Get, Inject, Req } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import type { AuditAlert, DistributionTransaction, FPSAllocation } from '@pds/shared-types';
import type { StockPosition } from '../stock/stock.controller.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import { fpsAssignmentForRead } from '../auth/fps-scope.js';

@Plane('data')
@Controller()
@Roles(...OPERATIONAL_ROLES)
export class DashboardController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/dashboard/summary')
  async summary(@Req() request?: AuthenticatedRequest) {
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    if (!assignment) return this.ledger.getDashboardSummary();

    const [stock, allocations, distributions, alerts] = await Promise.all([
      Promise.resolve(this.ledger.listStockPositions()),
      Promise.resolve(this.ledger.listAllocations()),
      Promise.resolve(this.ledger.listDistributions()),
      Promise.resolve(this.ledger.getAlerts())
    ]) as [StockPosition[], FPSAllocation[], DistributionTransaction[], AuditAlert[]];
    const ownAllocations = allocations.filter((item) => item.fpsId === assignment.fpsId);
    const ownDistributions = distributions.filter((item) => item.fpsId === assignment.fpsId);
    const ownAlerts = alerts.filter((item) =>
      item.entityId === assignment.fpsId ||
      ownAllocations.some((allocation) => allocation.allocationId === item.entityId) ||
      ownDistributions.some((distribution) => distribution.distributionId === item.entityId)
    );
    const pendingFpsAllocations = ownAllocations.filter((item) => item.status === 'ALLOCATED').length;
    return {
      trackedStockKg: stock
        .filter((item) => item.entityId === assignment.fpsId)
        .reduce((total, item) => total + item.quantityKg, 0),
      activeLots: 0,
      completedDistributions: ownDistributions.length,
      pendingReceipts: pendingFpsAllocations,
      pendingTransferReceipts: 0,
      pendingFpsAllocations,
      openAlerts: ownAlerts.filter((item) => item.status !== 'RESOLVED').length,
      highRiskFps: ownAlerts.some((item) => item.riskLevel === 'HIGH') ? [assignment.fpsId] : []
    };
  }
}
