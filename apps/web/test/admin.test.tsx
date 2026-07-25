import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner.js';

const adminOverview = vi.hoisted(() => ({
  generatedAt: '2026-06-25T10:00:00.000Z',
  readOnly: true as const,
  dashboard: {
    trackedStockKg: 1000,
    activeLots: 1,
    completedDistributions: 1,
    pendingReceipts: 0
  },
  metrics: {
    stakeholders: 5,
    lots: 1,
    transfers: 3,
    allocations: 1,
    entitlements: 1,
    authTransactions: 1,
    distributions: 1,
    auditAlerts: 2,
    openAuditAlerts: 1,
    ledgerEvents: 9
  },
  network: {
    ledgerMode: 'demo' as const,
    persistenceBackend: 'file' as const,
    legacyBackendMode: 'demo',
    demo: {
      inProcessChaincode: true,
      worldStateSummary: {},
      statePath: '/tmp/state.json',
      journalPath: '/tmp/journal.json',
      chaincodeStatePath: '/tmp/cc.json'
    }
  },
  stakeholders: {
    byType: [{ stakeholderType: 'FCI', count: 1 }],
    byStatus: [{ status: 'ACTIVE', count: 5 }],
    fabricOrgMapping: []
  },
  activity: {
    recentEvents: [
      {
        ledgerTxId: 'TX-1',
        timestamp: '2026-06-09T10:00:00.000Z',
        eventType: 'LOT_CREATED',
        entityType: 'lot',
        entityId: 'LOT-RICE-2026-001'
      }
    ],
    eventCount: 9
  },
  auditAlerts: {
    total: 2,
    open: 1,
    byRiskLevel: { HIGH: 1, MEDIUM: 1 },
    recent: [
      {
        alertId: 'ALT-1',
        alertType: 'SHORT_RECEIPT',
        riskLevel: 'HIGH' as const,
        message: 'Short receipt detected',
        entityId: 'TR-1',
        status: 'OPEN',
        timestamp: '2026-06-09T11:00:00.000Z'
      }
    ]
  },
  stock: [{ entityId: 'GODOWN-S-001', commodity: 'Rice', quantityKg: 500 }],
  entitlementSummary: {
    totalMonthlyEntitlementKg: 25,
    totalLiftedKg: 10,
    totalAvailableKg: 15,
    utilizationPct: 40,
    activeCount: 1,
    recordCount: 1
  },
  health: [
    { name: 'api', status: 'ok' as const, detail: 'API up' },
    { name: 'ledger', status: 'ok' as const, detail: 'Ledger ok' }
  ],
  links: {}
}));

vi.mock('@/api.js', () => ({
  probeApi: vi.fn().mockResolvedValue(true),
  fetchApiHealth: vi.fn().mockResolvedValue({ ok: true, ledgerMode: 'demo' }),
  buildApiUrl: vi.fn((path: string) => `/api${path}`),
  loadStakeholders: vi.fn().mockResolvedValue([
    { stakeholderId: 'FCI-001', stakeholderType: 'FCI', name: 'FCI Central Depot', district: 'Demo District', licenseNo: 'LIC-1', status: 'ACTIVE' }
  ]),
  createStockLot: vi.fn().mockResolvedValue({
    lotId: 'LOT-RICE-123',
    commodity: 'Rice',
    quantityKg: 5000,
    currentOwner: 'FCI-001'
  }),
  loadLots: vi.fn().mockResolvedValue([
    {
      lotId: 'LOT-RICE-2026-001',
      commodity: 'Rice',
      season: '2026-KHARIF',
      quantityKg: 5000,
      qualityGrade: 'A',
      source: 'FCI Depot',
      currentOwner: 'FCI-001',
      currentLocation: 'FCI Depot',
      status: 'CREATED'
    }
  ])
}));

