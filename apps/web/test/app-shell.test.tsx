import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const duplicateClaimWorkspace = {
  summary: {
    trackedStockKg: 5000,
    activeLots: 3,
    completedDistributions: 12,
    pendingReceipts: 2,
    pendingTransferReceipts: 0,
    pendingFpsAllocations: 0
  },
  stakeholders: [],
  lots: [{ lotId: 'LOT-RICE-2026-001', commodity: 'Rice', currentLocation: 'FPS 101' }],
  transfers: [
    ['TR-POC-RICE-FCI-DEPOT', 'FCI-001', 'GODOWN-S-001', 1000],
    ['TR-POC-RICE-DEPOT-BLOCK', 'GODOWN-S-001', 'GODOWN-B-001', 1000]
  ].map(([transferId, fromOrg, toOrg, qty]) => ({
    transferId: String(transferId),
    lotId: 'LOT-RICE-2026-001',
    fromOrg: String(fromOrg),
    toOrg: String(toOrg),
    dispatchedQtyKg: Number(qty),
    receivedQtyKg: Number(qty),
    vehicleNo: 'KA01AB2000',
    status: 'RECEIVED',
    dispatchTimestamp: '2026-06-09T10:00:00.000Z',
    receiveTimestamp: '2026-06-09T11:00:00.000Z',
    transporterId: 'TRANS-001',
    transporterName: 'Transport Contractor 01'
  })),
  allocations: [
    {
      allocationId: 'ALLOC-POC-RICE-FPS',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 300,
      receivedQtyKg: 300,
      month: '2026-06',
      sourceGodownId: 'GODOWN-B-001',
      status: 'RECEIVED',
      transporterId: 'TRANS-001',
      transporterName: 'Transport Contractor 01',
      vehicleNo: 'KA01AB1204',
      dispatchTimestamp: '2026-06-09T12:00:00.000Z',
      receiveTimestamp: '2026-06-09T13:00:00.000Z'
    }
  ],
  authTransactions: [],
  entitlements: [],
  distributions: [
    {
      distributionId: 'DIST-POC-001',
      deliveredKg: 25,
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Rice',
      fpsId: 'FPS-101',
      authResult: 'SUCCESS',
      authTxnRefHash: 'auth-ref-poc',
      ledgerTxId: 'TX-POC'
    }
  ],
  alerts: [],
  ledgerEvents: [
    {
      ledgerTxId: 'MOCK-RO',
      entityType: 'workflow',
      entityId: 'TR-POC-RICE-DEPOT-BLOCK',
      eventType: 'RO_LITE_APPROVED',
      payload: {},
      timestamp: '2026-06-09T10:00:00.000Z'
    }
  ],
  stockPositions: []
};

vi.mock('@/api.js', () => ({
  probeApi: vi.fn().mockResolvedValue(false),
  fetchApiHealth: vi.fn().mockResolvedValue({ ok: false }),
  loadWorkspaceData: vi.fn().mockResolvedValue({
    summary: {
      trackedStockKg: 5000,
      activeLots: 3,
      completedDistributions: 12,
      pendingReceipts: 2,
      pendingTransferReceipts: 0,
      pendingFpsAllocations: 0
    },
    stakeholders: [],
    lots: [{ lotId: 'LOT-RICE-2026-001', commodity: 'Rice', currentLocation: 'FPS 101' }],
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
    alerts: [],
    ledgerEvents: [],
    stockPositions: []
  }),
  buildApiUrl: vi.fn((path: string) => `/api${path}`),
  executeWorkflowAction: vi.fn(),
  loadLedgerProofAnalytics: vi.fn().mockResolvedValue(null),
  loadLedgerProofDetail: vi.fn()
}));

import { AppRoutes } from '@/App.js';
import {
  fetchApiHealth,
  loadLedgerProofAnalytics,
  loadWorkspaceData,
  probeApi
} from '@/api.js';

