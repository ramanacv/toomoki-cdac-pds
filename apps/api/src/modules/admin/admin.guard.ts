import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { loadAdminAccessConfig } from './admin.config.js';

type AdminRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

/**
 * Rate-limit window state keyed by client IP. In-memory token bucket that
 * allows `maxAttempts` failed attempts within `windowMs`, then rejects further
 * attempts until the window elapses. Resets on a successful verification.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_FAILURES = 10;

type RateBucket = { failures: number; windowStart: number; blockedUntil: number };

const constantTimeEquals = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Compare against itself to keep timing roughly constant, then return false.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
};

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly rateBuckets = new Map<string, RateBucket>();

  canActivate(context: ExecutionContext): boolean {
    const config = loadAdminAccessConfig();
    if (!config.required) {
      // Demo mode: admin endpoints are open (no token configured and not fabric).
      return true;
    }

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const clientIp = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const bucket = this.getBucket(clientIp);

    if (Date.now() < bucket.blockedUntil) {
      throw new UnauthorizedException('Too many admin token attempts; try again later');
    }

    const header = request.headers['x-admin-token'];
    const provided = Array.isArray(header) ? header[0] : header;

    // Reject empty/missing tokens before any comparison (avoids trivial bypass
    // and ensures timingSafeEqual only runs on two non-empty buffers).
    if (!provided || provided.length === 0) {
      this.recordFailure(bucket, clientIp);
      throw new UnauthorizedException('Valid X-Admin-Token header required');
    }
    if (!config.token || config.token.length === 0) {
      // Misconfiguration: required but no token set — fail closed.
      this.recordFailure(bucket, clientIp);
      throw new UnauthorizedException('Admin token not configured');
    }

    if (constantTimeEquals(provided, config.token)) {
      this.resetBucket(clientIp);
      return true;
    }

    this.recordFailure(bucket, clientIp);
    throw new UnauthorizedException('Valid X-Admin-Token header required');
  }

  private getBucket(clientIp: string): RateBucket {
    const now = Date.now();
    const existing = this.rateBuckets.get(clientIp);
    if (existing && now - existing.windowStart < RATE_LIMIT_WINDOW_MS) {
      return existing;
    }
    const fresh: RateBucket = { failures: 0, windowStart: now, blockedUntil: 0 };
    this.rateBuckets.set(clientIp, fresh);
    return fresh;
  }

  private recordFailure(bucket: RateBucket, clientIp: string): void {
    bucket.failures += 1;
    if (bucket.failures >= RATE_LIMIT_MAX_FAILURES) {
      bucket.blockedUntil = Date.now() + RATE_LIMIT_WINDOW_MS;
      bucket.failures = 0;
      bucket.windowStart = Date.now();
    }
    this.rateBuckets.set(clientIp, bucket);
  }

  private resetBucket(clientIp: string): void {
    this.rateBuckets.delete(clientIp);
  }
}
