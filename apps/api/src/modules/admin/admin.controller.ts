import { Plane } from '../../infrastructure/plane.decorator.js';
import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { COMMODITIES } from '@pds/shared-types';
import { AdminService } from './admin.service.js';
import { ResetLedgerDto } from './dto/reset-ledger.dto.js';
import { Roles } from '../auth/roles.decorator.js';

@Plane('control')
@Controller('admin')
@Roles('platform-admin')
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
  @Roles('demo-reset')
  reset(@Body() body: ResetLedgerDto = {}) {
    if (process.env.PDS_ALLOW_RESET?.toLowerCase() !== 'true') {
      throw new ForbiddenException('Demo reset is disabled');
    }
    const commodity = body?.commodity?.trim() || undefined;
    if (commodity && !COMMODITIES.some((item) => item.name === commodity)) {
      throw new BadRequestException(`Unknown commodity: ${commodity}`);
    }
    return this.admin.resetLedger(commodity);
  }
}
