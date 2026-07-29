import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EligibilitySummary } from '@pds/shared-types';

const summary: EligibilitySummary = {
  simulationOnly: true,
  policyId: 'MH-PANEL-DEMO-2026-V1',
  service: { status: 'HEALTHY', lastSuccessfulCallAt: '2026-07-23T00:00:00Z', latencyMs: 18 },
  statusCounts: { DEATH_MATCH_REVIEW: 1 },
  openCases: 1, decisions: 0, appeals: 0, reversals: 0, quarantined: 0,
  planningImpact: {
    simulationOnly: true, baselineHouseholdMembers: 5, currentEligibleHouseholdMembers: 5,
    baselineMonthlyRiceKg: 25, currentMonthlyRiceKg: 25, allocationDeltaKg: 0,
    indicativeSubsidyRateInrPerKg: 30, indicativeMonthlySubsidyDeltaInr: 0
  },
  beneficiaries: [{
    demoBeneficiaryId: 'BEN-DEMO-001',
    fictionalName: 'Asha Patil (Fictional)',
    fictionalAddress: 'House 12, Village Demo-Haveli, Tehsil Haveli, Demo District',
    maskedCardRef: 'RC-DEMO-***001',
    demoAadhaarNumber: '999988880001',
    demoMobileNumber: '9000080001',
    aadhaarRefHash: 'aadhaar-ref-demo-001-hash',
    subjectRefHash: 'beneficiary-demo-001-hash',
    rationCardHash: 'ration-card-demo-001-hash',
    householdSize: 5,
    monthlyRiceEntitlementKg: 25,
    alreadyLiftedKg: 0,
    fpsId: 'FPS-101',
    blockName: 'Haveli',
    tehsilName: 'Haveli',
    eligibilityStatus: 'ELIGIBLE',
    familyMembers: [
      {
        fictionalName: 'Asha Patil (Fictional)',
        relation: 'Head',
        ageYears: 42,
        demoAadhaarNumber: '999988880001',
        demoMobileNumber: '9000080001'
      },
      { fictionalName: 'Ramesh Patil (Fictional)', relation: 'Spouse', ageYears: 45, demoAadhaarNumber: '999988880011' }
    ]
  }, {
    demoBeneficiaryId: 'BEN-DEMO-002',
    fictionalName: 'Ravi Shinde (Fictional)',
    fictionalAddress: 'House 8, Village Demo-Mulshi, Tehsil Mulshi, Demo District',
    maskedCardRef: 'RC-DEMO-***002',
    demoAadhaarNumber: '999988880002',
    demoMobileNumber: '9000080002',
    aadhaarRefHash: 'aadhaar-ref-demo-002-hash',
    subjectRefHash: 'beneficiary-demo-002-hash',
    rationCardHash: 'ration-card-demo-002-hash',
    householdSize: 4,
    monthlyRiceEntitlementKg: 20,
    alreadyLiftedKg: 0,
    fpsId: 'FPS-101',
    blockName: 'Mulshi',
    tehsilName: 'Mulshi',
    eligibilityStatus: 'ELIGIBLE',
    familyMembers: []
  }]
};

const screening = {
  screeningId: 'SCREEN-001', screeningRequestId: 'REQ-001', status: 'DEATH_MATCH_REVIEW' as const,
  signals: [{ source: 'DEATH_REGISTRY' as const, status: 'MATCH' as const, risk: 'HIGH' as const, observedAt: '2026-07-23T00:00:00Z', factCode: 'ONE_MEMBER_POSSIBLE_MATCH' }],
  recommendedReviewAction: 'VERIFY_MEMBER',
  policy: { policyId: 'MH-PANEL-DEMO-2026-V1' as const, simulationOnly: true as const, ruleIds: ['DEATH-01'] },
  assessedAt: '2026-07-23T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
  evidenceDigest: 'a'.repeat(64), responseAttestationHash: 'b'.repeat(64), schemaVersion: '1.0' as const,
  integrityScore: 40,
  scoreBreakdown: [{
    ruleId: 'SCORE-DEATH-HIGH',
    signalFactCode: 'ONE_MEMBER_POSSIBLE_MATCH',
    weight: 40,
    contribution: 40,
    rationaleCode: 'DEATH_REGISTRY_MATCH_HIGH'
  }]
};
const openCase = {
  caseId: 'ELIG-CASE-001', demoBeneficiaryId: 'BEN-DEMO-001',
  subjectRefHash: 'beneficiary-demo-001-hash', rationCardHash: 'ration-card-demo-001-hash',
  screening, state: 'OPEN' as const, version: 1, rcmsStatus: 'ACTIVE' as const,
  entitlementBlocked: false, householdSize: 5, monthlyRiceEntitlementKg: 25,
  alreadyLiftedKg: 0, proofStatus: 'NOT_REQUIRED' as const, history: [],
  updatedAt: '2026-07-23T00:00:00Z'
};

