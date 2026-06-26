import { Controller, Get, Header, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { renderLandingPage, renderSwaggerPage } from './api-pages.js';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';

@Controller()
export class HealthController {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

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

  /** Kubernetes liveness probe — is the process alive? */
  @Get('/health/live')
  live() {
    return { ok: true, timestamp: new Date().toISOString() };
  }

  /**
   * Kubernetes readiness probe — is the service ready to handle traffic?
   * Checks that the ledger engine has bootstrapped (at least one stakeholder).
   * Returns 503 if not ready so the load balancer withholds traffic.
   */
  @Get('/health/ready')
  ready() {
    const snapshot = this.ledger.snapshot();
    const stakeholderCount = snapshot.stakeholders.length;
    if (stakeholderCount === 0) {
      throw new HttpException(
        { ok: false, reason: 'ledger_not_bootstrapped' },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
    return {
      ok: true,
      timestamp: new Date().toISOString(),
      stakeholders: stakeholderCount,
      lots: snapshot.lots.length,
      distributions: snapshot.distributions.length
    };
  }

  /** Legacy endpoint — kept for backward compat with existing probes. */
  @Get('/health')
  health() {
    return { ok: true };
  }
}
