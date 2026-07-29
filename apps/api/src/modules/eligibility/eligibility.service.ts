import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  BENEFICIARY_REMOVAL_REASONS,
  ELIGIBILITY_POLICY_ID,
  type BeneficiaryLifecycleEvent,
  type BeneficiaryRemovalReason,
  type BeneficiaryRemovalResponse,
  type BeneficiaryRemovalResult,
  type BeneficiaryRemovalSource,
  type EligibilityBeneficiary,
  type EligibilityCase,
  type EligibilityCaseAction,
  type EligibilityCaseState,
  type EligibilityDecision,
  type EligibilityScreeningRequest,
  type EligibilityScreeningResponse,
  type EligibilitySummary,
  validateEligibilityScreeningRequest
} from '@pds/shared-types';
import { BeneficiaryRegistryService } from '../beneficiary-registry/beneficiary-registry.service.js';
import { EligibilityClient, EligibilityDependencyError } from './eligibility-client.js';
import { clearEligibilityGates, getEligibilityGate, removeEligibilityGate, setEligibilityGate } from './eligibility-gate.js';
import { EligibilityRepository } from './eligibility.repository.js';
import { eligibilityBeneficiaries as beneficiariesSeed } from '@pds/fixtures';

type ActionInput = {
  idempotencyKey: string;
  expectedVersion: number;
  outcomeCode: string;
  reasonCode: string;
  note?: string;
  decision?: EligibilityDecision;
};
type ScreeningResult = {
  screening: EligibilityScreeningResponse;
  case: EligibilityCase | null;
  entitlementPreserved: boolean;
};

const reviewStatuses = new Set([
  'DEATH_MATCH_REVIEW', 'INACTIVITY_REVIEW', 'ECONOMIC_ELIGIBILITY_REVIEW', 'LANDHOLDING_REVIEW',
  'MULTI_SOURCE_CONFLICT', 'DUPLICATE_RECORD_REVIEW'
]);
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const baselineBeneficiaries = new Map(beneficiariesSeed.map((item) => [item.demoBeneficiaryId, structuredClone(item)]));
const indicativeSubsidyRateInrPerKg = 30;

@Injectable()
export class EligibilityService implements OnModuleInit {
  private beneficiaries = new Map(beneficiariesSeed.map((item) => [item.demoBeneficiaryId, structuredClone(item)]));
  private readonly cases = new Map<string, EligibilityCase>();
  private readonly caseByBeneficiary = new Map<string, string>();
  private readonly screeningCounts = new Map<string, number>();
  private readonly idempotency = new Map<string, { fingerprint: string; result: EligibilityCase }>();
  private readonly screeningIdempotency = new Map<string, { fingerprint: string; result: ScreeningResult }>();
  private readonly removalIdempotency = new Map<string, { fingerprint: string; result: BeneficiaryRemovalResponse }>();
  private serviceState: EligibilitySummary['service'] = { status: 'NOT_CONFIGURED' };
  private quarantined = 0;

  constructor(
    @Inject(EligibilityClient) private readonly client: EligibilityClient,
    @Inject(EligibilityRepository) private readonly repository: EligibilityRepository,
    @Optional() @Inject(BeneficiaryRegistryService) private readonly registry?: BeneficiaryRegistryService
  ) {}

  async onModuleInit(): Promise<void> {
    const loaded = await this.repository.loadState();
    for (const item of loaded.cases) {
      this.cases.set(item.caseId, structuredClone(item));
      this.caseByBeneficiary.set(item.demoBeneficiaryId, item.caseId);
      const beneficiary = this.beneficiaries.get(item.demoBeneficiaryId);
      if (beneficiary) {
        beneficiary.caseId = item.caseId;
        beneficiary.householdSize = item.householdSize;
        beneficiary.monthlyRiceEntitlementKg = item.monthlyRiceEntitlementKg;
        beneficiary.eligibilityStatus = item.rcmsStatus === 'CANCELLED' ? 'CANCELLED' :
          item.rcmsStatus === 'SUSPENDED' ? 'SUSPENDED' :
          ['CLOSED', 'REINSTATED'].includes(item.state) ? 'ELIGIBLE' : 'UNDER_REVIEW';
      }
      setEligibilityGate(item.rationCardHash, {
        blocked: item.entitlementBlocked, rcmsStatus: item.rcmsStatus, caseId: item.caseId
      });
    }
    for (const action of loaded.actions) {
      this.idempotency.set(action.idempotencyKey, {
        fingerprint: action.requestHash, result: structuredClone(action.result)
      });
    }
    for (const screening of loaded.screenings) {
      this.screeningIdempotency.set(screening.screeningRequestId, {
        fingerprint: screening.requestHash, result: structuredClone(screening.result)
      });
      this.screeningCounts.set(
        screening.result.screening.status,
        (this.screeningCounts.get(screening.result.screening.status) ?? 0) + 1
      );
    }
  }

