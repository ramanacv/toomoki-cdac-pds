import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AuthTransaction,
  BeneficiaryRemovalRecord,
  DistributionTransaction,
  EligibilityBeneficiary
} from '@pds/shared-types';
import { eligibilityBeneficiaries } from '@pds/fixtures';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import { EligibilityService } from '../eligibility/eligibility.service.js';
import { ProofsService } from '../proofs/proofs.service.js';

/**
 * Simulated citizen/beneficiary self-service portal.
 *
 * Models the public login journey of the J&K and Maharashtra RCMS portals
 * (rcms.jk.gov.in / rcms.mahafood.gov.in): a beneficiary signs in with an
 * Aadhaar number and an OTP delivered to the Aadhaar-seeded mobile of the
 * head of family.
 *
 * Simulation boundary (do not weaken):
 * - Only the synthetic demo Aadhaar range (9999 8888 XXXX) is accepted.
 *   Anything else is rejected before any lookup, and the submitted value is
 *   never echoed, logged, or persisted. ViksitPDS is not a UIDAI AUA and
 *   must never receive real Aadhaar numbers.
 * - The OTP is a fixed, openly displayed demo value; there is no real SMS.
 * - All returned identity data is fictional fixture data already used by the
 *   eligibility demo module.
 */

export const CITIZEN_DEMO_OTP = '123456';
const SYNTHETIC_AADHAAR_PREFIX = '9999';
const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 60_000;
const MAX_OTP_ATTEMPTS = 5;
const OTP_REQUESTS_PER_MINUTE_PER_IP = 10;
const HISTORY_LIMIT = 25;

type CitizenChallenge = {
  challengeId: string;
  demoBeneficiaryId: string;
  expiresAtMs: number;
  attemptsRemaining: number;
};

type CitizenSession = {
  demoBeneficiaryId: string;
  expiresAtMs: number;
};

export type CitizenOtpChallengeResponse = {
  simulationOnly: true;
  challengeId: string;
  maskedMobile: string;
  otpExpiresInSeconds: number;
  /** Demo-only: a real deployment sends the OTP by SMS via the state system. */
  demoOtpHint: string;
};

export type CitizenProfileResponse = {
  simulationOnly: true;
  demoBeneficiaryId: string;
  fictionalName: string;
  maskedCardRef: string;
  maskedAadhaar: string;
  maskedMobile: string;
  fpsId: string;
  blockName: string;
  tehsilName: string;
  householdSize: number;
  eligibility: {
    status: string;
    monthlyRiceEntitlementKg: number;
    alreadyLiftedKg: number;
    availableBalanceKg: number;
  };
  familyMembers: Array<{
    fictionalName: string;
    relation: string;
    ageYears: number;
    maskedAadhaar?: string;
  }>;
  /** Present when the card was surrendered or removed from the active list. */
  removal?: BeneficiaryRemovalRecord;
};

export type CitizenDistributionEntry = {
  distributionId: string;
  fpsId: string;
  commodity: string;
  deliveredKg: number;
  authMode: string;
  authResult: string;
  timestamp: string;
  ledgerTxId?: string;
  proofStatus?: string;
  fabricTxId?: string;
};

export type CitizenAuthHistoryEntry = {
  authTxnId: string;
  authMode: string;
  authResult: string;
  timestamp: string;
  fpsId?: string;
};

const maskDemoAadhaar = (value: string): string => `XXXX-XXXX-${value.slice(-4)}`;
const maskDemoMobile = (value: string): string => `XXXXXX${value.slice(-4)}`;

@Injectable()
export class BeneficiaryPortalService {
  private readonly challenges = new Map<string, CitizenChallenge>();
  private readonly sessions = new Map<string, CitizenSession>();
  private readonly otpRequestWindows = new Map<string, number[]>();

  constructor(
    @Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade,
    @Optional() @Inject(EligibilityService) private readonly eligibility?: EligibilityService,
    @Optional() @Inject(ProofsService) private readonly proofs?: ProofsService
  ) {}

  requestOtp(demoAadhaarNumber: string, requestIp?: string): CitizenOtpChallengeResponse {
    this.enforceOtpRequestLimit(requestIp ?? 'unknown');

    const submitted = demoAadhaarNumber.trim();
    if (!/^\d{12}$/.test(submitted)) {
      throw new BadRequestException('Enter the 12-digit demo Aadhaar number.');
    }
    if (!submitted.startsWith(SYNTHETIC_AADHAAR_PREFIX)) {
      // Reject before any lookup, and never echo or log the submitted value.
      throw new BadRequestException(
        'This simulation accepts only synthetic demo Aadhaar numbers (starting 9999). Never enter a real Aadhaar number.'
      );
    }

    const head = eligibilityBeneficiaries.find((item) => item.demoAadhaarNumber === submitted);
    if (!head) {
      const familyMatch = eligibilityBeneficiaries.some((item) =>
        item.familyMembers.some((member) => member.demoAadhaarNumber === submitted)
      );
      if (familyMatch) {
        throw new BadRequestException(
          'Sign in with the head-of-family demo Aadhaar number; the OTP is sent to the head of family, matching the state RCMS journey.'
        );
      }
      throw new NotFoundException('No demo beneficiary is registered for this synthetic Aadhaar number.');
    }

    const challengeId = randomUUID();
    this.challenges.set(challengeId, {
      challengeId,
      demoBeneficiaryId: head.demoBeneficiaryId,
      expiresAtMs: Date.now() + CHALLENGE_TTL_MS,
      attemptsRemaining: MAX_OTP_ATTEMPTS
    });

    return {
      simulationOnly: true,
      challengeId,
      maskedMobile: maskDemoMobile(head.demoMobileNumber),
      otpExpiresInSeconds: CHALLENGE_TTL_MS / 1000,
      demoOtpHint: CITIZEN_DEMO_OTP
    };
  }

