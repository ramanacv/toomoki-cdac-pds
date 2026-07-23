import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { IntegrationEventsService } from './integration-events.service.js';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationEventsService],
  exports: [IntegrationEventsService]
})
export class IntegrationsModule {}
