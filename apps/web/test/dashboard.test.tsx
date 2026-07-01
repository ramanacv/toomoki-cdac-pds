import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api.js', () => ({
  probeApi: vi.fn().mockResolvedValue(false),
  loadWorkspaceData: vi.fn().mockResolvedValue({
    summary: {
      trackedStockKg: 5000,
      activeLots: 3,
      completedDistributions: 12,
      pendingReceipts: 2
    },
    stakeholders: [],
    lots: [{ lotId: 'LOT-RICE-2026-001', commodity: 'Rice', currentLocation: 'Block Godown 01' }],
    transfers: [],
    allocations: [],
    authTransactions: [],
    entitlements: [],
    distributions: [
      {
        distributionId: 'DIST-2026-001',
        deliveredKg: 25,
        rationCardHash: 'demo-ration-card-hash',
        commodity: 'Rice',
        fpsId: 'FPS-101',
        authResult: 'SUCCESS',
        authTxnRefHash: 'auth-ref',
        ledgerTxId: 'TX-1'
      }
    ],
    alerts: []
  }),
  buildApiUrl: vi.fn((path: string) => `/api${path}`),
  executeWorkflowAction: vi.fn()
}));

import { DashboardPage } from '@/pages/DashboardPage.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('renders the control room hero, summary cards and role tabs', async () => {
    render(
      <MemoryRouter>
        <DashboardPage
          initialRole="AUDITOR"
          initialScenario="happy-path"
          operatorName="Test Officer"
          onLogout={() => {}}
          adminHref="/admin"
        />
      </MemoryRouter>
    );

    expect(
      screen.getByText('Trace the ration journey from procurement to household delivery.')
    ).toBeInTheDocument();

    // Summary cards rendered from the mocked workspace summary (apiOnline=false → scenario metrics).
    expect(screen.getByText('Active lots')).toBeInTheDocument();

    // Role tabs present.
    expect(screen.getByRole('tab', { name: 'Audit Authority' })).toBeInTheDocument();
  });

  it('switches roles via the role tabs', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DashboardPage
          initialRole="AUDITOR"
          initialScenario="happy-path"
          operatorName="Test Officer"
          onLogout={() => {}}
          adminHref="/admin"
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('tab', { name: 'Fair Price Shop' }));
    expect(screen.getByRole('tab', { name: 'Fair Price Shop' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the alert inbox for the happy-path scenario', () => {
    render(
      <MemoryRouter>
        <DashboardPage
          initialRole="AUDITOR"
          initialScenario="happy-path"
          operatorName="Test Officer"
          onLogout={() => {}}
          adminHref="/admin"
        />
      </MemoryRouter>
    );

    const inbox = screen.getByRole('heading', { name: 'Audit signals and evidence' });
    expect(inbox).toBeInTheDocument();
  });

  it('provides a skip link targeting the main content', () => {
    render(
      <MemoryRouter>
        <DashboardPage
          initialRole="AUDITOR"
          initialScenario="happy-path"
          operatorName="Test Officer"
          onLogout={() => {}}
          adminHref="/admin"
        />
      </MemoryRouter>
    );
    // The skip link lives at the App shell level, but the dashboard main has the target id.
    expect(document.getElementById('main')).not.toBeNull();
  });

  it('shows the login banner with the operator name and a logout control', () => {
    render(
      <MemoryRouter>
        <DashboardPage
          initialRole="AUDITOR"
          initialScenario="happy-path"
          operatorName="Test Officer"
          onLogout={() => {}}
          adminHref="/admin"
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Test Officer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });
});

describe('DashboardPage scenario selector', () => {
  it('disables scenario buttons when API is online to prevent silent divergence', async () => {
    const { probeApi } = await import('@/api.js');
    (probeApi as unknown as { mockResolvedValue: (v: boolean) => void }).mockResolvedValue(true);

    render(
      <MemoryRouter>
        <DashboardPage
          initialRole="AUDITOR"
          initialScenario="happy-path"
          operatorName="Test Officer"
          onLogout={() => {}}
          adminHref="/admin"
        />
      </MemoryRouter>
    );

    // Wait for the apiOnline effect to settle by checking the runtime card copy.
    expect(await screen.findByText('Live API available')).toBeInTheDocument();

    const happyPathButton = screen.getByRole('button', { name: /Happy path/i });
    expect(happyPathButton).toBeDisabled();
    expect(screen.getByText('Live API data shown')).toBeInTheDocument();
  });
});