vi.mock('@/admin-api.js', () => ({
  getStoredAdminToken: vi.fn(() => 'token'),
  setStoredAdminToken: vi.fn(),
  loadAdminOverview: vi.fn().mockResolvedValue(adminOverview),
  resetAdminLedger: vi.fn().mockResolvedValue({ ledgerTxId: 'TX-RESET-1', message: 'Ledger reset.' })
}));

vi.mock('@/auth-token.js', () => ({
  getCurrentIdentity: vi.fn(() => ({
    subject: 'admin-test',
    displayName: 'Admin Test',
    roles: ['platform-admin', 'fci', 'demo-reset']
  })),
  signIn: vi.fn(),
  signOut: vi.fn(),
  hasOperationalRole: vi.fn((roles: string[]) =>
    roles.some((role) => ['management', 'department', 'procurement', 'fci', 'godown', 'block-office', 'fps', 'auditor'].includes(role))
  ),
  authHeaders: vi.fn(() => ({ Authorization: 'Bearer test-only' }))
}));

import { AdminLayout } from '@/pages/AdminLayout.js';
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage.js';
import { AdminNetworkPage } from '@/pages/admin/AdminNetworkPage.js';
import { AdminLedgerPage } from '@/pages/admin/AdminLedgerPage.js';
import { AdminAlertsPage } from '@/pages/admin/AdminAlertsPage.js';
import { AdminToolsPage } from '@/pages/admin/AdminToolsPage.js';
import { getCurrentIdentity } from '@/auth-token.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentIdentity).mockReturnValue({
    subject: 'admin-test',
    displayName: 'Admin Test',
    roles: ['platform-admin', 'fci', 'demo-reset']
  });
});