  async summary(): Promise<EligibilitySummary> {
    await this.refreshProofStatuses();
    const healthy = await this.client.health();
    this.serviceState = { ...this.serviceState, status: healthy ? 'HEALTHY' : this.serviceState.lastSuccessfulCallAt ? 'DEGRADED' : 'UNAVAILABLE' };
    const cases = [...this.cases.values()];
    const baseline = [...baselineBeneficiaries.values()];
    const current = [...this.beneficiaries.values()].filter((item) => item.eligibilityStatus !== 'CANCELLED');
    const baselineMonthlyRiceKg = baseline.reduce((total, item) => total + item.monthlyRiceEntitlementKg, 0);
    const currentMonthlyRiceKg = current.reduce((total, item) => total + item.monthlyRiceEntitlementKg, 0);
    const allocationDeltaKg = currentMonthlyRiceKg - baselineMonthlyRiceKg;
    return {
      simulationOnly: true,
      policyId: ELIGIBILITY_POLICY_ID,
      service: this.serviceState,
      statusCounts: Object.fromEntries(this.screeningCounts),
      openCases: cases.filter((item) => !['CLOSED', 'REINSTATED'].includes(item.state)).length,
      decisions: cases.filter((item) => item.history.some((action) => action.action === 'DECISION')).length,
      appeals: cases.filter((item) => item.history.some((action) => action.action === 'APPEAL')).length,
      reversals: cases.filter((item) => item.history.some((action) => action.action === 'REINSTATEMENT')).length,
      quarantined: this.quarantined,
      planningImpact: {
        simulationOnly: true,
        baselineHouseholdMembers: baseline.reduce((total, item) => total + item.householdSize, 0),
        currentEligibleHouseholdMembers: current.reduce((total, item) => total + item.householdSize, 0),
        baselineMonthlyRiceKg,
        currentMonthlyRiceKg,
        allocationDeltaKg,
        indicativeSubsidyRateInrPerKg,
        indicativeMonthlySubsidyDeltaInr: allocationDeltaKg * indicativeSubsidyRateInrPerKg
      },
      beneficiaries: [...this.beneficiaries.values()]
    };
  }

  async listCases(): Promise<EligibilityCase[]> {
    await this.refreshProofStatuses();
    return [...this.cases.values()].map((item) => structuredClone(item));
  }

  getCase(caseId: string): EligibilityCase {
    const item = this.cases.get(caseId);
    if (!item) throw new NotFoundException(`Eligibility case ${caseId} was not found`);
    return structuredClone(item);
  }

