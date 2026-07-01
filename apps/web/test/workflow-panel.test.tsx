import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowActionPanel } from '@/components/WorkflowActionPanel.js';

vi.mock('@/api.js', () => ({
  executeWorkflowAction: vi.fn().mockResolvedValue({ ledgerTxId: 'TX-NEW' })
}));

import { executeWorkflowAction } from '@/api.js';
import { demoLots } from '@/demo-model.js';

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
});