const api = vi.hoisted(() => ({
  loadEligibilitySummary: vi.fn(),
  loadEligibilityCases: vi.fn(),
  loadBeneficiaryRegistrySummary: vi.fn(),
  runEligibilityScreening: vi.fn(),
  performEligibilityAction: vi.fn(),
  checkEligibilityGate: vi.fn(),
  submitBeneficiaryLifecycleEvent: vi.fn(),
  removeBeneficiaries: vi.fn()
}));
const context = vi.hoisted(() => ({ role: 'CONTROL_OFFICE' }));

vi.mock('@/api.js', () => api);
vi.mock('@/data-source.js', () => ({ getDataSourceMode: () => 'api' }));
vi.mock('@/hooks/use-workspace-context.js', () => ({ useWorkspaceContext: () => context }));

import { EligibilityReviewPage } from '@/pages/workspace/EligibilityReviewPage.js';

beforeEach(() => {
  vi.clearAllMocks();
  context.role = 'CONTROL_OFFICE';
  api.loadEligibilitySummary.mockResolvedValue(summary);
  api.loadEligibilityCases.mockResolvedValue([]);
  api.loadBeneficiaryRegistrySummary.mockResolvedValue({
    activeRecords: 0, activeHouseholdMembers: 0, lifecycleEvents: 0, pendingProofs: 0,
    byEventType: {}, projections: []
  });
  api.runEligibilityScreening.mockResolvedValue({ screening, case: null, entitlementPreserved: true });
  api.performEligibilityAction.mockResolvedValue({
    ...openCase, state: 'NOTICE_ISSUED', version: 2
  });
  api.checkEligibilityGate.mockResolvedValue({
    allowed: true, rcmsStatus: 'ACTIVE', monthlyEntitlementKg: 25,
    alreadyLiftedKg: 0, availableBalanceKg: 25, reason: 'ELIGIBLE'
  });
  api.removeBeneficiaries.mockResolvedValue({
    simulationOnly: true,
    idempotencyKey: 'WEB-REMOVAL-TEST',
    results: []
  });
});

