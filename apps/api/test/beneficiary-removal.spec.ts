import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EligibilityScreeningAdapter } from '../src/modules/eligibility/eligibility-client.js';
import { EligibilityClient } from '../src/modules/eligibility/eligibility-client.js';
import { EligibilityRepository } from '../src/modules/eligibility/eligibility.repository.js';
import { EligibilityService } from '../src/modules/eligibility/eligibility.service.js';
import { clearEligibilityGates, getEligibilityGate } from '../src/modules/eligibility/eligibility-gate.js';
import { BeneficiaryRegistryRepository } from '../src/modules/beneficiary-registry/beneficiary-registry.repository.js';
import { BeneficiaryRegistryService } from '../src/modules/beneficiary-registry/beneficiary-registry.service.js';

const priorPersistence = process.env.PDS_PERSISTENCE_BACKEND;
const priorDsn = process.env.PDS_POSTGRES_DSN;

beforeEach(() => {
  delete process.env.PDS_PERSISTENCE_BACKEND;
  delete process.env.PDS_POSTGRES_DSN;
});

afterEach(() => {
  if (priorPersistence === undefined) delete process.env.PDS_PERSISTENCE_BACKEND;
  else process.env.PDS_PERSISTENCE_BACKEND = priorPersistence;
  if (priorDsn === undefined) delete process.env.PDS_POSTGRES_DSN;
  else process.env.PDS_POSTGRES_DSN = priorDsn;
  clearEligibilityGates();
});

const createService = () => {
  clearEligibilityGates();
  const adapter: EligibilityScreeningAdapter = {
    health: vi.fn().mockResolvedValue(true),
    screen: vi.fn()
  };
  const registry = new BeneficiaryRegistryService(new BeneficiaryRegistryRepository());
  const service = new EligibilityService(new EligibilityClient(adapter), new EligibilityRepository(), registry);
  return { service, registry };
};

/**
 * Officer bulk removal of fraud-confirmed beneficiaries and voluntary card
 * surrender: the beneficiary leaves the active list (CANCELLED), the FPS
 * entitlement gate blocks issuance, and a privacy-safe RECORD_DEACTIVATED
 * lifecycle proof is queued in the beneficiary registry.
 */
