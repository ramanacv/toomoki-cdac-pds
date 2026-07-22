import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IDENTITY_PROVIDER, type AuthenticatedRequest, type IdentityProvider, type PdsIdentity, type PdsRole } from './identity-provider.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Authentication guard for business endpoints (T2.5).
 *
 * Behavior:
 * All online ledger modes require a valid `Authorization: Bearer <token>`
 *    header whose identity is verified by the configured {@link IdentityProvider}.
 *    When a {@link BusinessAuthOptions} role set is supplied, the identity's
 *    role must be in the set.
 *
 * Role mapping is consistent with the chaincode MSP mapping (T1.5):
 * procurement / godown / fps / department / auditor.
 */
export type BusinessAuthOptions = {
  roles?: PdsRole[];
};

const IDENTIFIER_PARENTS = new Set([
  'lots', 'transfers', 'fps-allocations', 'distributions', 'entitlements',
  'transactions', 'ledger-proofs', 'audit-alerts'
]);

export const normalizeSecurityRoute = (path: string): string => {
  const [pathname] = path.split('?');
  const segments = (pathname ?? '').split('/');
  return segments.map((segment, index) =>
    index > 0 && IDENTIFIER_PARENTS.has(segments[index - 1] ?? '') && segment ? ':id' : segment
  ).join('/');
};

const positiveIntegerFromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
};

@Injectable()
export class BusinessAuthGuard implements CanActivate {
  private readonly logger = new Logger('PdsSecurity');
  private readonly requestWindows = new Map<string, number[]>();
  private readonly readRequestsPerMinute = positiveIntegerFromEnv('PDS_RATE_LIMIT_READ_PER_MINUTE', 120);
  private readonly mutationRequestsPerMinute = positiveIntegerFromEnv('PDS_RATE_LIMIT_MUTATION_PER_MINUTE', 30);
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
    @Inject(Reflector) private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path = request.route?.path ?? normalizeSecurityRoute(request.path ?? request.url ?? '');

    const header = request.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw || !raw.toLowerCase().startsWith('bearer ')) {
      this.auditAnonymous(request, path, 'missing_or_malformed_token');
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }
    const token = raw.slice(7).trim();
    if (token.length === 0) {
      throw new UnauthorizedException('Empty bearer token');
    }

    let identity: PdsIdentity | null;
    try {
      identity = await this.identityProvider.verify(token);
    } catch {
      this.auditAnonymous(request, path, 'unverifiable_token');
      throw new UnauthorizedException('Identity verification failed');
    }
    if (!identity) {
      this.auditAnonymous(request, path, 'invalid_or_expired_token');
      throw new UnauthorizedException('Invalid or expired token');
    }

    const options = this.optionsFor(context);
    if (options.roles && options.roles.length > 0) {
      if (!options.roles.some((role) => identity.roles.includes(role))) {
        this.audit(request, identity, path, 'deny', 403);
        throw new ForbiddenException('Authenticated identity is not permitted for this operation');
      }
    }

    request.user = identity;
    this.enforceRateLimit(request, identity, path);
    this.audit(request, identity, path, 'allow', 200);
    return true;
  }

  /** Per-controller role requirements (overridable). Default: any authenticated. */
  protected optionsFor(context: ExecutionContext): BusinessAuthOptions {
    const roles = this.reflector.getAllAndOverride<PdsRole[]>('roles', [
      context.getHandler(),
      context.getClass()
    ]);
    return { roles };
  }

  private audit(request: AuthenticatedRequest, identity: PdsIdentity, path: string, decision: 'allow' | 'deny', status: number) {
    const rawRequestId = request.headers['x-request-id'];
    const requestId = Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId;
    this.logger.log(JSON.stringify({
      event: 'authorization_decision',
      subject: identity.subject,
      roles: identity.roles,
      organizationId: identity.organizationId,
      stakeholderId: identity.stakeholderId,
      mspId: identity.mspId,
      method: request.method,
      route: path,
      decision,
      status,
      requestId
    }));
  }

  private auditAnonymous(request: AuthenticatedRequest, path: string, reason: string) {
    const rawRequestId = request.headers['x-request-id'];
    this.logger.warn(JSON.stringify({
      event: 'authorization_decision', subject: 'anonymous', roles: [], method: request.method,
      route: path, decision: 'deny', status: 401, reason,
      requestId: Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId
    }));
  }

  private enforceRateLimit(request: AuthenticatedRequest, identity: PdsIdentity, path: string) {
    const isReset = path.startsWith('/admin/reset');
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    const limit = isReset ? 3 : isRead ? this.readRequestsPerMinute : this.mutationRequestsPerMinute;
    const windowMs = isReset ? 15 * 60_000 : 60_000;
    const bucket = isReset ? 'reset' : isRead ? 'read' : 'mutation';
    const key = `${identity.subject}:${request.ip ?? 'unknown'}:${bucket}`;
    const now = Date.now();
    const active = (this.requestWindows.get(key) ?? []).filter((timestamp) => timestamp > now - windowMs);
    if (active.length >= limit) {
      this.requestWindows.set(key, active);
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    active.push(now);
    this.requestWindows.set(key, active);
  }
}
