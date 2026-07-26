import { Inject, Injectable } from '@nestjs/common';
import {
  AuthMode,
  AuthResult,
  EPOS_AUTH_SCHEMA_VERSION,
  type EposAuthMode,
  type EposAuthRequest,
  type EposAuthResponse,
  type EposAuthResultCode,
  validateEposAuthResponse
} from '@pds/shared-types';

export const EPOS_AUTH_ADAPTER = Symbol('EPOS_AUTH_ADAPTER');

export type LocalEposAuthInput = {
  authTxnId: string;
  aadhaarRefHash: string;
  beneficiaryRefHash: string;
  rationCardHash: string;
  fpsRef: string;
  authMode: AuthMode;
  authResult: AuthResult;
  approvedBy?: string;
};

export interface EposAuthAdapter {
  health(): Promise<boolean>;
  isConfigured(): boolean;
  authenticate(input: LocalEposAuthInput, correlationId: string): Promise<EposAuthResponse>;
}

export class EposAuthDependencyError extends Error {
  constructor(
    message: string,
    readonly kind: 'NOT_CONFIGURED' | 'TIMEOUT' | 'UNAVAILABLE' | 'CONFLICT' | 'INVALID_RESPONSE'
  ) {
    super(message);
  }
}

const positiveTimeout = (): number => {
  const configured = Number(process.env.PDS_EPOS_AUTH_SERVICE_TIMEOUT_MS ?? 3000);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 3000;
};

const toEposMode = (mode: AuthMode): EposAuthMode => mode as unknown as EposAuthMode;

const toAuthResult = (result: EposAuthResultCode): AuthResult => {
  if (result === 'SUCCESS') return AuthResult.SUCCESS;
  if (result === 'FAILURE') return AuthResult.FAILURE;
  return AuthResult.EXCEPTION_APPROVED;
};

export const authResultFromEposResponse = (response: EposAuthResponse): AuthResult =>
  toAuthResult(response.authResult);

/** When the external mock is not configured, preserve current client-driven simulation. */
@Injectable()
export class LocalEposAuthAdapter implements EposAuthAdapter {
  isConfigured(): boolean {
    return false;
  }

  async health(): Promise<boolean> {
    return false;
  }

  async authenticate(input: LocalEposAuthInput): Promise<EposAuthResponse> {
    return {
      authTxnId: input.authTxnId,
      authMode: toEposMode(input.authMode),
      authResult: input.authResult as unknown as EposAuthResultCode,
      aadhaarRefHash: input.aadhaarRefHash,
      beneficiaryRefHash: input.beneficiaryRefHash,
      rationCardHash: input.rationCardHash,
      fpsRef: input.fpsRef,
      reasonCode: 'LOCAL_CLIENT_SIMULATION',
      simulationOnly: true,
      assessedAt: new Date().toISOString(),
      schemaVersion: EPOS_AUTH_SCHEMA_VERSION
    };
  }
}

@Injectable()
export class HttpEposAuthAdapter implements EposAuthAdapter {
  private readonly baseUrl = (process.env.PDS_EPOS_AUTH_SERVICE_URL ?? '').replace(/\/$/, '');
  private readonly token = process.env.PDS_EPOS_AUTH_SERVICE_TOKEN ?? '';
  private readonly timeoutMs = positiveTimeout();

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  async health(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async authenticate(input: LocalEposAuthInput, correlationId: string): Promise<EposAuthResponse> {
    if (!this.isConfigured()) {
      throw new EposAuthDependencyError('ePoS auth service is not configured', 'NOT_CONFIGURED');
    }

    const body: EposAuthRequest = {
      authTxnId: input.authTxnId,
      aadhaarRefHash: input.aadhaarRefHash,
      beneficiaryRefHash: input.beneficiaryRefHash,
      rationCardHash: input.rationCardHash,
      fpsRef: input.fpsRef,
      authMode: toEposMode(input.authMode),
      ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
      schemaVersion: EPOS_AUTH_SCHEMA_VERSION
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/authenticate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
          'x-correlation-id': correlationId
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new EposAuthDependencyError('ePoS auth service timed out', 'TIMEOUT');
      }
      throw new EposAuthDependencyError('ePoS auth service is unavailable', 'UNAVAILABLE');
    }

    if (response.status === 409) {
      throw new EposAuthDependencyError('ePoS auth request conflicts with an earlier request', 'CONFLICT');
    }
    if (!response.ok) {
      throw new EposAuthDependencyError(`ePoS auth service returned HTTP ${response.status}`, 'UNAVAILABLE');
    }
    try {
      return validateEposAuthResponse(await response.json());
    } catch {
      throw new EposAuthDependencyError('ePoS auth response failed privacy/schema validation', 'INVALID_RESPONSE');
    }
  }
}

@Injectable()
export class EposAuthClient {
  constructor(@Inject(EPOS_AUTH_ADAPTER) private readonly adapter: EposAuthAdapter) {}

  isConfigured() {
    return this.adapter.isConfigured();
  }

  health() {
    return this.adapter.health();
  }

  authenticate(input: LocalEposAuthInput, correlationId: string) {
    return this.adapter.authenticate(input, correlationId);
  }
}

export const createEposAuthAdapter = (): EposAuthAdapter => {
  const url = (process.env.PDS_EPOS_AUTH_SERVICE_URL ?? '').trim();
  const token = (process.env.PDS_EPOS_AUTH_SERVICE_TOKEN ?? '').trim();
  if (url && token) return new HttpEposAuthAdapter();
  return new LocalEposAuthAdapter();
};
