import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { CanonicalSourceEventType, SourceSystem, type SourceEventEnvelope } from '@pds/shared-types';
import type { AuthenticatedRequest } from '../auth/identity-provider.js';
import { Roles } from '../auth/roles.decorator.js';
import { Plane } from '../../infrastructure/plane.decorator.js';
import { SourceEventEnvelopeDto } from './dto/source-event.dto.js';
import { IntegrationEventsService, type IngestionOutcome } from './integration-events.service.js';

type PassthroughResponse = { status(code: number): unknown };

@Plane('data')
@Controller()
@Roles('integration-service')
export class IntegrationsController {
  constructor(@Inject(IntegrationEventsService) private readonly events: IntegrationEventsService) {}

  @Post('/integrations/smartpds/v1/master-references')
  smartPds(
    @Body() body: SourceEventEnvelopeDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse
  ) {
    return this.ingest(body, SourceSystem.SMARTPDS_RCMS, CanonicalSourceEventType.MASTER_REFERENCE, 'smartpds', request, response);
  }

  @Post('/integrations/scm/v1/allocation-events')
  allocations(
    @Body() body: SourceEventEnvelopeDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse
  ) {
    return this.ingest(body, SourceSystem.STATE_SCM, CanonicalSourceEventType.ALLOCATION, 'scm', request, response);
  }

  @Post('/integrations/scm/v1/movement-events')
  movements(
    @Body() body: SourceEventEnvelopeDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse
  ) {
    return this.ingest(body, SourceSystem.STATE_SCM, CanonicalSourceEventType.MOVEMENT, 'scm', request, response);
  }

  @Post('/integrations/epos/v1/distribution-events')
  distributions(
    @Body() body: SourceEventEnvelopeDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: PassthroughResponse
  ) {
    return this.ingest(body, SourceSystem.AEPDS_EPOS, CanonicalSourceEventType.DISTRIBUTION, 'epos', request, response);
  }

  @Get('/integrations/events')
  list() {
    return this.events.list();
  }

  @Get('/integrations/health')
  health() {
    return this.events.health();
  }

  @Get('/integrations/events/:sourceSystem/:sourceEventId/trace')
  trace(@Param('sourceSystem') sourceSystem: string, @Param('sourceEventId') sourceEventId: string) {
    if (!Object.values(SourceSystem).includes(sourceSystem as SourceSystem)) {
      throw new BadRequestException('Unknown source system');
    }
    return this.events.trace(sourceSystem as SourceSystem, sourceEventId);
  }

  @Post('/integrations/reconcile')
  reconcile() {
    return this.events.reconcile();
  }

  private async ingest(
    body: SourceEventEnvelopeDto,
    sourceSystem: SourceSystem,
    eventType: CanonicalSourceEventType,
    endpointFamily: string,
    request: AuthenticatedRequest,
    response: PassthroughResponse
  ) {
    const outcome = await this.events.ingest(
      body as SourceEventEnvelope,
      { sourceSystem, eventType, endpointFamily },
      request
    );
    response.status(this.statusFor(outcome));
    return outcome.result;
  }

  private statusFor(outcome: IngestionOutcome): number {
    if (outcome.disposition === 'NEW') return 201;
    if (outcome.disposition === 'QUARANTINED') return 202;
    if (outcome.disposition === 'CONFLICT') return 409;
    return 200;
  }
}
