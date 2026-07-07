import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

import { AppRoutes } from '@/App.js';
import { loadWorkspaceData, probeApi } from '@/api.js';

beforeEach(() => {
  vi.clearAllMocks();
  (probeApi as unknown as { mockResolvedValue: (v: boolean) => void }).mockResolvedValue(false);
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

describe('app shell', () => {
  it('filters sidebar navigation by role', async () => {
    await renderApp('/?role=AUDITOR');

    expect(sidebar().getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(sidebar().getByRole('link', { name: 'Audit alerts' })).toBeInTheDocument();
    expect(sidebar().queryByRole('link', { name: 'Workbench' })).not.toBeInTheDocument();
  });

  it('lands operational roles on their workbench by default', async () => {
    await renderApp('/?role=CONTROL_OFFICE');

    expect(await screen.findByRole('heading', { name: 'Role workbench' })).toBeInTheDocument();
    // Every role gets the overview for orientation, but operational roles land on their queue.
    expect(sidebar().getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('lands oversight roles on the trimmed overview', async () => {
    await renderApp('/?role=MANAGEMENT');

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Active lots')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Custody to delivery' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Open alerts' })).toBeInTheDocument();
    // The overview no longer stacks every data panel or the old hero copy.
    expect(
      screen.queryByText('Trace the ration journey from procurement to household delivery.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Demo operating network')).not.toBeInTheDocument();
    expect(screen.queryByText('Operational movement log')).not.toBeInTheDocument();
  });

  it('redirects deep links to screens the role cannot access', async () => {
    await renderApp('/stakeholders?role=FPS');

    expect(await screen.findByRole('heading', { name: 'Role workbench' })).toBeInTheDocument();
    expect(screen.queryByText('Demo operating network')).not.toBeInTheDocument();
  });

  it('navigates between routed pages from the sidebar', async () => {
    const user = await renderApp('/?role=AUDITOR');

    await user.click(sidebar().getByRole('link', { name: 'Transfers' }));
    expect(await screen.findByRole('heading', { name: 'Operational movement log' })).toBeInTheDocument();

    await user.click(sidebar().getByRole('link', { name: 'Stakeholders' }));
    expect(await screen.findByRole('heading', { name: 'Demo operating network' })).toBeInTheDocument();
  });

  it('keeps workflow actions on the workbench only', async () => {
    const user = await renderApp('/?role=GODOWN');

    // GODOWN acts from its workbench, which is also its default landing screen.
    expect(await screen.findByRole('heading', { name: 'Role workbench' })).toBeInTheDocument();

    await user.click(sidebar().getByRole('link', { name: 'Transfers' }));
    expect(await screen.findByRole('heading', { name: 'Operational movement log' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Role workbench' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Management inspection' })).not.toBeInTheDocument();
  });

  it('switches roles from the top bar and re-filters navigation', async () => {
    const user = await renderApp('/?role=AUDITOR');
    await screen.findByRole('heading', { name: 'Overview' });

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Fair Price Shop' }));

    expect(await sidebar().findByRole('link', { name: 'Distribution' })).toBeInTheDocument();
    expect(sidebar().queryByRole('link', { name: 'Stakeholders' })).not.toBeInTheDocument();
  });

  it('hides the auditor probe on the audit page until it is runnable', async () => {
    await renderApp('/audit?role=AUDITOR');

    expect(await screen.findByRole('heading', { name: 'Audit signals and evidence' })).toBeInTheDocument();
    expect(screen.queryByText('Attempt duplicate claim')).not.toBeInTheDocument();
  });

  it('surfaces the duplicate-claim probe to auditors on the audit page', async () => {
    const base = await (loadWorkspaceData as unknown as { getMockImplementation: () => () => Promise<Record<string, unknown>> })
      .getMockImplementation()!();
    (loadWorkspaceData as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
      ...base,
      distributions: [
        ...(base.distributions as unknown[]),
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
      ]
    });

    await renderApp('/audit?role=AUDITOR');

    expect(await screen.findByText('Attempt duplicate claim')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Audit signals and evidence' })).toBeInTheDocument();
  });

  it('switches scenarios through the demo controls drawer', async () => {
    const user = await renderApp('/?role=MANAGEMENT');
    await screen.findByRole('heading', { name: 'Overview' });

    await user.click(screen.getByRole('button', { name: 'Demo controls' }));
    await user.click(await screen.findByRole('button', { name: /Short receipt/i }));
    await user.keyboard('{Escape}');

    expect(await screen.findByText('SHORT_RECEIPT')).toBeInTheDocument();
  });

  it('disables scenario buttons in the drawer when the API is online', async () => {
    (probeApi as unknown as { mockResolvedValue: (v: boolean) => void }).mockResolvedValue(true);
    const user = await renderApp('/?role=MANAGEMENT');
    expect(await screen.findByText('Live API')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Demo controls' }));
    expect(await screen.findByText('Live API available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Happy path/i })).toBeDisabled();
    expect(screen.getByText('Live API data shown')).toBeInTheDocument();
  });

  it('keeps the skip-link target and supports logout', async () => {
    const user = await renderApp('/?role=MANAGEMENT');
    await screen.findByRole('heading', { name: 'Overview' });
    expect(document.getElementById('main')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('button', { name: 'Enter demo workspace' })).toBeInTheDocument();
  });
});
