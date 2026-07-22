import { Controller, Get, Header, Inject } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';
import { Roles } from '../auth/roles.decorator.js';

@Controller()
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly metrics: MetricsService) {}

  @Get('/metrics')
  @Roles('metrics-reader', 'platform-admin')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(): Promise<string> {
    return this.metrics.render();
  }
}
