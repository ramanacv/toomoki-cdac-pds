import { Plane } from '../../infrastructure/plane.decorator.js';
import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { EntitlementCreateDto, EntitlementValidateDto } from './dto/entitlement.dto.js';
import { Roles } from '../auth/roles.decorator.js';

@Plane('control')
@Controller()
export class EntitlementsController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  @Get('/entitlements/:rationCardHash')
  entitlements(
    @Param('rationCardHash') rationCardHash: string,
    @Query('commodity') commodity = 'Rice',
    @Query('month') month?: string
  ) {
    const resolvedMonth =
      month ??
      [...this.ledger.listEntitlements()]
        .filter((entitlement) => entitlement.rationCardHash === rationCardHash && entitlement.commodity === commodity)
        .sort((left, right) => right.month.localeCompare(left.month))[0]?.month ??
      new Date().toISOString().slice(0, 7);
    return this.ledger.getEntitlement(rationCardHash, commodity, resolvedMonth);
  }

  @Get('/entitlements')
  entitlementList() {
    return this.ledger.listEntitlements();
  }

  @Post('/entitlements')
  @Roles('department')
  create(@Body() body: EntitlementCreateDto) {
    return this.ledger.createOrUpdateEntitlementPersisted(body);
  }

  @Post('/entitlements/validate')
  validate(@Body() body: EntitlementValidateDto) {
    return this.ledger.validateEntitlement(body);
  }
}