beforeEach(() => {
  vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  vi.clearAllMocks();
  (probeApi as unknown as { mockResolvedValue: (v: boolean) => void }).mockResolvedValue(false);
  (fetchApiHealth as unknown as { mockResolvedValue: (v: { ok: boolean; ledgerMode?: string }) => void }).mockResolvedValue({
    ok: false
  });
  (loadLedgerProofAnalytics as unknown as { mockResolvedValue: (v: null) => void }).mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function renderApp(initialEntry: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppRoutes />
    </MemoryRouter>
  );
  await user.click(await screen.findByRole('button', { name: 'Enter demo workspace' }));
  return user;
}

const sidebar = () => within(screen.getByRole('navigation', { name: 'Workspace sections' }));
const modulesNav = () => within(screen.getByRole('navigation', { name: 'Demo modules' }));

describe('app shell', () => {
  it('filters sidebar navigation by role and active module', async () => {
    await renderApp('/?role=AUDITOR');

    expect(await screen.findByRole('heading', { name: 'Trust & reconcile home' })).toBeInTheDocument();
    expect(modulesNav().getByRole('link', { name: 'Trust & reconcile' })).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: 'Audit alerts' })).toBeInTheDocument();
    expect(sidebar().queryByRole('link', { name: 'Workbench' })).not.toBeInTheDocument();
  });

  it('lands operational roles on their supply-chain module home', async () => {
    await renderApp('/?role=CONTROL_OFFICE');

    expect(await screen.findByRole('heading', { name: 'Supply chain home' })).toBeInTheDocument();
    expect(modulesNav().getByRole('link', { name: 'Supply chain' })).toBeInTheDocument();
    expect(modulesNav().getByRole('link', { name: 'Card & eligibility' })).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: 'Workbench' })).toBeInTheDocument();
  });

  it('lands oversight roles on the trust module home and keeps the trimmed overview', async () => {
    const user = await renderApp('/?role=MANAGEMENT');

    expect(await screen.findByRole('heading', { name: 'Trust & reconcile home' })).toBeInTheDocument();
    await user.click(sidebar().getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Active lots')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Proof analytics' })).toBeInTheDocument();
    expect(screen.getByText(/Live API required for Fabric analytics/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Custody to delivery' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Open alerts' })).toBeInTheDocument();
    expect(
      screen.queryByText('Trace the ration journey from procurement to household delivery.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Demo operating network')).not.toBeInTheDocument();
    expect(screen.queryByText('Operational movement log')).not.toBeInTheDocument();
  });

  it('redirects deep links to screens the role cannot access', async () => {
    await renderApp('/stakeholders?role=FPS');

    expect(await screen.findByRole('heading', { name: 'FPS authentication home' })).toBeInTheDocument();
    expect(screen.queryByText('Demo operating network')).not.toBeInTheDocument();
  });

  it('navigates between routed pages from the sidebar', async () => {
    const user = await renderApp('/?role=AUDITOR');
    await screen.findByRole('heading', { name: 'Trust & reconcile home' });

    await user.click(modulesNav().getByRole('link', { name: 'Supply chain' }));
    expect(await screen.findByRole('heading', { name: 'Supply chain home' })).toBeInTheDocument();
    await user.click(sidebar().getByRole('link', { name: 'Transfers' }));
    expect(await screen.findByRole('heading', { name: 'Operational movement log' })).toBeInTheDocument();

    await user.click(modulesNav().getByRole('link', { name: 'Trust & reconcile' }));
    await user.click(sidebar().getByRole('link', { name: 'Stakeholders' }));
    expect(await screen.findByRole('heading', { name: 'Demo operating network' })).toBeInTheDocument();
  });

  it('exposes eligibility review to oversight roles but keeps offline screening read-only', async () => {
    const user = await renderApp('/?role=AUDITOR');
    await screen.findByRole('heading', { name: 'Trust & reconcile home' });
    await user.click(modulesNav().getByRole('link', { name: 'Card & eligibility' }));
    await user.click(sidebar().getByRole('link', { name: 'Eligibility review' }));
    expect(await screen.findByText('External-service simulation using synthetic beneficiaries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run external eligibility check' })).toBeDisabled();
    expect(screen.getByText(/Offline fixture mode is read-only/)).toBeInTheDocument();
  });

  it('lets control office open eligibility through the module shell', async () => {
    const user = await renderApp('/m/eligibility?role=CONTROL_OFFICE');
    expect(await screen.findByRole('heading', { name: 'Card & eligibility home' })).toBeInTheDocument();
    await user.click(sidebar().getByRole('link', { name: 'Eligibility review' }));
    expect(await screen.findByText('External-service simulation using synthetic beneficiaries')).toBeInTheDocument();
  });

  it('keeps workflow actions on the workbench only', async () => {
    const user = await renderApp('/?role=GODOWN');

    expect(await screen.findByRole('heading', { name: 'Supply chain home' })).toBeInTheDocument();
    await user.click(sidebar().getByRole('link', { name: 'Workbench' }));
    expect(await screen.findByRole('heading', { name: 'Role workbench' })).toBeInTheDocument();

    await user.click(sidebar().getByRole('link', { name: 'Transfers' }));
    expect(await screen.findByRole('heading', { name: 'Operational movement log' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Role workbench' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Management inspection' })).not.toBeInTheDocument();
  });

  it('switches roles from the top bar and re-filters navigation', async () => {
    const user = await renderApp('/?role=AUDITOR');
    await screen.findByRole('heading', { name: 'Trust & reconcile home' });

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'FPS Dealer' }));

    expect(await screen.findByRole('heading', { name: 'FPS authentication home' })).toBeInTheDocument();
    expect(await sidebar().findByRole('link', { name: 'Distribution' })).toBeInTheDocument();
    expect(sidebar().queryByRole('link', { name: 'Stakeholders' })).not.toBeInTheDocument();
  });

  it('hides the auditor probe on the audit page until it is runnable', async () => {
    await renderApp('/audit?role=AUDITOR');

    expect(await screen.findByRole('heading', { name: 'Audit signals and evidence' })).toBeInTheDocument();
    expect(screen.queryByText('Attempt duplicate claim')).not.toBeInTheDocument();
  });

  it('surfaces the duplicate-claim probe to auditors on the audit page', async () => {
    (loadWorkspaceData as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(
      duplicateClaimWorkspace
    );

    await renderApp('/audit?role=AUDITOR');

    expect(await screen.findByText('Attempt duplicate claim')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Audit signals and evidence' })).toBeInTheDocument();
  });

  it('switches scenarios through the demo controls drawer', async () => {
    const user = await renderApp('/?role=MANAGEMENT');
    await screen.findByRole('heading', { name: 'Trust & reconcile home' });
    await user.click(sidebar().getByRole('link', { name: 'Dashboard' }));
    await screen.findByRole('heading', { name: 'Overview' });

    await user.click(screen.getByRole('button', { name: 'Demo controls' }));
    await user.click(await screen.findByRole('button', { name: /Short receipt/i }));
    await user.keyboard('{Escape}');

    expect(await screen.findByText('SHORT_RECEIPT')).toBeInTheDocument();
  });

  it('keeps explicitly selected offline fixtures isolated when an API happens to be reachable', async () => {
    (probeApi as unknown as { mockResolvedValue: (v: boolean) => void }).mockResolvedValue(true);
    (fetchApiHealth as unknown as { mockResolvedValue: (v: { ok: boolean; ledgerMode?: string }) => void }).mockResolvedValue({
      ok: true,
      ledgerMode: 'demo'
    });
    const user = await renderApp('/?role=MANAGEMENT');
    expect(await screen.findByText('Demo data')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Demo controls' }));
    expect(screen.getByRole('button', { name: /Happy path/i })).toBeEnabled();
  });

  it('keeps the skip-link target and supports logout', async () => {
    const user = await renderApp('/?role=MANAGEMENT');
    await screen.findByRole('heading', { name: 'Trust & reconcile home' });
    expect(document.getElementById('main')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('button', { name: 'Enter demo workspace' })).toBeInTheDocument();
  });

  it('redirects roles away from modules they cannot enter', async () => {
    await renderApp('/m/eligibility?role=FPS');
    expect(await screen.findByRole('heading', { name: 'FPS authentication home' })).toBeInTheDocument();
  });
});
