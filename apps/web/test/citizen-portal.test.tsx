import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const profile = {
  simulationOnly: true as const,
  demoBeneficiaryId: 'BEN-DEMO-001',
  fictionalName: 'Asha Patil (Fictional)',
  maskedCardRef: 'RC-DEMO-***001',
  maskedAadhaar: 'XXXX-XXXX-0001',
  maskedMobile: 'XXXXXX0001',
  fpsId: 'FPS-101',
  blockName: 'Haveli',
  tehsilName: 'Haveli',
  householdSize: 5,
  eligibility: {
    status: 'ELIGIBLE',
    monthlyRiceEntitlementKg: 25,
    alreadyLiftedKg: 5,
    availableBalanceKg: 20
  },
  familyMembers: [
    { fictionalName: 'Asha Patil (Fictional)', relation: 'Head', ageYears: 42, maskedAadhaar: 'XXXX-XXXX-0001' },
    { fictionalName: 'Ramesh Patil (Fictional)', relation: 'Spouse', ageYears: 45, maskedAadhaar: 'XXXX-XXXX-0011' }
  ]
};

const distribution = {
  distributionId: 'DIST-CITIZEN-001',
  fpsId: 'FPS-101',
  commodity: 'Rice',
  deliveredKg: 5,
  authMode: 'MOCK_OTP',
  authResult: 'SUCCESS',
  timestamp: '2026-07-29T10:00:00Z',
  ledgerTxId: 'tx-dist-1',
  proofStatus: 'COMMITTED',
  fabricTxId: 'fabric-abc123'
};

const citizenApi = vi.hoisted(() => ({
  requestCitizenOtp: vi.fn(),
  verifyCitizenOtp: vi.fn(),
  fetchCitizenProfile: vi.fn(),
  fetchCitizenDistributions: vi.fn(),
  fetchCitizenAuthHistory: vi.fn(),
  getCitizenSession: vi.fn(),
  setCitizenSession: vi.fn(),
  clearCitizenSession: vi.fn(),
  citizenLogout: vi.fn(),
  surrenderCitizenCard: vi.fn()
}));

vi.mock('@/citizen-api.js', () => citizenApi);

import { CitizenPortalPage } from '@/pages/citizen/CitizenPortalPage.js';

const renderPage = () =>
  render(
    <MemoryRouter>
      <CitizenPortalPage />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  citizenApi.getCitizenSession.mockReturnValue(null);
  citizenApi.requestCitizenOtp.mockResolvedValue({
    simulationOnly: true,
    challengeId: 'challenge-1',
    maskedMobile: 'XXXXXX0001',
    otpExpiresInSeconds: 300,
    demoOtpHint: '123456'
  });
  citizenApi.verifyCitizenOtp.mockResolvedValue({ sessionToken: 'session-1', profile });
  citizenApi.fetchCitizenProfile.mockResolvedValue(profile);
  citizenApi.fetchCitizenDistributions.mockResolvedValue([distribution]);
  citizenApi.fetchCitizenAuthHistory.mockResolvedValue([]);
  citizenApi.citizenLogout.mockResolvedValue(undefined);
  citizenApi.surrenderCitizenCard.mockResolvedValue({
    simulationOnly: true,
    disposition: 'REMOVED',
    profile: {
      ...profile,
      eligibility: { ...profile.eligibility, status: 'CANCELLED' },
      removal: {
        reasonCode: 'VOLUNTARY_SURRENDER',
        source: 'BENEFICIARY_SURRENDER',
        removedAt: '2026-07-29T12:00:00Z'
      }
    }
  });
});

