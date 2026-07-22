import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';
import { ProofsService } from './proofs.service.js';

@Controller()
@Roles(...OPERATIONAL_ROLES)
export class ProofsController {
  constructor(@Inject(ProofsService) private readonly proofs: ProofsService) {}

  @Get('/ledger-proofs/:eventId')
  status(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    const includeRawError = request.user?.roles.some((role) => role === 'auditor' || role === 'platform-admin') ?? false;
    return this.proofs.getStatus(eventId, includeRawError);
  }

  @Get('/admin/proofs/summary')
  @Roles('platform-admin', 'auditor')
  summary() {
    return this.proofs.getSummary();
  }
}
