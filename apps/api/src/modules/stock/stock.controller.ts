import { Plane } from '../../infrastructure/plane.decorator.js';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';

export type StockPosition = {
  entityId: string;
  commodity: string;
  quantityKg: number;
};

@Plane('data')
@Controller()
export class StockController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/stock')
  listStock(@Query('org') org?: string, @Query('commodity') commodity?: string): StockPosition[] {
    const positions = this.buildStockPositions();
    return positions.filter((position) => {
      if (org && position.entityId !== org) {
        return false;
      }
      if (commodity && position.commodity !== commodity) {
        return false;
      }
      return true;
    });
  }

  private buildStockPositions(): StockPosition[] {
    const state = this.ledger.exportState();
    return state.stock
      .map(([key, quantityKg]) => {
        const separatorIndex = key.lastIndexOf(':');
        return {
          entityId: key.slice(0, separatorIndex),
          commodity: key.slice(separatorIndex + 1),
          quantityKg
        };
      })
      .filter((position) => position.quantityKg > 0)
      .sort((left, right) => right.quantityKg - left.quantityKg);
  }
}
