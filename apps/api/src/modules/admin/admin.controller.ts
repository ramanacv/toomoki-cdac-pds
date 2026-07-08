import { Plane } from '../../infrastructure/plane.decorator.js';
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { COMMODITIES } from '@pds/shared-types';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { ResetLedgerDto } from './dto/reset-ledger.dto.js';

@Plane('control')
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.getOverview();
  }

  @Get('network')
  network() {
    return this.admin.getNetwork();
  }

  @Get('activity')
  activity() {
    return this.admin.getActivity();
  }

  @Get('stakeholders/summary')
  stakeholdersSummary() {
    return this.admin.getStakeholderSummary();
  }

  @Post('reset')
  @HttpCode(200)
  reset(@Body() body: ResetLedgerDto = {}) {
    const commodity = body?.commodity?.trim() || undefined;
    if (commodity && !COMMODITIES.some((item) => item.name === commodity)) {
      throw new BadRequestException(`Unknown commodity: ${commodity}`);
    }
    return this.admin.resetLedger(commodity);
  }
}
