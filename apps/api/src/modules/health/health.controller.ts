import { Controller, Get, Header } from '@nestjs/common';
import { renderLandingPage, renderSwaggerPage } from './api-pages.js';

@Controller()
export class HealthController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  root(): string {
    return renderLandingPage();
  }

  @Get('/docs')
  @Header('Content-Type', 'text/html; charset=utf-8')
  docs(): string {
    return renderSwaggerPage();
  }

  @Get('/health')
  health() {
    return { ok: true };
  }
}