describe('beneficiary removal from the active list', () => {
  it('removes multiple selected beneficiaries, blocks their entitlement gates, and records registry deactivations', async () => {
    const { service, registry } = createService();
    const response = await service.removeBeneficiaries(
      { idempotencyKey: 'REMOVE-BULK-1', reasonCode: 'FRAUD_CONFIRMED', demoBeneficiaryIds: ['BEN-DEMO-002', 'BEN-DEMO-003'] },
      'officer-demo-1',
      'DEPARTMENT_ACTION'
    );

    expect(response.results).toHaveLength(2);
    for (const result of response.results) {
      expect(result.disposition).toBe('REMOVED');
      expect(result.eligibilityStatus).toBe('CANCELLED');
      expect(result.removal.reasonCode).toBe('FRAUD_CONFIRMED');
      expect(result.removal.source).toBe('DEPARTMENT_ACTION');
      expect(result.removal.removedBy).toBe('officer-demo-1');
      expect(result.removal.registryProofEventId).toMatch(/^BEN-LIFECYCLE-/);
    }

    for (const id of ['BEN-DEMO-002', 'BEN-DEMO-003']) {
      const beneficiary = service.getBeneficiary(id);
      expect(beneficiary.eligibilityStatus).toBe('CANCELLED');
      expect(beneficiary.removal?.reasonCode).toBe('FRAUD_CONFIRMED');
      expect(getEligibilityGate(beneficiary.rationCardHash)).toMatchObject({ blocked: true, rcmsStatus: 'CANCELLED' });
      expect(service.gate(id, 1).allowed).toBe(false);
    }

    const registrySummary = await registry.summary();
    const deactivated = registrySummary.projections.filter((item) => item.state === 'DEACTIVATED');
    expect(deactivated).toHaveLength(2);
    expect(registrySummary.byEventType.RECORD_DEACTIVATED).toBe(2);

    // Removed beneficiaries leave the planning-impact "current" totals.
    const summary = await service.summary();
    expect(summary.planningImpact.allocationDeltaKg).toBeLessThan(0);
    const removed = summary.beneficiaries.filter((item) => item.removal);
    expect(removed.map((item) => item.demoBeneficiaryId).sort()).toEqual(['BEN-DEMO-002', 'BEN-DEMO-003']);
  });

  it('never places raw identity in the registry deactivation record', async () => {
    const { service, registry } = createService();
    await service.removeBeneficiaries(
      { idempotencyKey: 'REMOVE-PRIVACY-1', reasonCode: 'FRAUD_CONFIRMED', demoBeneficiaryIds: ['BEN-DEMO-002'] },
      'officer-demo-1',
      'DEPARTMENT_ACTION'
    );
    const beneficiary = service.getBeneficiary('BEN-DEMO-002');
    const serialized = JSON.stringify(await registry.summary());
    expect(serialized).not.toContain(beneficiary.fictionalName);
    if (beneficiary.demoAadhaarNumber) expect(serialized).not.toContain(beneficiary.demoAadhaarNumber);
    if (beneficiary.demoMobileNumber) expect(serialized).not.toContain(beneficiary.demoMobileNumber);
  });

  it('replays identical removals and rejects conflicting idempotency-key reuse', async () => {
    const { service } = createService();
    const input = {
      idempotencyKey: 'REMOVE-REPLAY-1',
      reasonCode: 'FRAUD_CONFIRMED' as const,
      demoBeneficiaryIds: ['BEN-DEMO-002']
    };
    const first = await service.removeBeneficiaries(input, 'officer-demo-1', 'DEPARTMENT_ACTION');
    const replay = await service.removeBeneficiaries(input, 'officer-demo-1', 'DEPARTMENT_ACTION');
    expect(replay).toEqual(first);

    await expect(service.removeBeneficiaries(
      { ...input, demoBeneficiaryIds: ['BEN-DEMO-003'] },
      'officer-demo-1',
      'DEPARTMENT_ACTION'
    )).rejects.toMatchObject({ status: 409 });
  });

  it('reports ALREADY_REMOVED instead of double-removing', async () => {
    const { service } = createService();
    await service.removeBeneficiaries(
      { idempotencyKey: 'REMOVE-FIRST-1', reasonCode: 'FRAUD_CONFIRMED', demoBeneficiaryIds: ['BEN-DEMO-002'] },
      'officer-demo-1',
      'DEPARTMENT_ACTION'
    );
    const second = await service.removeBeneficiaries(
      { idempotencyKey: 'REMOVE-SECOND-1', reasonCode: 'DUPLICATE_RECORD', demoBeneficiaryIds: ['BEN-DEMO-002'] },
      'officer-demo-2',
      'DEPARTMENT_ACTION'
    );
    expect(second.results[0]?.disposition).toBe('ALREADY_REMOVED');
    // Original removal record is preserved, not overwritten.
    expect(second.results[0]?.removal.reasonCode).toBe('FRAUD_CONFIRMED');
    expect(second.results[0]?.removal.removedBy).toBe('officer-demo-1');
  });

  it('validates inputs and leaves state untouched when any target is unknown', async () => {
    const { service } = createService();
    await expect(service.removeBeneficiaries(
      { idempotencyKey: 'REMOVE-EMPTY-1', reasonCode: 'FRAUD_CONFIRMED', demoBeneficiaryIds: [] },
      'officer-demo-1',
      'DEPARTMENT_ACTION'
    )).rejects.toMatchObject({ status: 400 });

    await expect(service.removeBeneficiaries(
      { idempotencyKey: 'REMOVE-UNKNOWN-1', reasonCode: 'FRAUD_CONFIRMED', demoBeneficiaryIds: ['BEN-DEMO-002', 'BEN-MISSING-999'] },
      'officer-demo-1',
      'DEPARTMENT_ACTION'
    )).rejects.toMatchObject({ status: 404 });
    expect(service.getBeneficiary('BEN-DEMO-002').eligibilityStatus).not.toBe('CANCELLED');
  });

  it('supports voluntary surrender as a removal source and reset restores the seed list', async () => {
    const { service } = createService();
    const beneficiary = service.getBeneficiary('BEN-DEMO-002');
    const response = await service.removeBeneficiaries(
      { idempotencyKey: 'CITIZEN-SURRENDER-BEN-DEMO-002', reasonCode: 'VOLUNTARY_SURRENDER', demoBeneficiaryIds: ['BEN-DEMO-002'] },
      beneficiary.subjectRefHash,
      'BENEFICIARY_SURRENDER'
    );
    expect(response.results[0]?.removal.source).toBe('BENEFICIARY_SURRENDER');
    expect(response.results[0]?.removal.removedBy).toBe(beneficiary.subjectRefHash);

    service.reset();
    const restored = service.getBeneficiary('BEN-DEMO-002');
    expect(restored.eligibilityStatus).toBe('ELIGIBLE');
    expect(restored.removal).toBeUndefined();
  });
});