  verifyOtp(challengeId: string, otp: string): { simulationOnly: true; sessionToken: string; sessionExpiresInSeconds: number; profile: CitizenProfileResponse } {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.expiresAtMs < Date.now()) {
      this.challenges.delete(challengeId);
      throw new UnauthorizedException('OTP challenge expired or not found. Request a new OTP.');
    }
    if (otp !== CITIZEN_DEMO_OTP) {
      challenge.attemptsRemaining -= 1;
      if (challenge.attemptsRemaining <= 0) {
        this.challenges.delete(challengeId);
        throw new UnauthorizedException('Too many incorrect OTP attempts. Request a new OTP.');
      }
      throw new UnauthorizedException('Incorrect OTP.');
    }
    this.challenges.delete(challengeId);

    const sessionToken = randomUUID();
    this.sessions.set(sessionToken, {
      demoBeneficiaryId: challenge.demoBeneficiaryId,
      expiresAtMs: Date.now() + SESSION_TTL_MS
    });

    return {
      simulationOnly: true,
      sessionToken,
      sessionExpiresInSeconds: SESSION_TTL_MS / 1000,
      profile: this.profileFor(challenge.demoBeneficiaryId)
    };
  }

  profile(sessionToken: string | undefined): CitizenProfileResponse {
    const session = this.requireSession(sessionToken);
    return this.profileFor(session.demoBeneficiaryId);
  }

  async distributions(sessionToken: string | undefined): Promise<{ simulationOnly: true; distributions: CitizenDistributionEntry[] }> {
    const session = this.requireSession(sessionToken);
    const beneficiary = this.mustBeneficiary(session.demoBeneficiaryId);
    const all = (await Promise.resolve(this.ledger.listDistributions())) as DistributionTransaction[];
    const own = all
      .filter((item) => item.rationCardHash === beneficiary.rationCardHash)
      .slice(-HISTORY_LIMIT)
      .reverse();

    const entries: CitizenDistributionEntry[] = [];
    for (const item of own) {
      let proofStatus: string | undefined;
      let fabricTxId: string | undefined;
      if (item.ledgerTxId && this.proofs) {
        try {
          const status = await this.proofs.getStatus(item.ledgerTxId, false);
          proofStatus = status.status;
          fabricTxId = status.fabricTxId;
        } catch {
          proofStatus = undefined;
        }
      }
      entries.push({
        distributionId: item.distributionId,
        fpsId: item.fpsId,
        commodity: item.commodity,
        deliveredKg: item.deliveredKg,
        authMode: item.authMode,
        authResult: item.authResult,
        timestamp: item.timestamp,
        ...(item.ledgerTxId ? { ledgerTxId: item.ledgerTxId } : {}),
        ...(proofStatus ? { proofStatus } : {}),
        ...(fabricTxId ? { fabricTxId } : {})
      });
    }
    return { simulationOnly: true, distributions: entries };
  }

  async authHistory(sessionToken: string | undefined): Promise<{ simulationOnly: true; authTransactions: CitizenAuthHistoryEntry[] }> {
    const session = this.requireSession(sessionToken);
    const beneficiary = this.mustBeneficiary(session.demoBeneficiaryId);
    const all = (await Promise.resolve(this.ledger.listAuthTransactions())) as AuthTransaction[];
    const own = all
      .filter((item) => item.rationCardHash === beneficiary.rationCardHash)
      .slice(-HISTORY_LIMIT)
      .reverse();
    return {
      simulationOnly: true,
      authTransactions: own.map((item) => ({
        authTxnId: item.authTxnId,
        authMode: item.authMode,
        authResult: item.authResult,
        timestamp: item.timestamp,
        ...(item.fpsId ? { fpsId: item.fpsId } : {})
      }))
    };
  }

  signOut(sessionToken: string | undefined): { signedOut: boolean } {
    if (sessionToken) this.sessions.delete(sessionToken);
    return { signedOut: true };
  }

  /**
   * Voluntary card surrender, mirroring the RCMS self-service journey: the
   * signed-in head of family surrenders the card and the household leaves the
   * active beneficiary list (status CANCELLED, entitlement gate blocked,
   * registry deactivation proof recorded). Repeat calls replay idempotently.
   */
  async surrender(
    sessionToken: string | undefined,
    confirmation: string
  ): Promise<{ simulationOnly: true; disposition: 'REMOVED' | 'ALREADY_REMOVED'; profile: CitizenProfileResponse }> {
    const session = this.requireSession(sessionToken);
    if (confirmation !== 'SURRENDER') {
      throw new BadRequestException('Type SURRENDER to confirm giving up this demo ration card.');
    }
    if (!this.eligibility) {
      throw new ServiceUnavailableException('Card surrender is not available in this configuration.');
    }
    const beneficiary = this.mustBeneficiary(session.demoBeneficiaryId);
    const result = await this.eligibility.removeBeneficiaries(
      {
        idempotencyKey: `CITIZEN-SURRENDER-${session.demoBeneficiaryId}`,
        reasonCode: 'VOLUNTARY_SURRENDER',
        demoBeneficiaryIds: [session.demoBeneficiaryId]
      },
      beneficiary.subjectRefHash,
      'BENEFICIARY_SURRENDER'
    );
    const outcome = result.results[0];
    return {
      simulationOnly: true,
      disposition: outcome?.disposition ?? 'ALREADY_REMOVED',
      profile: this.profileFor(session.demoBeneficiaryId)
    };
  }

  private profileFor(demoBeneficiaryId: string): CitizenProfileResponse {
    const beneficiary = this.mustBeneficiary(demoBeneficiaryId);

    let status: string = beneficiary.eligibilityStatus;
    let monthlyRiceEntitlementKg = beneficiary.monthlyRiceEntitlementKg;
    let alreadyLiftedKg = beneficiary.alreadyLiftedKg;
    let availableBalanceKg = Math.max(0, monthlyRiceEntitlementKg - alreadyLiftedKg);
    if (this.eligibility) {
      try {
        const gate = this.eligibility.gate(demoBeneficiaryId, 0);
        status = gate.rcmsStatus === 'ACTIVE' ? 'ELIGIBLE' : gate.rcmsStatus;
        monthlyRiceEntitlementKg = gate.monthlyEntitlementKg;
        alreadyLiftedKg = gate.alreadyLiftedKg;
        availableBalanceKg = gate.availableBalanceKg;
      } catch {
        // Keep fixture values when the eligibility module cannot resolve live state.
      }
    }

    return {
      simulationOnly: true,
      demoBeneficiaryId: beneficiary.demoBeneficiaryId,
      fictionalName: beneficiary.fictionalName,
      maskedCardRef: beneficiary.maskedCardRef,
      maskedAadhaar: maskDemoAadhaar(beneficiary.demoAadhaarNumber),
      maskedMobile: maskDemoMobile(beneficiary.demoMobileNumber),
      fpsId: beneficiary.fpsId,
      blockName: beneficiary.blockName,
      tehsilName: beneficiary.tehsilName,
      householdSize: beneficiary.householdSize,
      eligibility: { status, monthlyRiceEntitlementKg, alreadyLiftedKg, availableBalanceKg },
      familyMembers: beneficiary.familyMembers.map((member) => ({
        fictionalName: member.fictionalName,
        relation: member.relation,
        ageYears: member.ageYears,
        ...(member.demoAadhaarNumber ? { maskedAadhaar: maskDemoAadhaar(member.demoAadhaarNumber) } : {})
      })),
      ...(beneficiary.removal ? { removal: structuredClone(beneficiary.removal) } : {})
    };
  }

  /**
   * Prefers the live eligibility copy (carries case-driven status changes and
   * removal/surrender state); falls back to the static fixture.
   */
  private mustBeneficiary(demoBeneficiaryId: string): EligibilityBeneficiary {
    if (this.eligibility) {
      try {
        return this.eligibility.getBeneficiary(demoBeneficiaryId);
      } catch {
        // Fall through to the fixture lookup below.
      }
    }
    const beneficiary = eligibilityBeneficiaries.find((item) => item.demoBeneficiaryId === demoBeneficiaryId);
    if (!beneficiary) {
      throw new NotFoundException('Demo beneficiary not found.');
    }
    return beneficiary;
  }

  private requireSession(sessionToken: string | undefined): CitizenSession {
    if (!sessionToken) {
      throw new UnauthorizedException('Citizen session required. Sign in with the demo Aadhaar and OTP.');
    }
    const session = this.sessions.get(sessionToken);
    if (!session || session.expiresAtMs < Date.now()) {
      this.sessions.delete(sessionToken);
      throw new UnauthorizedException('Citizen session expired. Sign in again.');
    }
    return session;
  }

  private enforceOtpRequestLimit(requestIp: string): void {
    const now = Date.now();
    const active = (this.otpRequestWindows.get(requestIp) ?? []).filter((timestamp) => timestamp > now - 60_000);
    if (active.length >= OTP_REQUESTS_PER_MINUTE_PER_IP) {
      this.otpRequestWindows.set(requestIp, active);
      throw new HttpException('Too many OTP requests. Wait a minute and retry.', HttpStatus.TOO_MANY_REQUESTS);
    }
    active.push(now);
    this.otpRequestWindows.set(requestIp, active);
  }
}
