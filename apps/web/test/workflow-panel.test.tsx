import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowActionPanel } from '@/components/WorkflowActionPanel.js';

vi.mock('@/api.js', () => ({
  executeWorkflowAction: vi.fn().mockResolvedValue({ ledgerTxId: 'TX-NEW' })
}));

import { executeWorkflowAction } from '@/api.js';
import { demoLots } from '@/demo-model.js';
import { TransferStatus } from '@pds/shared-types';

const baseProps = {
  lots: demoLots,
  transfers: [],
  allocations: [],
  authTransactions: [],
  distributions: [],
  alerts: [],
  ledgerEvents: [],
  onComplete: vi.fn().mockResolvedValue(undefined),
  onMockComplete: vi.fn()
};

const receivedTransfer = (transferId: string, fromOrg: string, toOrg: string, lotId = 'LOT-RICE-2026-002') => ({
  transferId,
  lotId,
  fromOrg,
  toOrg,
  dispatchedQtyKg: 1000,
  receivedQtyKg: 1000,
  vehicleNo: 'KA01AB1000',
  status: TransferStatus.RECEIVED,
  dispatchTimestamp: '2026-06-30T10:00:00.000Z',
  receiveTimestamp: '2026-06-30T10:05:00.000Z'
});

const contextBeforeShivBhojanDispatch = {
  transfers: [
    receivedTransfer('TR-POC-PROC-FCI', 'PROC-001', 'FCI-001', 'LOT-RICE-2026-001'),
    receivedTransfer('TR-POC-FCI-BUF', 'FCI-001', 'FCI-BUF-001', 'LOT-RICE-2026-001'),
    receivedTransfer('TR-POC-BUF-DEPOT', 'FCI-BUF-001', 'GODOWN-S-001', 'LOT-RICE-2026-001'),
    receivedTransfer('TR-POC-DEPOT-MILLER', 'GODOWN-S-001', 'MLL-001', 'LOT-RICE-2026-001'),
    receivedTransfer('TR-POC-MILLER-ISSUE', 'MLL-001', 'ISSUE-001'),
    receivedTransfer('TR-POC-ISSUE-FPS', 'ISSUE-001', 'FPS-101'),
    receivedTransfer('TR-POC-ISSUE-WI', 'ISSUE-001', 'WI-101')
  ],
  ledgerEvents: [
    {
      ledgerTxId: 'TX-RO',
      entityType: 'workflow' as const,
      entityId: 'TR-POC-MILLER-ISSUE',
      eventType: 'RO_LITE_APPROVED',
      payload: {},
      timestamp: '2026-06-30T10:00:00.000Z'
    },
    {
      ledgerTxId: 'TX-TRANSFORM',
      entityType: 'lot' as const,
      entityId: 'LOT-RICE-2026-002',
      eventType: 'TransformLot',
      payload: {},
      timestamp: '2026-06-30T10:00:00.000Z'
    }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  baseProps.onMockComplete.mockClear();
});

describe('WorkflowActionPanel', () => {
  it('renders a mock-mode workbench when the API is offline', () => {
    render(
      <WorkflowActionPanel
        {...baseProps}
        apiOnline={false}
        role="CONTROL_OFFICE"
      />
    );
    expect(screen.getByText('Mock workflow')).toBeInTheDocument();
    expect(screen.getByText('Approve Stage-II RO-lite movement')).toBeInTheDocument();
  });

  it('runs mock actions and returns ledger evidence to the parent', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowActionPanel
        {...baseProps}
        apiOnline={false}
        role="CONTROL_OFFICE"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Run action' }));

    expect(baseProps.onMockComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Ledger event MOCK-RO_LITE_APPROVED/)).toBeInTheDocument();
  });

  it('posts live actions through the API when online', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkflowActionPanel
        {...baseProps}
        apiOnline
        role="CONTROL_OFFICE"
        onComplete={onComplete}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Run action' }));

    expect(executeWorkflowAction).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalled();
  });

  it('disables a completed live action when refreshed state has not advanced yet', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkflowActionPanel
        {...baseProps}
        apiOnline
        role="CONTROL_OFFICE"
        onComplete={onComplete}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Run action' }));

    expect(await screen.findByRole('button', { name: 'Done' })).toBeDisabled();
    expect(screen.getByText(/completed and persisted through the API/)).toBeInTheDocument();
  });

  it('lets management inspect but not execute operational actions', () => {
    render(
      <WorkflowActionPanel
        {...baseProps}
        apiOnline={false}
        role="MANAGEMENT"
      />
    );

    expect(screen.getByText('Management inspection')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run action' })).not.toBeInTheDocument();
  });

  it('shows the upstream owner when the selected role is waiting on another role', () => {
    render(
      <WorkflowActionPanel
        {...baseProps}
        {...contextBeforeShivBhojanDispatch}
        apiOnline={false}
        role="SHIV_BHOJAN_OPERATOR"
      />
    );

    expect(screen.getByText('Dispatch to Shiv Bhojan eatery')).toBeInTheDocument();
    expect(screen.getByText('upstream')).toBeInTheDocument();
    expect(screen.getByText('Pending with')).toBeInTheDocument();
    expect(screen.getAllByText('Depot / Issue Point').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Waiting for Depot / Issue Point' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Run action' })).not.toBeInTheDocument();
  });

  it('lets the upstream owner run the same pending handoff action', () => {
    render(
      <WorkflowActionPanel
        {...baseProps}
        {...contextBeforeShivBhojanDispatch}
        apiOnline={false}
        role="DEPOT"
      />
    );

    expect(screen.getByText('Dispatch to Shiv Bhojan eatery')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run action' })).toBeEnabled();
  });
});
