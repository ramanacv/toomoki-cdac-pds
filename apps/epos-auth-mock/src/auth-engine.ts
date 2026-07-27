import { createHash } from 'node:crypto';
import {
  type EposAuthRequest,
  type EposAuthResponse,
  validateEposAuthRequest
} from '@pds/shared-types';

/**
 * Simulated Aadhaar/UIDAI-style authentication outcomes for FPS ePoS demos.
 * Does not contact UIDAI and never accepts raw Aadhaar, OTP, or biometrics.
 */

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value, Object.keys(value as object).sort());

type Scenario = {
  authResult: EposAuthResponse['authResult'];
  reasonCode: string;
  maskedAadhaarLabel?: string;
};

const scenariosByAadhaarRef: Record<string, Scenario> = {
  'aadhaar-demo-001-hash': {
    authResult: 'SUCCESS',
    reasonCode: 'AADHAAR_AUTH_SUCCESS',
    maskedAadhaarLabel: 'XXXX-XXXX-0001'
  },
  'aadhaar-demo-fail-hash': {
    authResult: 'FAILURE',
    reasonCode: 'AADHAAR_AUTH_FAILED',
    maskedAadhaarLabel: 'XXXX-XXXX-0002'
  },
  'aadhaar-demo-suspended-hash': {
    authResult: 'FAILURE',
    reasonCode: 'AADHAAR_SUSPENDED_REF',
    maskedAadhaarLabel: 'XXXX-XXXX-0003'
  },
  'aadhaar-demo-mismatch-hash': {
    authResult: 'FAILURE',
    reasonCode: 'AADHAAR_DEMOGRAPHIC_MISMATCH',
    maskedAadhaarLabel: 'XXXX-XXXX-0004'
  },
  // Legacy demo hashes used by existing FPS fixtures
  'beneficiary-hash': {
    authResult: 'SUCCESS',
    reasonCode: 'AADHAAR_AUTH_SUCCESS',
    maskedAadhaarLabel: 'XXXX-XXXX-0101'
  }
};

const scenariosByRationCard: Record<string, Scenario> = {
  'demo-ration-card-hash': {
    authResult: 'SUCCESS',
    reasonCode: 'AADHAAR_AUTH_SUCCESS',
    maskedAadhaarLabel: 'XXXX-XXXX-0101'
  },
  'demo-ration-card-fail-hash': {
    authResult: 'FAILURE',
    reasonCode: 'AADHAAR_AUTH_FAILED',
    maskedAadhaarLabel: 'XXXX-XXXX-0199'
  }
};

export class AuthConflictError extends Error {}

export class EposAuthEngine {
  private readonly responses = new Map<string, { fingerprint: string; response: EposAuthResponse }>();

  authenticate(raw: unknown): EposAuthResponse {
    const request = validateEposAuthRequest(raw);
    const fingerprint = sha256(canonical(request));
    const previous = this.responses.get(request.authTxnId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new AuthConflictError('authTxnId was reused with different content');
      }
      return previous.response;
    }

    let scenario =
      scenariosByAadhaarRef[request.aadhaarRefHash] ??
      scenariosByRationCard[request.rationCardHash] ??
      ({
        authResult: 'SUCCESS' as const,
        reasonCode: 'AADHAAR_AUTH_SUCCESS',
        maskedAadhaarLabel: 'XXXX-XXXX-0000'
      } satisfies Scenario);

    if (request.authMode === 'SUPERVISOR_EXCEPTION') {
      scenario = {
        authResult: 'EXCEPTION_APPROVED',
        reasonCode: 'SUPERVISOR_EXCEPTION',
        ...(scenario.maskedAadhaarLabel
          ? { maskedAadhaarLabel: scenario.maskedAadhaarLabel }
          : {})
      };
    }

    const response: EposAuthResponse = {
      authTxnId: request.authTxnId,
      authMode: request.authMode,
      authResult: scenario.authResult,
      aadhaarRefHash: request.aadhaarRefHash,
      beneficiaryRefHash: request.beneficiaryRefHash,
      rationCardHash: request.rationCardHash,
      fpsRef: request.fpsRef,
      reasonCode: scenario.reasonCode,
      ...(scenario.maskedAadhaarLabel ? { maskedAadhaarLabel: scenario.maskedAadhaarLabel } : {}),
      simulationOnly: true,
      assessedAt: '2026-07-25T08:00:00.000Z',
      schemaVersion: '1.0'
    };
    this.responses.set(request.authTxnId, { fingerprint, response });
    return response;
  }
}
