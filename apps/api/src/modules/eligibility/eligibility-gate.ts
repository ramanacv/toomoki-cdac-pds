/**
 * In-process entitlement gate. Durable source of truth is `eligibility_cases`
 * (`entitlement_blocked`, `rcms_status`); `EligibilityService.onModuleInit`
 * rebuilds this map from PostgreSQL after restart. Do not treat the Map alone
 * as durable storage.
 */
import { BadRequestException } from '@nestjs/common';

/** Keep in sync with `@pds/shared-types` INELIGIBLE_BENEFICIARY_* (avoid circular import in Vitest). */
const INELIGIBLE_BENEFICIARY_CODE = 'INELIGIBLE_BENEFICIARY';
const INELIGIBLE_BENEFICIARY_NOTICE = 'Ineligible Beneficiary';

type EligibilityGateState = {
  blocked: boolean;
  rcmsStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  caseId: string;
};

const gates = new Map<string, EligibilityGateState>();

export const setEligibilityGate = (rationCardHash: string, state: EligibilityGateState): void => {
  gates.set(rationCardHash, state);
};

export const clearEligibilityGates = (): void => gates.clear();

export const getEligibilityGate = (rationCardHash: string): EligibilityGateState | undefined => gates.get(rationCardHash);
export const removeEligibilityGate = (rationCardHash: string): void => { gates.delete(rationCardHash); };

/**
 * Blocks FPS distribution after an authorized RCMS cancel/suspend or removal.
 * Ghost/death screening alone must not call setEligibilityGate with blocked=true.
 * User-facing message matches POC TC_INT_003 ("Ineligible Beneficiary"); opaque
 * ration-card hashes stay out of the client message.
 */
export const assertEligibilityGateOpen = (rationCardHash: string): void => {
  const gate = gates.get(rationCardHash);
  if (gate?.blocked) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: INELIGIBLE_BENEFICIARY_NOTICE,
      code: INELIGIBLE_BENEFICIARY_CODE
    });
  }
};
