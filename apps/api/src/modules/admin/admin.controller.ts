import { Plane } from '../../infrastructure/plane.decorator.js';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';

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
}
