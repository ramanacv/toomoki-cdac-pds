import { Plane } from '../../infrastructure/plane.decorator.js';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';

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
  async listStock(@Query('org') org?: string, @Query('commodity') commodity?: string): Promise<StockPosition[]> {
    const positions = await Promise.resolve(this.ledger.listStockPositions() as StockPosition[] | Promise<StockPosition[]>);
    return positions
      .filter((position) => {
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
