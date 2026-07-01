import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    byType: [{ stakeholderType: 'PROCUREMENT', count: 1 }],
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
  health: [
    { name: 'api', status: 'ok' as const, detail: 'API up' },
    { name: 'ledger', status: 'ok' as const, detail: 'Ledger ok' }
  ],
  links: {}
}));

vi.mock('@/api.js', () => ({
  probeApi: vi.fn().mockResolvedValue(true),
  buildApiUrl: vi.fn((path: string) => `/api${path}`)
}));

vi.mock('@/admin-api.js', () => ({
  getStoredAdminToken: vi.fn(() => 'token'),
  setStoredAdminToken: vi.fn(),
  loadAdminOverview: vi.fn().mockResolvedValue(adminOverview)
}));

import { AdminDashboard } from '@/pages/AdminDashboard.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminDashboard', () => {
  it('renders the admin overview metrics, network info and recent events table', async () => {
    render(<AdminDashboard />);

    expect(await screen.findByText('Ledger and persistence')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Recent ledger events')).toBeInTheDocument();
    expect(screen.getByText('LOT_CREATED')).toBeInTheDocument();
  });

  it('uses scoped column headers in the recent events table', async () => {
    render(<AdminDashboard />);
    const table = await screen.findByRole('table');
    const headerCells = within(table).getAllByRole('columnheader');
    expect(headerCells.length).toBeGreaterThan(0);
    for (const cell of headerCells) {
      expect(cell).toHaveAttribute('scope', 'col');
    }
    expect(within(table).getByText('Timestamp')).toBeInTheDocument();
    expect(within(table).getByText('Event')).toBeInTheDocument();
  });

  it('exposes a skip link targeting admin content', async () => {
    render(<AdminDashboard />);
    const skip = screen.getByRole('link', { name: /skip to admin content/i });
    expect(skip).toHaveAttribute('href', '#admin-main');
    expect(document.getElementById('admin-main')).not.toBeNull();
  });

  it('shows the open audit alert with its risk level', async () => {
    render(<AdminDashboard />);
    expect(await screen.findByText('Short receipt detected')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('allows refreshing the overview', async () => {
    const user = userEvent.setup();
    render(<AdminDashboard />);
    const refresh = await screen.findByRole('button', { name: 'Refresh' });
    await user.click(refresh);
    // No error thrown + overview still present.
    expect(await screen.findByText('Recent ledger events')).toBeInTheDocument();
  });
});
