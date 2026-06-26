import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  Optional
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { PLANE_KEY, type PlaneType } from './plane.decorator.js';
import type { MetricsService } from '../modules/metrics/metrics.service.js';

/**
 * Global structured request logger.
 *
 * Every API request produces one JSON log line containing:
 *   requestId, plane, method, path, statusCode, durationMs, role (from JWT/stub).
 *
 * The `plane` field ('control' | 'data') comes from the @Plane() decorator on
 * the handler or its controller class, defaulting to 'data'. This lets ops
 * teams set independent alert thresholds: a slow control-plane write (e.g.
 * ProposeEntitlementRule) is far more alarming than a slow data-plane read.
 */
@Injectable()
export class PdsLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PdsRequest');

  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly metrics?: MetricsService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: { role?: string } }>();
    const res = context.switchToHttp().getResponse<Response>();

    const plane: PlaneType =
      this.reflector.getAllAndOverride<PlaneType>(PLANE_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? 'data';

    const requestId = (req.headers['x-request-id'] as string | undefined) ?? `req-${Date.now().toString(36)}`;
    const start = Date.now();
    const { method, path } = req;
    const role = req.user?.role ?? 'anonymous';

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        this.logger.log(
          JSON.stringify({ requestId, plane, method, path, statusCode: res.statusCode, role, durationMs, outcome: 'ok' })
        );
        this.metrics?.recordRequest({ method, path, plane, statusCode: res.statusCode, durationMs });
      }),
      catchError((err: unknown) => {
        const durationMs = Date.now() - start;
        const statusCode = (err as { status?: number }).status ?? 500;
        this.logger.error(
          JSON.stringify({ requestId, plane, method, path, statusCode, role, durationMs, outcome: 'error', error: err instanceof Error ? err.message : String(err) })
        );
        this.metrics?.recordRequest({ method, path, plane, statusCode, durationMs });
        return throwError(() => err);
      })
    );
  }
}