describe('eligibility review workspace', () => {
  it('runs external screening and renders source evidence and attestation separately', async () => {
    const user = userEvent.setup();
    render(<EligibilityReviewPage />);
    expect(await screen.findAllByText('Asha Patil (Fictional)')).not.toHaveLength(0);
    expect(screen.getByText('Registry lifecycle')).toBeInTheDocument();
    expect(screen.getByText('Planning impact · simulation')).toBeInTheDocument();
    expect(screen.getByText(/Household profile/)).toBeInTheDocument();
    expect(screen.getAllByText(/9999-8888-0001/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/90000 80001/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Mock OTP inbox|Simulated AePDS OTP/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Register lifecycle record' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Run external eligibility check' }));
    expect(await screen.findByText('DEATH_REGISTRY')).toBeInTheDocument();
    expect(screen.getByText(/Integrity score 40\/100/)).toBeInTheDocument();
    expect(screen.getByText(/Explainability \(signal → rule → score\)/)).toBeInTheDocument();
    expect(screen.getByText('SCORE-DEATH-HIGH')).toBeInTheDocument();
    expect(screen.getByText(/Evidence a{64}/)).toBeInTheDocument();
    expect(screen.getByText(/Signals open human review/)).toBeInTheDocument();
  });

  it('shows entitlement gate behavior and preserves a dependency failure warning', async () => {
    const user = userEvent.setup();
    api.runEligibilityScreening.mockRejectedValueOnce(new Error('Eligibility service timed out'));
    render(<EligibilityReviewPage />);
    expect(await screen.findAllByText('Asha Patil (Fictional)')).not.toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Run external eligibility check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/entitlement remains unchanged/i);
    await user.click(screen.getByRole('button', { name: 'Entitlement gate check' }));
    expect(await screen.findByText(/Distribution allowed/)).toBeInTheDocument();
  });

  it('offers only state-valid guided case actions and submits the optimistic version', async () => {
    const user = userEvent.setup();
    api.loadEligibilityCases.mockResolvedValueOnce([openCase]);
    render(<EligibilityReviewPage />);
    await screen.findByText('Guided case actions · OPEN');
    expect(screen.queryByRole('button', { name: 'Authorize cancellation' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Issue notice' }));
    expect(api.performEligibilityAction).toHaveBeenCalledWith(
      'ELIG-CASE-001',
      'notice',
      expect.objectContaining({ expectedVersion: 1, outcomeCode: 'ISSUED' })
    );
  });

  it('keeps Record verification available after Issue notice', async () => {
    api.loadEligibilityCases.mockResolvedValueOnce([{ ...openCase, state: 'NOTICE_ISSUED', version: 2 }]);
    render(<EligibilityReviewPage />);
    await screen.findByText('Guided case actions · NOTICE_ISSUED');
    expect(screen.getByRole('button', { name: 'Record verification' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Recommend ineligible' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Issue notice' })).not.toBeInTheDocument();
  });

  it('removes multiple selected beneficiaries with the chosen reason', async () => {
    const user = userEvent.setup();
    render(<EligibilityReviewPage />);
    expect(await screen.findAllByText('Asha Patil (Fictional)')).not.toHaveLength(0);

    const removeButton = screen.getByRole('button', { name: /Remove selected \(0\)/ });
    expect(removeButton).toBeDisabled();

    await user.click(screen.getByLabelText('Select BEN-DEMO-001 for removal'));
    await user.click(screen.getByLabelText('Select BEN-DEMO-002 for removal'));
    await user.selectOptions(screen.getByLabelText('Removal reason'), 'FRAUD_CONFIRMED');
    await user.click(screen.getByRole('button', { name: /Remove selected \(2\)/ }));

    expect(api.removeBeneficiaries).toHaveBeenCalledWith(
      ['BEN-DEMO-001', 'BEN-DEMO-002'],
      'FRAUD_CONFIRMED',
      expect.stringMatching(/^WEB-REMOVAL-/)
    );
  });

  it('marks removed beneficiaries and blocks re-selecting them', async () => {
    api.loadEligibilitySummary.mockResolvedValue({
      ...summary,
      beneficiaries: [
        summary.beneficiaries[0],
        {
          ...summary.beneficiaries[1],
          eligibilityStatus: 'CANCELLED' as const,
          removal: {
            reasonCode: 'VOLUNTARY_SURRENDER' as const,
            source: 'BENEFICIARY_SURRENDER' as const,
            removedAt: '2026-07-29T10:00:00Z',
            removedBy: 'beneficiary-demo-002-hash'
          }
        }
      ]
    });
    render(<EligibilityReviewPage />);
    expect(await screen.findByText('REMOVED')).toBeInTheDocument();
    expect(screen.getByText('Card surrendered')).toBeInTheDocument();
    expect(screen.getByLabelText('Select BEN-DEMO-002 for removal')).toBeDisabled();
  });

  it.each(['MANAGEMENT', 'AUDITOR'])('is read-only for %s', async (role) => {
    context.role = role;
    render(<EligibilityReviewPage />);
    expect(await screen.findByRole('button', { name: 'Run external eligibility check' })).toBeDisabled();
    expect(screen.getByText('Management and Auditor views are read-only.')).toBeInTheDocument();
  });
});