  async runScreening(input: { screeningRequestId: string; demoBeneficiaryId: string; checks: EligibilityScreeningRequest['checks'] }, correlationId: string) {
    const beneficiary = this.mustBeneficiary(input.demoBeneficiaryId);
    const request: EligibilityScreeningRequest = {
      ...input,
      subjectRefHash: beneficiary.subjectRefHash,
      rationCardHash: beneficiary.rationCardHash,
      schemaVersion: '1.0'
    };
    try {
      validateEligibilityScreeningRequest(request);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid eligibility screening request');
    }
    const requestFingerprint = hash(request);
    const screeningReplay = this.screeningIdempotency.get(input.screeningRequestId);
    if (screeningReplay) {
      if (screeningReplay.fingerprint !== requestFingerprint) {
        throw new ConflictException('screeningRequestId was reused with different request content');
      }
      return structuredClone(screeningReplay.result);
    }
    const started = Date.now();
    let screening: EligibilityScreeningResponse;
    try {
      screening = await this.client.screen(request, correlationId);
      if (screening.screeningRequestId !== input.screeningRequestId) throw new EligibilityDependencyError('Screening response correlation mismatch', 'INVALID_RESPONSE');
      this.serviceState = { status: 'HEALTHY', lastSuccessfulCallAt: new Date().toISOString(), latencyMs: Date.now() - started };
    } catch (error) {
      this.quarantined += 1;
      const warning = error instanceof Error ? error.message : 'Eligibility service failed; entitlement was preserved';
      this.serviceState = { status: 'DEGRADED', warning };
      throw new ServiceUnavailableException({ message: warning, quarantined: true, entitlementPreserved: true });
    }
    this.screeningCounts.set(screening.status, (this.screeningCounts.get(screening.status) ?? 0) + 1);
    if (!reviewStatuses.has(screening.status)) {
      const beneficiaryBefore = structuredClone(beneficiary);
      let caseBefore: EligibilityCase | undefined;
      beneficiary.eligibilityStatus = 'ELIGIBLE';
      const priorCaseId = this.caseByBeneficiary.get(beneficiary.demoBeneficiaryId);
      if (priorCaseId) {
        const existing = this.cases.get(priorCaseId);
        if (existing && existing.state !== 'DECIDED' && existing.state !== 'APPEALED') {
          caseBefore = structuredClone(existing);
          const priorState = existing.state;
          existing.state = 'CLOSED';
          existing.version += 1;
          existing.updatedAt = new Date().toISOString();
          existing.screening = screening;
          existing.history.push({
            actionId: input.screeningRequestId, action: 'SCREENING', outcomeCode: screening.status,
            reasonCode: screening.policy.ruleIds.join(','), actorRef: 'department-service',
            occurredAt: existing.updatedAt, priorState, newState: 'CLOSED'
          });
        }
      }
      const result = {
        screening, case: null, entitlementPreserved: true
      };
      try {
        const caseToPersist = priorCaseId ? this.cases.get(priorCaseId) : undefined;
        await this.repository.persistScreening(requestFingerprint, result, caseToPersist, input.demoBeneficiaryId);
      } catch (error) {
        this.beneficiaries.set(beneficiary.demoBeneficiaryId, beneficiaryBefore);
        if (caseBefore) this.cases.set(caseBefore.caseId, caseBefore);
        throw error;
      }
      return this.rememberScreening(input.screeningRequestId, requestFingerprint, result);
    }
    const existingId = this.caseByBeneficiary.get(beneficiary.demoBeneficiaryId);
    const existing = existingId ? this.cases.get(existingId) : undefined;
    if (existing && !['CLOSED', 'REINSTATED'].includes(existing.state)) {
      const before = structuredClone(existing);
      existing.screening = screening;
      existing.version += 1;
      existing.updatedAt = new Date().toISOString();
      existing.history.push({
        actionId: input.screeningRequestId, action: 'SCREENING', outcomeCode: screening.status,
        reasonCode: screening.policy.ruleIds.join(','), actorRef: 'department-service',
        occurredAt: existing.updatedAt, priorState: existing.state, newState: existing.state
      });
      beneficiary.eligibilityStatus = 'UNDER_REVIEW';
      const result = {
        screening, case: structuredClone(existing), entitlementPreserved: !existing.entitlementBlocked
      };
      try {
        await this.repository.persistScreening(requestFingerprint, result, existing, input.demoBeneficiaryId);
      } catch (error) {
        this.cases.set(existing.caseId, before);
        throw error;
      }
      return this.rememberScreening(input.screeningRequestId, requestFingerprint, result);
    }
    const now = new Date().toISOString();
    const caseId = `ELIG-CASE-${beneficiary.demoBeneficiaryId.slice(-3)}-${screening.screeningId.slice(-6)}`;
    const item: EligibilityCase = {
      caseId,
      demoBeneficiaryId: beneficiary.demoBeneficiaryId,
      subjectRefHash: beneficiary.subjectRefHash,
      rationCardHash: beneficiary.rationCardHash,
      screening,
      state: 'OPEN',
      version: 1,
      rcmsStatus: 'ACTIVE',
      entitlementBlocked: false,
      householdSize: beneficiary.householdSize,
      monthlyRiceEntitlementKg: beneficiary.monthlyRiceEntitlementKg,
      alreadyLiftedKg: beneficiary.alreadyLiftedKg,
      proofStatus: 'NOT_REQUIRED',
      history: [{
        actionId: input.screeningRequestId, action: 'SCREENING', outcomeCode: screening.status,
        reasonCode: screening.policy.ruleIds.join(','), actorRef: 'department-service', occurredAt: now,
        priorState: 'OPEN', newState: 'OPEN'
      }],
      updatedAt: now
    };
    this.cases.set(caseId, item);
    this.caseByBeneficiary.set(beneficiary.demoBeneficiaryId, caseId);
    beneficiary.caseId = caseId;
    beneficiary.eligibilityStatus = 'UNDER_REVIEW';
    const result = {
      screening, case: structuredClone(item), entitlementPreserved: true
    };
    try {
      await this.repository.persistScreening(requestFingerprint, result, item, input.demoBeneficiaryId);
    } catch (error) {
      this.cases.delete(caseId);
      this.caseByBeneficiary.delete(beneficiary.demoBeneficiaryId);
      delete beneficiary.caseId;
      beneficiary.eligibilityStatus = 'ELIGIBLE';
      throw error;
    }
    return this.rememberScreening(input.screeningRequestId, requestFingerprint, result);
  }

