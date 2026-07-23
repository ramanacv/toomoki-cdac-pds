import { Plane } from '../../infrastructure/plane.decorator.js';
import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import { fpsAssignmentForRead } from '../auth/fps-scope.js';

export type StockPosition = {
  entityId: string;
  commodity: string;
  quantityKg: number;
};

@Plane('data')
@Controller()
@Roles(...OPERATIONAL_ROLES)
export class StockController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/stock')
  async listStock(
    @Query('org') org?: string,
    @Query('commodity') commodity?: string,
    @Req() request?: AuthenticatedRequest
  ): Promise<StockPosition[]> {
    const assignment = await fpsAssignmentForRead(this.ledger, request);
    const positions = await Promise.resolve(this.ledger.listStockPositions() as StockPosition[] | Promise<StockPosition[]>);
    return positions
      .filter((position) => {
        if (assignment && position.entityId !== assignment.fpsId) {
          return false;
        }
        if (org && position.entityId !== org) {
          return false;
        }
        if (commodity && position.commodity !== commodity) {
          return false;
        }
        return true;
      })
      .filter((position) => position.quantityKg > 0)
      .sort((left, right) => right.quantityKg - left.quantityKg);
  }
}
