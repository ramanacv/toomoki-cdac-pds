import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { CoreModule } from '../core/core.module.js';

@Module({
  imports: [CoreModule],
  controllers: [HealthController]
})
export class HealthModule {}