  async notice(caseId: string, input: ActionInput, actorRef: string) {
    return this.transitionAndPersist(caseId, input, actorRef, 'NOTICE', ['OPEN', 'AWAITING_DATA', 'AWAITING_FIELD_VERIFICATION'], 'NOTICE_ISSUED');
  }

  async verification(caseId: string, input: ActionInput, actorRef: string) {
    const before = structuredClone(this.mustCase(caseId));
    const beneficiaryBefore = structuredClone(this.mustBeneficiary(before.demoBeneficiaryId));
    const target: EligibilityCaseState =
      input.outcomeCode === 'STALE_SOURCE_CONFIRMED' || input.outcomeCode === 'PORTABILITY_CONFIRMED' ? 'CLOSED' : 'REVIEW_READY';
    const result = this.transition(caseId, input, actorRef, 'VERIFICATION',
      ['OPEN', 'AWAITING_DATA', 'AWAITING_FIELD_VERIFICATION', 'NOTICE_ISSUED'], target);
    this.assignCheckpointProof(result, 'VERIFICATION');
    if (result.demoBeneficiaryId === 'BEN-DEMO-001' && input.outcomeCode === 'DECEASED_MEMBER_CONFIRMED') {
      result.householdSize = 4;
      result.monthlyRiceEntitlementKg = 20;
      const beneficiary = this.mustBeneficiary(result.demoBeneficiaryId);
      beneficiary.householdSize = 4;
      beneficiary.monthlyRiceEntitlementKg = 20;
    }
    if (target === 'CLOSED') {
      this.mustBeneficiary(result.demoBeneficiaryId).eligibilityStatus = 'ELIGIBLE';
    }
    this.cases.set(caseId, structuredClone(result));
    this.idempotency.set(input.idempotencyKey, {
      fingerprint: hash({ caseId, action: 'VERIFICATION', input }),
      result: structuredClone(result)
    });
    try {
      await this.repository.persistCaseAction(result, input.idempotencyKey, hash({ caseId, action: 'VERIFICATION', input }));
      if (result.demoBeneficiaryId === 'BEN-DEMO-001' && input.outcomeCode === 'DECEASED_MEMBER_CONFIRMED') {
        await this.bridgeDeceasedMemberRemoval(result, actorRef);
      }
    } catch (error) {
      this.cases.set(caseId, before);
      this.beneficiaries.set(before.demoBeneficiaryId, beneficiaryBefore);
      this.idempotency.delete(input.idempotencyKey);
      throw error;
    }
    return result;
  }

  async recommendation(caseId: string, input: ActionInput, actorRef: string) {
    const target = input.outcomeCode === 'ELIGIBLE' ? 'RECOMMENDED_ELIGIBLE' : 'RECOMMENDED_INELIGIBLE';
    return this.transitionAndPersist(caseId, input, actorRef, 'RECOMMENDATION', ['REVIEW_READY', 'NOTICE_ISSUED'], target);
  }

