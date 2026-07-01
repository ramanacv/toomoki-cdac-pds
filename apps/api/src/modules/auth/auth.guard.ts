import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { resolveLedgerMode } from '../config/ledger-mode.config.js';
import { IDENTITY_PROVIDER, type AuthenticatedRequest, type IdentityProvider, type PdsIdentity, type PdsRole } from './identity-provider.js';

/**
 * Authentication guard for business endpoints (T2.5).
 *
 * Behavior:
 *  - `demo` ledger mode: open access (preserves dev UX), logs a warning.
 *  - `fabric` / pilot mode: requires a valid `Authorization: Bearer <token>`
 *    header whose identity is verified by the configured {@link IdentityProvider}.
 *    When a {@link BusinessAuthOptions} role set is supplied, the identity's
 *    role must be in the set.
 *
 * Role mapping is consistent with the chaincode MSP mapping (T1.5):
 * procurement / godown / fps / department / auditor.
 */
const DEMO_WARNING =
  'PDS_LEDGER_MODE=demo: business endpoints are open (no auth). Set PDS_LEDGER_MODE=fabric and configure an IdentityProvider for production.';

let demoWarningLogged = false;

export type BusinessAuthOptions = {
  roles?: PdsRole[];
};

@Injectable()
export class BusinessAuthGuard implements CanActivate {
  constructor(@Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = resolveLedgerMode();
    if (mode === 'demo') {
      if (!demoWarningLogged) {
        console.warn(DEMO_WARNING);
        demoWarningLogged = true;
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const path = request.path ?? request.url ?? '';
    // Health / OpenAPI / admin endpoints are not gated here (admin has its own
    // AdminGuard; health must stay open for container healthchecks).
    if (path.startsWith('/health') || path.startsWith('/openapi') || path.startsWith('/admin')) {
      return true;
    }

    const header = request.headers['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw || !raw.toLowerCase().startsWith('bearer ')) {
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
      throw new UnauthorizedException('Identity verification failed');
    }
    if (!identity) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const options = this.optionsFor(context);
    if (options.roles && options.roles.length > 0) {
      if (!identity.role || !options.roles.includes(identity.role)) {
        throw new UnauthorizedException(`Role ${identity.role ?? 'none'} not permitted for this operation`);
      }
    }

    request.user = identity;
    return true;
  }

  /** Per-controller role requirements (overridable). Default: any authenticated. */
  protected optionsFor(_context: ExecutionContext): BusinessAuthOptions {
    return {};
  }
}