describe('citizen self-service portal', () => {
  it('shows the simulation boundary and synthetic-only warning on the login step', () => {
    renderPage();
    expect(screen.getByText(/Simulation only/)).toBeInTheDocument();
    expect(screen.getByText(/Never enter a real Aadhaar number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Demo Aadhaar number/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Affected demo beneficiary/ })).toBeInTheDocument();
    expect(screen.getAllByText('123456').length).toBeGreaterThan(2);
    expect(screen.getByText('Nandita Salve (Fictional)')).toBeInTheDocument();
  });

  it('walks through Aadhaar → OTP → dashboard and shows masked data with proof status', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Demo Aadhaar number/), '999988880001');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));

    expect(await screen.findByText(/XXXXXX0001/)).toBeInTheDocument();
    expect(screen.getByText('123456')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/One-time password/), '123456');
    await user.click(screen.getByRole('button', { name: /Verify & sign in/ }));

    expect((await screen.findAllByText('Asha Patil (Fictional)')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('XXXX-XXXX-0001').length).toBeGreaterThan(0);
    expect(screen.getByText(/25 kg/)).toBeInTheDocument();
    expect(screen.getByText(/20 kg/)).toBeInTheDocument();
    expect(screen.getByText('COMMITTED')).toBeInTheDocument();
    expect(screen.getByText('fabric-abc123')).toBeInTheDocument();
    // Full synthetic identifiers never appear.
    expect(screen.queryByText('999988880001')).not.toBeInTheDocument();
    expect(screen.queryByText('9000080001')).not.toBeInTheDocument();
  });

  it('requires the typed confirmation before surrendering and then shows the removed state', async () => {
    const user = userEvent.setup();
    citizenApi.getCitizenSession.mockReturnValue('session-1');
    renderPage();

    expect(await screen.findByText('Surrender my ration card')).toBeInTheDocument();
    const surrenderButton = screen.getByRole('button', { name: 'Surrender card' });
    expect(surrenderButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Type SURRENDER to confirm/), 'SURRENDER');
    expect(surrenderButton).toBeEnabled();
    await user.click(surrenderButton);

    expect(citizenApi.surrenderCitizenCard).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent(/surrendered and removed from the active beneficiary list/);
    // Surrender panel is gone once the card is removed.
    expect(screen.queryByText('Surrender my ration card')).not.toBeInTheDocument();
  });

  it('shows the department-removal notice for a removed card without a surrender panel', async () => {
    citizenApi.getCitizenSession.mockReturnValue('session-1');
    citizenApi.fetchCitizenProfile.mockResolvedValue({
      ...profile,
      eligibility: { ...profile.eligibility, status: 'CANCELLED' },
      removal: {
        reasonCode: 'FRAUD_CONFIRMED',
        source: 'DEPARTMENT_ACTION',
        removedAt: '2026-07-29T12:00:00Z'
      }
    });
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent(/removed from the active beneficiary list by the department/);
    expect(screen.getByRole('status')).toHaveTextContent(/Reason: Fraud confirmed after departmental verification/);
    expect(screen.queryByText('Surrender my ration card')).not.toBeInTheDocument();
  });

  it('shows the case-based ineligibility notification and appeal guidance', async () => {
    citizenApi.getCitizenSession.mockReturnValue('session-1');
    citizenApi.fetchCitizenProfile.mockResolvedValue({
      ...profile,
      eligibility: { ...profile.eligibility, status: 'CANCELLED', availableBalanceKg: 0 },
      statusNotification: {
        title: 'Your ration card status has changed',
        reason: 'Death-registry match confirmed after departmental review.',
        message: 'The department marked this demo ration card ineligible after completing review of a death-registry match.',
        effectiveAt: '2026-07-29T12:00:00Z',
        caseId: 'ELIG-CASE-001',
        appealMessage: 'Contact the DSO/RCMS help desk to request review or lodge an appeal in this simulation.'
      }
    });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/ration card status has changed/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/Reason: Death-registry match confirmed/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/death-registry match/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/lodge an appeal/i);
    expect(screen.queryByText('Surrender my ration card')).not.toBeInTheDocument();
  });

  it('surfaces API rejections such as the synthetic-only guard', async () => {
    const user = userEvent.setup();
    citizenApi.requestCitizenOtp.mockRejectedValue(
      new Error('This simulation accepts only synthetic demo Aadhaar numbers (starting 9999). Never enter a real Aadhaar number.')
    );
    renderPage();

    await user.type(screen.getByLabelText(/Demo Aadhaar number/), '234512341234');
    await user.click(screen.getByRole('button', { name: 'Get OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/synthetic demo Aadhaar/);
  });
});