  async decision(caseId: string, input: ActionInput, actorRef: string) {
    if (!input.decision) throw new ConflictException('decision is required');
    const replay = this.replay(caseId, 'DECISION', input);
    if (replay) return replay;
    const before = structuredClone(this.mustCase(caseId));
    const beneficiaryBefore = structuredClone(this.mustBeneficiary(before.demoBeneficiaryId));
    const gateBefore = getEligibilityGate(before.rationCardHash);
    const result = this.transition(caseId, input, actorRef, 'DECISION',
      ['RECOMMENDED_ELIGIBLE', 'RECOMMENDED_INELIGIBLE', 'REVIEW_READY'], 'DECIDED');
    result.decision = input.decision;
    result.rcmsStatus = input.decision === 'CARD_CANCELLED' ? 'CANCELLED' :
      input.decision === 'TEMPORARILY_SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
    result.entitlementBlocked = ['CARD_CANCELLED', 'TEMPORARILY_SUSPENDED'].includes(input.decision);
    result.proofStatus = 'PENDING';
    result.proofEventId = `ELIG-PROOF-${hash({ caseId, version: result.version, decision: input.decision }).slice(0, 24)}`;
    const beneficiary = this.mustBeneficiary(result.demoBeneficiaryId);
    beneficiary.eligibilityStatus = result.rcmsStatus === 'CANCELLED' ? 'CANCELLED' :
      result.rcmsStatus === 'SUSPENDED' ? 'SUSPENDED' : 'ELIGIBLE';
    setEligibilityGate(result.rationCardHash, { blocked: result.entitlementBlocked, rcmsStatus: result.rcmsStatus, caseId });
    this.cases.set(caseId, structuredClone(result));
    this.idempotency.set(input.idempotencyKey, {
      fingerprint: hash({ caseId, action: 'DECISION', input }),
      result: structuredClone(result)
    });
    try {
      await this.repository.persistFinalDecision(
        result, input.idempotencyKey, hash({ caseId, action: 'DECISION', input })
      );
    } catch (error) {
      this.cases.set(caseId, before);
      this.beneficiaries.set(before.demoBeneficiaryId, beneficiaryBefore);
      this.idempotency.delete(input.idempotencyKey);
      if (gateBefore) setEligibilityGate(before.rationCardHash, gateBefore);
      else removeEligibilityGate(before.rationCardHash);
      throw error;
    }
    return result;
  }

  async appeal(caseId: string, input: ActionInput, actorRef: string) {
    return this.transitionAndPersist(caseId, input, actorRef, 'APPEAL', ['DECIDED'], 'APPEALED');
  }

  async reinstate(caseId: string, input: ActionInput, actorRef: string) {
    const replay = this.replay(caseId, 'REINSTATEMENT', input);
    if (replay) return replay;
    const before = structuredClone(this.mustCase(caseId));
    const beneficiaryBefore = structuredClone(this.mustBeneficiary(before.demoBeneficiaryId));
    const gateBefore = getEligibilityGate(before.rationCardHash);
    const result = this.transition(caseId, input, actorRef, 'REINSTATEMENT', ['APPEALED'], 'REINSTATED');
    result.decision = 'REINSTATED';
    result.rcmsStatus = 'ACTIVE';
    result.entitlementBlocked = false;
    result.proofStatus = 'PENDING';
    result.proofEventId = `ELIG-PROOF-${hash({ caseId, version: result.version, decision: 'REINSTATED' }).slice(0, 24)}`;
    this.mustBeneficiary(result.demoBeneficiaryId).eligibilityStatus = 'ELIGIBLE';
    setEligibilityGate(result.rationCardHash, { blocked: false, rcmsStatus: 'ACTIVE', caseId });
    this.cases.set(caseId, structuredClone(result));
    this.idempotency.set(input.idempotencyKey, {
      fingerprint: hash({ caseId, action: 'REINSTATEMENT', input }),
      result: structuredClone(result)
    });
    try {
      await this.repository.persistFinalDecision(
        result, input.idempotencyKey, hash({ caseId, action: 'REINSTATEMENT', input })
      );
    } catch (error) {
      this.cases.set(caseId, before);
      this.beneficiaries.set(before.demoBeneficiaryId, beneficiaryBefore);
      this.idempotency.delete(input.idempotencyKey);
      if (gateBefore) setEligibilityGate(before.rationCardHash, gateBefore);
      else removeEligibilityGate(before.rationCardHash);
      throw error;
    }
    return result;
  }

