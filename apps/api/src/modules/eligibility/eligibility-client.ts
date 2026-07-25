import { Inject, Injectable } from '@nestjs/common';
import {
  type EligibilityScreeningRequest,
  type EligibilityScreeningResponse,
  validateEligibilityScreeningResponse
} from '@pds/shared-types';

export const ELIGIBILITY_SCREENING_ADAPTER = Symbol('ELIGIBILITY_SCREENING_ADAPTER');

export interface EligibilityScreeningAdapter {
  health(): Promise<boolean>;
  screen(request: EligibilityScreeningRequest, correlationId: string): Promise<EligibilityScreeningResponse>;
}

export class EligibilityDependencyError extends Error {
  constructor(message: string, readonly kind: 'NOT_CONFIGURED' | 'TIMEOUT' | 'UNAVAILABLE' | 'CONFLICT' | 'INVALID_RESPONSE') {
    super(message);
  }
}

const positiveTimeout = (): number => {
  const configured = Number(process.env.PDS_ELIGIBILITY_SERVICE_TIMEOUT_MS ?? 3000);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 3000;
};

@Injectable()
export class HttpEligibilityScreeningAdapter implements EligibilityScreeningAdapter {
  private readonly baseUrl = (process.env.PDS_ELIGIBILITY_SERVICE_URL ?? '').replace(/\/$/, '');
  private readonly token = process.env.PDS_ELIGIBILITY_SERVICE_TOKEN ?? '';
  private readonly timeoutMs = positiveTimeout();

  async health(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(this.timeoutMs) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async screen(request: EligibilityScreeningRequest, correlationId: string): Promise<EligibilityScreeningResponse> {
    if (!this.baseUrl || !this.token) throw new EligibilityDependencyError('Eligibility service is not configured', 'NOT_CONFIGURED');
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/screenings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
          'x-correlation-id': correlationId
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new EligibilityDependencyError('Eligibility service timed out; entitlement was preserved', 'TIMEOUT');
      }
      throw new EligibilityDependencyError('Eligibility service is unavailable; entitlement was preserved', 'UNAVAILABLE');
    }
    if (response.status === 409) throw new EligibilityDependencyError('External screening request conflicts with an earlier request', 'CONFLICT');
    if (!response.ok) throw new EligibilityDependencyError(`Eligibility service returned HTTP ${response.status}`, 'UNAVAILABLE');
    try {
      return validateEligibilityScreeningResponse(await response.json());
    } catch {
      throw new EligibilityDependencyError('Eligibility response was quarantined because it failed validation', 'INVALID_RESPONSE');
    }
  }
}

@Injectable()
export class EligibilityClient {
  constructor(@Inject(ELIGIBILITY_SCREENING_ADAPTER) private readonly adapter: EligibilityScreeningAdapter) {}
  health() { return this.adapter.health(); }
  screen(request: EligibilityScreeningRequest, correlationId: string) { return this.adapter.screen(request, correlationId); }
}
