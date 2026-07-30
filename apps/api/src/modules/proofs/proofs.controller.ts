import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import { OPERATIONAL_ROLES, Roles } from '../auth/roles.decorator.js';
import { ProofsService } from './proofs.service.js';

@Controller()
@Roles(...OPERATIONAL_ROLES)
export class ProofsController {
  constructor(@Inject(ProofsService) private readonly proofs: ProofsService) {}

  @Get('/ledger-proofs/analytics')
  analytics() {
    return this.proofs.getAnalytics();
  }

  /** Hash-keyed audit trail with outbox fabric_tx_id (auditor / management / platform-admin). */
  @Get('/ledger-proofs')
  @Roles('auditor', 'management', 'platform-admin')
  listByEntity(
    @Query('entityId') entityId?: string,
    @Query('beneficiaryRefHash') beneficiaryRefHash?: string,
    @Query('limit') limit?: string
  ) {
    const query: { entityId?: string; beneficiaryRefHash?: string; limit?: number } = {};
    if (entityId !== undefined) query.entityId = entityId;
    if (beneficiaryRefHash !== undefined) query.beneficiaryRefHash = beneficiaryRefHash;
    if (limit !== undefined && limit !== '') {
      const parsedLimit = Number(limit);
      if (Number.isFinite(parsedLimit)) query.limit = parsedLimit;
    }
    return this.proofs.listByEntity(query);
  }

  @Get('/ledger-proofs/:eventId/detail')
  @Roles('auditor', 'management', 'platform-admin')
  detail(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    const includeRawError =
      request.user?.roles.some((role) => role === 'auditor' || role === 'platform-admin') ?? false;
    return this.proofs.getDetail(eventId, includeRawError);
  }

  @Get('/ledger-proofs/:eventId')
  status(@Param('eventId') eventId: string, @Req() request: AuthenticatedRequest) {
    const includeRawError =
      request.user?.roles.some((role) => role === 'auditor' || role === 'platform-admin') ?? false;
    return this.proofs.getStatus(eventId, includeRawError);
  }

  @Get('/admin/proofs/summary')
  @Roles('platform-admin', 'auditor')
  summary() {
    return this.proofs.getSummary();
  }
}