  gate(demoBeneficiaryId: string, requestedQtyKg: number) {
    const beneficiary = this.mustBeneficiary(demoBeneficiaryId);
    const gate = getEligibilityGate(beneficiary.rationCardHash);
    const remainingKg = Math.max(0, beneficiary.monthlyRiceEntitlementKg - beneficiary.alreadyLiftedKg);
    return {
      demoBeneficiaryId, rationCardHash: beneficiary.rationCardHash,
      allowed: !gate?.blocked && requestedQtyKg <= remainingKg,
      rcmsStatus: gate?.rcmsStatus ?? 'ACTIVE',
      monthlyEntitlementKg: beneficiary.monthlyRiceEntitlementKg,
      alreadyLiftedKg: beneficiary.alreadyLiftedKg,
      availableBalanceKg: remainingKg,
      reason: gate?.blocked ? 'EFFECTIVE_RCMS_DECISION' : requestedQtyKg > remainingKg ? 'INSUFFICIENT_BALANCE' : 'ELIGIBLE'
    };
  }

  /** Read-only snapshot of a synthetic beneficiary, including live status and removal record. */
  getBeneficiary(demoBeneficiaryId: string): EligibilityBeneficiary {
    return structuredClone(this.mustBeneficiary(demoBeneficiaryId));
  }

  /**
   * Removes beneficiaries from the active list (officer bulk action after
   * fraud confirmation, or a beneficiary's own card surrender).
   *
   * Effects per beneficiary: status becomes CANCELLED, the entitlement gate is
   * blocked (FPS distribution is refused), and a `RECORD_DEACTIVATED`
   * beneficiary-registry lifecycle event is recorded with a Fabric proof.
   * Repeat requests with the same idempotency key replay; conflicting reuse
   * returns 409. Already-removed beneficiaries report ALREADY_REMOVED.
   */
  async removeBeneficiaries(
    input: { idempotencyKey: string; reasonCode: BeneficiaryRemovalReason; demoBeneficiaryIds: string[]; note?: string },
    actorRef: string,
    source: BeneficiaryRemovalSource
  ): Promise<BeneficiaryRemovalResponse> {
    if (!BENEFICIARY_REMOVAL_REASONS.includes(input.reasonCode)) {
      throw new BadRequestException(`reasonCode must be one of: ${BENEFICIARY_REMOVAL_REASONS.join(', ')}`);
    }
    const ids = [...new Set(input.demoBeneficiaryIds)];
    if (ids.length === 0) throw new BadRequestException('demoBeneficiaryIds must not be empty');
    if (ids.length > 20) throw new BadRequestException('At most 20 beneficiaries can be removed per request');

    const fingerprint = hash({ action: 'BENEFICIARY_REMOVAL', ids, reasonCode: input.reasonCode, note: input.note, source });
    const previous = this.removalIdempotency.get(input.idempotencyKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new ConflictException('Idempotency key was reused with different removal content');
      }
      return structuredClone(previous.result);
    }

    // Validate every target before mutating any of them.
    for (const id of ids) this.mustBeneficiary(id);

    const results: BeneficiaryRemovalResult[] = [];
    for (const id of ids) {
      const beneficiary = this.mustBeneficiary(id);
      if (beneficiary.removal) {
        results.push({
          demoBeneficiaryId: id,
          disposition: 'ALREADY_REMOVED',
          eligibilityStatus: 'CANCELLED',
          removal: structuredClone(beneficiary.removal)
        });
        continue;
      }
      const removedAt = new Date().toISOString();
      const registryProofEventId = await this.recordRegistryDeactivation(beneficiary, input, actorRef, removedAt);
      const removal: NonNullable<EligibilityBeneficiary['removal']> = {
        reasonCode: input.reasonCode,
        source,
        removedAt,
        removedBy: actorRef,
        ...(input.note ? { note: input.note } : {}),
        ...(registryProofEventId ? { registryProofEventId } : {})
      };
      beneficiary.eligibilityStatus = 'CANCELLED';
      beneficiary.removal = removal;
      setEligibilityGate(beneficiary.rationCardHash, {
        blocked: true,
        rcmsStatus: 'CANCELLED',
        caseId: beneficiary.caseId ?? 'BENEFICIARY_REMOVAL'
      });
      results.push({ demoBeneficiaryId: id, disposition: 'REMOVED', eligibilityStatus: 'CANCELLED', removal: structuredClone(removal) });
    }

