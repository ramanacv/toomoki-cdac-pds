import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { LedgerProofAnalyticsResponse, LedgerProofDetailResponse } from '@pds/shared-types';
import { FabricAnalyticsPanel } from '@/components/FabricAnalyticsPanel.js';
import { OverviewPage } from '@/pages/workspace/OverviewPage.js';
import { TooltipProvider } from '@/components/ui/tooltip.js';

const renderWithProviders = (ui: ReactElement) =>
  render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);

const analyticsFixture: LedgerProofAnalyticsResponse = {
  summary: {
    counts: { PENDING: 1, SUBMITTING: 0, COMMITTED: 2, FAILED: 0, DEAD_LETTER: 0 },
    oldestOutstandingAgeSeconds: 12,
    commitSuccessPercentage: 66.67,
    recentCommitted: [{ eventId: 'TX-1', fabricTxId: 'fabric-1', committedAt: '2026-01-01T00:00:05.000Z' }]
  },
  byModule: { 'supply-chain': 1, eligibility: 1, fps: 1, other: 0 },
  byEventType: [
    { eventType: 'DispatchLot', count: 1 },
    { eventType: 'EligibilityDecisionAuthorized', count: 1 },
    { eventType: 'AuthTransaction', count: 1 }
  ],
  completeness: {
    byModule: {
      beneficiary: { expected: 4, committed: 3, missing: 1, pendingOrFailed: 0, deadLetter: 0 },
      eligibility: { expected: 2, committed: 2, missing: 0, pendingOrFailed: 0, deadLetter: 0 }
    },
    missingProofCount: 1,
    deadLetterCount: 0,
    pendingOrFailedCount: 0,
    missingEventIds: ['BEN-MISSING-1'],
    alerts: [{
      kind: 'MISSING_PROOF',
      module: 'beneficiary',
      eventId: 'BEN-MISSING-1',
      detail: 'Authorized lifecycle/adjudication event has no durable outbox proof row'
    }]
  },
  recentProofs: [
    {
      eventId: 'TX-1',
      operationId: 'TX-1',
      eventType: 'DispatchLot',
      entityType: 'transfer',
      entityId: 'TR-1',
      schemaVersion: 1,
      payloadHash: 'a'.repeat(64),
      businessTimestamp: '2026-01-01T00:00:00.000Z',
      status: 'COMMITTED',
      fabricTxId: 'fabric-1',
      retryCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      committedAt: '2026-01-01T00:00:05.000Z',
      module: 'supply-chain',
      actor: {
        subject: 'pds-api',
        applicationRole: 'SYSTEM',
        submittingOrganization: 'FoodAndCivilSuppliesMSP'
      }
    }
  ]
};

const detailFixture: LedgerProofDetailResponse = {
  ...analyticsFixture.recentProofs[0]!,
  proofPayload: { quantityKg: 1000, lotId: 'LOT-1' }
};

const loadLedgerProofAnalytics = vi.fn();
const loadLedgerProofDetail = vi.fn();

vi.mock('@/api.js', () => ({
  loadLedgerProofAnalytics: (...args: unknown[]) => loadLedgerProofAnalytics(...args),
  loadLedgerProofDetail: (...args: unknown[]) => loadLedgerProofDetail(...args)
}));

vi.mock('@/hooks/use-workspace-context.js', () => ({
  useWorkspaceContext: () => ({
    role: 'MANAGEMENT',
    scenario: 'happy-path',
    workspace: {
      apiOnline: true,
      loading: false,
      error: null,
      ledgerMode: 'fabric',
      summary: {
        trackedStockKg: 5000,
        activeLots: 3,
        completedDistributions: 12,
        pendingReceipts: 2,
        pendingTransferReceipts: 0,
        pendingFpsAllocations: 0,
        openAlerts: 0,
        highRiskFps: []
      },
      stakeholders: [],
      lots: [],
      transfers: [],
      allocations: [],
      authTransactions: [],
      entitlements: [],
      distributions: [],
      alerts: [],
      ledgerEvents: [],
      stockPositions: [],
      refresh: vi.fn(),
      applyMockResult: vi.fn()
    },
    liveSummary: {
      trackedStockKg: 5000,
      activeLots: 3,
      completedDistributions: 12,
      pendingReceipts: 2,
      pendingTransferReceipts: 0,
      pendingFpsAllocations: 0,
      openAlerts: 0,
      highRiskFps: []
    },
    visibleAlerts: []
  })
}));

vi.mock('@/auth-token.js', () => ({
  getCurrentIdentity: () => null
}));

beforeEach(() => {
  loadLedgerProofAnalytics.mockReset();
  loadLedgerProofDetail.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FabricAnalyticsPanel', () => {
  it('shows the mock-mode empty state when analytics are unavailable', async () => {
    loadLedgerProofAnalytics.mockResolvedValue(null);
    renderWithProviders(<FabricAnalyticsPanel apiOnline={false} canOpenDetail />);
    expect(await screen.findByText(/Live API required for Fabric analytics/i)).toBeInTheDocument();
  });

  it('renders pipeline tiles, module counts, and opens proof detail', async () => {
    const user = userEvent.setup();
    loadLedgerProofAnalytics.mockResolvedValue(analyticsFixture);
    loadLedgerProofDetail.mockResolvedValue(detailFixture);

    renderWithProviders(<FabricAnalyticsPanel apiOnline canOpenDetail />);

    expect(await screen.findByRole('heading', { name: 'Cross-module proof analytics' })).toBeInTheDocument();
    expect(screen.getByText('66.67% committed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lifecycle proof completeness' })).toBeInTheDocument();
    expect(screen.getByText('Gaps detected')).toBeInTheDocument();
    expect(screen.getByText(/MISSING_PROOF/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Supply chain' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Card & eligibility' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'FPS authentication' })).toBeInTheDocument();
    expect(screen.getAllByText('DispatchLot').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('heading', { name: 'Proof detail' })).toBeInTheDocument();
    expect(screen.getByText(/"quantityKg": 1000/)).toBeInTheDocument();
    expect(loadLedgerProofDetail).toHaveBeenCalledWith('TX-1');
  });
});

describe('OverviewPage fabric analytics', () => {
  it('embeds Fabric analytics on the Trust overview for management', async () => {
    loadLedgerProofAnalytics.mockResolvedValue(analyticsFixture);
    renderWithProviders(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText(/sample Fabric proof analytics/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Cross-module proof analytics' })).toBeInTheDocument();
    expect(screen.getByText('TX-1')).toBeInTheDocument();
  });
});
