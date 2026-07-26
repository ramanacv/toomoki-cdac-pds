/**
 * In-process entitlement gate. Durable source of truth is `eligibility_cases`
 * (`entitlement_blocked`, `rcms_status`); `EligibilityService.onModuleInit`
 * rebuilds this map from PostgreSQL after restart. Do not treat the Map alone
 * as durable storage.
 */
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

export const assertEligibilityGateOpen = (rationCardHash: string): void => {
  const gate = gates.get(rationCardHash);
  if (gate?.blocked) {
    throw new Error(`Distribution cannot proceed: ration card ${rationCardHash} is blocked by effective RCMS eligibility decision (${gate.rcmsStatus})`);
  }
};