    const result: BeneficiaryRemovalResponse = { simulationOnly: true, idempotencyKey: input.idempotencyKey, results };
    this.removalIdempotency.set(input.idempotencyKey, { fingerprint, result: structuredClone(result) });
    return result;
  }

  /**
   * Records the removal as a privacy-safe registry lifecycle event
   * (RECORD_DEACTIVATED), auto-creating the registry record first when the
   * beneficiary was never registered — same ensure-then-apply pattern as the
   * deceased-member bridge. Event IDs derive from the idempotency key so
   * identical replays succeed and conflicting reuse fails in the registry.
   */
  private async recordRegistryDeactivation(
    beneficiary: EligibilityBeneficiary,
    input: { idempotencyKey: string; reasonCode: BeneficiaryRemovalReason },
    actorRef: string,
    removedAt: string
  ): Promise<string | undefined> {
    if (!this.registry) return undefined;
    const eventKey = hash({ key: input.idempotencyKey, id: beneficiary.demoBeneficiaryId }).slice(0, 24);
    const base = {
      beneficiaryRefHash: beneficiary.subjectRefHash,
      rationCardHash: beneficiary.rationCardHash,
      sourceSystem: 'VIKSITPDS_DEMO' as const,
      occurredAt: removedAt,
      effectiveAt: removedAt,
      policyId: ELIGIBILITY_POLICY_ID,
      evidenceDigest: hash({ eventKey, reasonCode: input.reasonCode, actorRef }),
      districtCode: beneficiary.districtCode ?? 'MH-DEMO-01',
      schemaVersion: '1.0' as const
    };
    const deactivation: BeneficiaryLifecycleEvent = {
      ...base,
      eventId: `BEN-REMOVAL-${eventKey}`,
      eventType: 'RECORD_DEACTIVATED',
      reasonCode: input.reasonCode
    };
    try {
      return (await this.registry.apply(deactivation)).proofEventId;
    } catch {
      await this.registry.apply({
        ...base,
        eventId: `BEN-REMOVAL-CREATE-${eventKey}`,
        eventType: 'BENEFICIARY_CREATED',
        reasonCode: 'DEMO_REGISTRY_ENSURE',
        householdSizeDelta: beneficiary.householdSize,
        newState: 'ACTIVE'
      });
      return (await this.registry.apply(deactivation)).proofEventId;
    }
  }

  reset(): { reset: true } {
    this.beneficiaries = new Map(beneficiariesSeed.map((item) => [item.demoBeneficiaryId, structuredClone(item)]));
    this.cases.clear(); this.caseByBeneficiary.clear(); this.screeningCounts.clear(); this.idempotency.clear();
    this.screeningIdempotency.clear(); this.removalIdempotency.clear();
    this.quarantined = 0; this.serviceState = { status: 'NOT_CONFIGURED' }; clearEligibilityGates();
    return { reset: true };
  }

  private transition(
    caseId: string, input: ActionInput, actorRef: string, action: EligibilityCaseAction['action'],
    allowed: EligibilityCaseState[], newState: EligibilityCaseState
  ): EligibilityCase {
    const fingerprint = hash({ caseId, action, input });
    const replay = this.idempotency.get(input.idempotencyKey);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new ConflictException('Idempotency key was reused with different action content');
      return structuredClone(replay.result);
    }
    const item = this.mustCase(caseId);
    if (item.version !== input.expectedVersion) throw new ConflictException(`Expected case version ${input.expectedVersion}, current version is ${item.version}`);
    if (!allowed.includes(item.state)) throw new ConflictException(`Action ${action} is invalid while case is ${item.state}`);
    const priorState = item.state;
    item.state = newState;
    item.version += 1;
    item.updatedAt = new Date().toISOString();
    item.history.push({
      actionId: randomUUID(), action, outcomeCode: input.outcomeCode, reasonCode: input.reasonCode,
      actorRef, occurredAt: item.updatedAt, priorState, newState
    });
    const result = structuredClone(item);
    this.idempotency.set(input.idempotencyKey, { fingerprint, result });
    return result;
  }

  private async transitionAndPersist(
    caseId: string,
    input: ActionInput,
    actorRef: string,
    action: EligibilityCaseAction['action'],
    allowed: EligibilityCaseState[],
    newState: EligibilityCaseState
  ): Promise<EligibilityCase> {
    const replay = this.replay(caseId, action, input);
    if (replay) return replay;
    const before = structuredClone(this.mustCase(caseId));
    const result = this.transition(caseId, input, actorRef, action, allowed, newState);
    this.assignCheckpointProof(result, action);
    this.cases.set(caseId, structuredClone(result));
    this.idempotency.set(input.idempotencyKey, {
      fingerprint: hash({ caseId, action, input }),
      result: structuredClone(result)
    });
    try {
      await this.repository.persistCaseAction(result, input.idempotencyKey, hash({ caseId, action, input }));
    } catch (error) {
      this.cases.set(caseId, before);
      this.idempotency.delete(input.idempotencyKey);
      throw error;
    }
    return result;
  }

  private assignCheckpointProof(item: EligibilityCase, action: EligibilityCaseAction['action']): void {
    item.proofStatus = 'PENDING';
    item.proofEventId = `ELIG-PROOF-${hash({
      caseId: item.caseId,
      version: item.version,
      action,
      outcomeCode: item.history.at(-1)?.outcomeCode
    }).slice(0, 24)}`;
  }

  /**
   * Idempotent ops-side bridge: verified deceased-member removal updates the
   * beneficiary registry projection. Fabric only receives the registry proof
   * after PostgreSQL accepts the lifecycle event — chaincode never mutates status.
   */
  private async bridgeDeceasedMemberRemoval(item: EligibilityCase, actorRef: string): Promise<void> {
    if (!this.registry) return;
    void actorRef;
    const base = {
      beneficiaryRefHash: item.subjectRefHash,
      rationCardHash: item.rationCardHash,
      sourceSystem: 'FIELD_VERIFICATION' as const,
      occurredAt: item.updatedAt,
      effectiveAt: item.updatedAt,
      policyId: item.screening.policy.policyId,
      evidenceDigest: item.screening.evidenceDigest,
      schemaVersion: '1.0' as const
    };
    const removal: BeneficiaryLifecycleEvent = {
      ...base,
      eventId: `ELIG-BRIDGE-MEMBER-REMOVED-${item.caseId}-${item.version}`,
      eventType: 'MEMBER_REMOVED',
      reasonCode: 'DECEASED_MEMBER_CONFIRMED',
      householdSizeDelta: -1,
      priorState: 'ACTIVE',
      newState: 'ACTIVE'
    };
    try {
      await this.registry.apply(removal);
    } catch {
      await this.registry.apply({
        ...base,
        eventId: `ELIG-BRIDGE-CREATED-${item.caseId}`,
        eventType: 'BENEFICIARY_CREATED',
        reasonCode: 'DEMO_REGISTRY_ENSURE',
        householdSizeDelta: item.householdSize + 1,
        districtCode: 'MH-DEMO-01',
        newState: 'ACTIVE'
      });
      await this.registry.apply(removal);
    }
  }

  private replay(caseId: string, action: EligibilityCaseAction['action'], input: ActionInput): EligibilityCase | undefined {
    const previous = this.idempotency.get(input.idempotencyKey);
    if (!previous) return undefined;
    if (previous.fingerprint !== hash({ caseId, action, input })) {
      throw new ConflictException('Idempotency key was reused with different action content');
    }
    return structuredClone(previous.result);
  }

  private rememberScreening(id: string, fingerprint: string, result: ScreeningResult): ScreeningResult {
    const stored = structuredClone(result);
    this.screeningIdempotency.set(id, { fingerprint, result: stored });
    return structuredClone(stored);
  }

  private mustBeneficiary(id: string): EligibilityBeneficiary {
    const item = this.beneficiaries.get(id);
    if (!item) throw new NotFoundException(`Synthetic beneficiary ${id} was not found`);
    return item;
  }

  private mustCase(id: string): EligibilityCase {
    const item = this.cases.get(id);
    if (!item) throw new NotFoundException(`Eligibility case ${id} was not found`);
    return item;
  }

  private async refreshProofStatuses(): Promise<void> {
    const eventIds = [...this.cases.values()]
      .map((item) => item.proofEventId)
      .filter((eventId): eventId is string => Boolean(eventId));
    const statuses = await this.repository.loadProofStatuses(eventIds);
    const updates: Array<{
      caseId: string;
      proofEventId: string;
      proofStatus: EligibilityCase['proofStatus'];
    }> = [];
    for (const item of this.cases.values()) {
      if (item.proofEventId && statuses.has(item.proofEventId)) {
        const next = statuses.get(item.proofEventId)!;
        if (item.proofStatus !== next) {
          item.proofStatus = next;
          updates.push({
            caseId: item.caseId,
            proofEventId: item.proofEventId,
            proofStatus: next
          });
        }
      }
    }
    if (updates.length > 0) {
      await this.repository.syncProofStatuses(updates);
    }
  }
}