function renderAdmin(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Toaster />
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="overview" element={<AdminOverviewPage />} />
          <Route path="network" element={<AdminNetworkPage />} />
          <Route path="ledger" element={<AdminLedgerPage />} />
          <Route path="alerts" element={<AdminAlertsPage />} />
          <Route path="tools" element={<AdminToolsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Admin console', () => {
  it('does not request operational stakeholders for an admin-only identity', async () => {
    const { loadStakeholders } = await import('@/api.js');
    vi.mocked(getCurrentIdentity).mockReturnValue({
      subject: 'admin-only',
      displayName: 'Admin Only',
      roles: ['platform-admin']
    });

    renderAdmin('/admin/overview');

    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(loadStakeholders).not.toHaveBeenCalled();
    expect(screen.queryByText(/not permitted/i)).not.toBeInTheDocument();
  });

  it('does not request operational lots for an admin-only identity', async () => {
    const { loadLots } = await import('@/api.js');
    vi.mocked(getCurrentIdentity).mockReturnValue({
      subject: 'admin-only',
      displayName: 'Admin Only',
      roles: ['platform-admin']
    });

    renderAdmin('/admin/tools');

    expect(await screen.findByText(/operational lot data requires an operational role/i)).toBeInTheDocument();
    expect(loadLots).not.toHaveBeenCalled();
    expect(screen.queryByText(/not permitted/i)).not.toBeInTheDocument();
  });

  it('renders overview metrics', async () => {
    renderAdmin('/admin/overview');
    expect(await screen.findByText('5')).toBeInTheDocument();
  });

  it('renders network info and health checks', async () => {
    renderAdmin('/admin/network');
    expect(await screen.findByText('Ledger and persistence')).toBeInTheDocument();
    expect(screen.getByText('Subsystem checks')).toBeInTheDocument();
  });

  it('renders the recent ledger events table with scoped column headers', async () => {
    renderAdmin('/admin/ledger');
    expect(await screen.findByText('Recent ledger events')).toBeInTheDocument();
    expect(screen.getByText('LOT_CREATED')).toBeInTheDocument();
    const tables = screen.getAllByRole('table');
    const table = tables.find((candidate) => within(candidate).queryByText('Timestamp'));
    if (!table) {
      throw new Error('Recent ledger events table not found');
    }
    const headerCells = within(table).getAllByRole('columnheader');
    expect(headerCells.length).toBeGreaterThan(0);
    for (const cell of headerCells) {
      expect(cell).toHaveAttribute('scope', 'col');
    }
    expect(within(table).getByText('Timestamp')).toBeInTheDocument();
    expect(within(table).getByText('Event')).toBeInTheDocument();
  });

  it('exposes a skip link targeting admin content', async () => {
    renderAdmin('/admin/overview');
    const skip = screen.getByRole('link', { name: /skip to admin content/i });
    expect(skip).toHaveAttribute('href', '#admin-main');
    expect(document.getElementById('admin-main')).not.toBeNull();
  });

  it('shows the open audit alert with its risk level', async () => {
    renderAdmin('/admin/alerts');
    expect(await screen.findByText('Short receipt detected')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('loads the authenticated admin tools view', async () => {
    renderAdmin('/admin/tools');
    expect(await screen.findByRole('button', { name: 'Add stock' })).toBeInTheDocument();
    expect(await screen.findByText('Issued stock lots')).toBeInTheDocument();
  });

  it('submits a new stock lot via the add-stock form and surfaces a toast', async () => {
    const { createStockLot } = await import('@/api.js');
    const user = userEvent.setup();
    renderAdmin('/admin/tools');

    await user.click(await screen.findByLabelText('Commodity'));
    await user.click(await screen.findByRole('option', { name: 'Wheat' }));
    const addStock = await screen.findByRole('button', { name: 'Add stock' });
    await user.click(addStock);

    expect(createStockLot).toHaveBeenCalledWith(
      expect.objectContaining({ commodity: 'Wheat', quantityKg: 7000, currentOwner: 'FCI-001' })
    );
    expect((await screen.findAllByText(/Created LOT-RICE-123/)).length).toBeGreaterThan(0);
    expect(await screen.findByText('Stock added')).toBeInTheDocument();
  });

  it('lists issued stock lots and refreshes the list after adding stock', async () => {
    const { loadLots } = await import('@/api.js');
    const user = userEvent.setup();
    renderAdmin('/admin/tools');

    expect(await screen.findByText('Issued stock lots')).toBeInTheDocument();
    expect(await screen.findByText('LOT-RICE-2026-001')).toBeInTheDocument();

    const addStock = await screen.findByRole('button', { name: 'Add stock' });
    const callsBefore = (loadLots as ReturnType<typeof vi.fn>).mock.calls.length;
    await user.click(addStock);

    expect(await screen.findByText('Stock added')).toBeInTheDocument();
    expect((loadLots as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('confirms before resetting the ledger and surfaces a toast', async () => {
    const { resetAdminLedger } = await import('@/admin-api.js');
    const user = userEvent.setup();
    renderAdmin('/admin/tools');

    const resetTrigger = await screen.findByRole('button', { name: 'Reset ledger' });
    await user.click(resetTrigger);

    const confirm = await screen.findByRole('button', { name: 'Confirm reset' });
    await user.click(confirm);

    expect(resetAdminLedger).toHaveBeenCalledWith(undefined);
    expect((await screen.findAllByText('Ledger reset.')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Ledger reset')).toBeInTheDocument();
  });

  it('scopes the reset to a single commodity when selected', async () => {
    const { resetAdminLedger } = await import('@/admin-api.js');
    const user = userEvent.setup();
    renderAdmin('/admin/tools');

    await user.click(await screen.findByLabelText('Scope'));
    await user.click(await screen.findByRole('option', { name: 'Wheat only' }));

    const resetTrigger = await screen.findByRole('button', { name: 'Reset Wheat' });
    await user.click(resetTrigger);

    const confirm = await screen.findByRole('button', { name: 'Confirm reset' });
    await user.click(confirm);

    expect(resetAdminLedger).toHaveBeenCalledWith('Wheat');
  });
});
