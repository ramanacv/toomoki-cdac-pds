import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { EntitlementValidateDto } from './dto/entitlement.dto.js';

@Plane('control')
@Controller()
export class EntitlementsController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/entitlements/:rationCardHash')
  entitlements(
    @Param('rationCardHash') rationCardHash: string,
    @Query('commodity') commodity = 'Rice',
    @Query('month') month = '2026-06'
  ) {
    return this.ledger.getEntitlement(rationCardHash, commodity, month);
  }

  @Get('/entitlements')
  entitlementList() {
    return this.ledger.listEntitlements();
  }

  @Post('/entitlements/validate')
  validate(@Body() body: EntitlementValidateDto) {
    return this.ledger.validateEntitlement(body);
  }
}
