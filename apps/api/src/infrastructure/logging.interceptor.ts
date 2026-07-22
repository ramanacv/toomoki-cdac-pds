import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { PLANE_KEY, type PlaneType } from './plane.decorator.js';
import { MetricsService } from '../modules/metrics/metrics.service.js';

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
  baseUrl?: string;
  route?: { path?: string };
  user?: { subject: string; roles: string[]; organizationId?: string; stakeholderId?: string; mspId?: string };
};

type ResponseLike = {
  statusCode: number;
};

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
    @Inject(Reflector) private readonly reflector: Reflector,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const res = context.switchToHttp().getResponse<ResponseLike>();

    const plane: PlaneType =
      this.reflector?.getAllAndOverride<PlaneType>(PLANE_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? 'data';

    const rawRequestId = req.headers['x-request-id'];
    const requestId = (Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId) ?? `req-${Date.now().toString(36)}`;
    const start = Date.now();
    const { method } = req;
    const path = `${req.baseUrl ?? ''}${req.route?.path ?? req.path}`;
    const identity = req.user;
    const securityContext = identity ? {
      subject: identity.subject,
      roles: identity.roles,
      organizationId: identity.organizationId,
      stakeholderId: identity.stakeholderId,
      mspId: identity.mspId
    } : { subject: 'anonymous', roles: [] };

    return next.handle().pipe(
      tap(() => {
        const durationMs = Date.now() - start;
        this.logger.log(
          JSON.stringify({ requestId, plane, method, path, statusCode: res.statusCode, ...securityContext, durationMs, outcome: 'ok' })
        );
        this.metrics?.recordRequest({ method, path, plane, statusCode: res.statusCode, durationMs });
      }),
      catchError((err: unknown) => {
        const durationMs = Date.now() - start;
        const statusCode = (err as { status?: number }).status ?? 500;
        this.logger.error(
          JSON.stringify({ requestId, plane, method, path, statusCode, ...securityContext, durationMs, outcome: 'error', errorCategory: statusCode >= 500 ? 'server_error' : 'request_rejected' })
        );
        this.metrics?.recordRequest({ method, path, plane, statusCode, durationMs });
        return throwError(() => err);
      })
    );
  }
}
