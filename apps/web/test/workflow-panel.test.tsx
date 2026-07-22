import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowActionPanel } from '@/components/WorkflowActionPanel.js';

vi.mock('@/api.js', () => ({
  executeWorkflowAction: vi.fn().mockResolvedValue({ ledgerTxId: 'TX-NEW' })
}));

vi.mock('@/auth-token.js', () => ({
  hasAccessToken: vi.fn(() => true)
}));

import { executeWorkflowAction } from '@/api.js';
import { demoEntitlements, demoLots } from '@/demo-model.js';
import { demoQuantities } from '@pds/fixtures';
import { TransferStatus } from '@pds/shared-types';

const receivedTransfer = (transferId: string, fromOrg: string, toOrg: string, lotId = 'LOT-RICE-2026-001') => ({
  transferId,
  lotId,
  fromOrg,
  toOrg,
  dispatchedQtyKg: demoQuantities.stageOneTransferKg,
  receivedQtyKg: demoQuantities.stageOneTransferKg,
  vehicleNo: 'KA01AB1000',
  status: TransferStatus.RECEIVED,
  dispatchTimestamp: '2026-06-30T10:00:00.000Z',
  receiveTimestamp: '2026-06-30T10:05:00.000Z'
});

const baseProps = {
  ledgerMode: null as const,
  lots: demoLots,
  transfers: [],
  allocations: [],
  authTransactions: [],
  distributions: [],
  entitlements: demoEntitlements,
  alerts: [],
  ledgerEvents: [],
  stockPositions: [],
  onComplete: vi.fn().mockResolvedValue(undefined),
  onMockComplete: vi.fn()
};

const depotReady = {
  transfers: [
    receivedTransfer('TR-POC-RICE-PROC-FCI', 'PROC-001', 'FCI-001'),
    receivedTransfer('TR-POC-RICE-FCI-DEPOT', 'FCI-001', 'GODOWN-S-001')
  ]
};

const issueReady = {
  transfers: [
    ...depotReady.transfers,
    receivedTransfer('TR-POC-RICE-DEPOT-ISSUE', 'GODOWN-S-001', 'ISSUE-001')
  ],
  ledgerEvents: [
    {
      ledgerTxId: 'TX-RO',
      entityType: 'workflow' as const,
      entityId: 'TR-POC-RICE-DEPOT-ISSUE',
      eventType: 'RO_LITE_APPROVED',
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
  it('renders procurement dispatch as the first action', () => {
    render(<WorkflowActionPanel {...baseProps} apiOnline={false} role="PROCUREMENT" />);

    const riceGroup = within(screen.getByTestId('commodity-group-Rice'));
    expect(screen.getByText('Mock workflow')).toBeInTheDocument();
    expect(riceGroup.getByText('Dispatch procurement stock to FCI')).toBeInTheDocument();
    expect(riceGroup.getByText('Available stock')).toBeInTheDocument();
    expect(riceGroup.getByText('Dispatch qty')).toBeInTheDocument();
    expect(riceGroup.queryByText('Required')).not.toBeInTheDocument();
    expect(riceGroup.getByLabelText('Dispatch quantity (kg)')).toHaveValue(demoQuantities.stageOneTransferKg);
  });

  it('shows DSO authorization details for the depot-to-issue movement', () => {
    render(
      <WorkflowActionPanel
        {...baseProps}
        {...depotReady}
        apiOnline={false}
        role="CONTROL_OFFICE"
      />
    );

    const riceGroup = within(screen.getByTestId('commodity-group-Rice'));
    expect(riceGroup.getByText(/Approve: Stage-II state depot dispatch to issue point/)).toBeInTheDocument();
    expect(riceGroup.getByText('TR-POC-RICE-DEPOT-ISSUE')).toBeInTheDocument();
  });

  it('runs mock approval actions and returns ledger evidence to the parent', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowActionPanel
        {...baseProps}
        {...depotReady}
        apiOnline={false}
        role="CONTROL_OFFICE"
      />
    );

    const riceGroup = within(screen.getByTestId('commodity-group-Rice'));
    await user.click(riceGroup.getByRole('button', { name: 'Run action' }));

    expect(baseProps.onMockComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Ledger event MOCK-RO_LITE_APPROVED/)).toBeInTheDocument();
  });

  it('posts live actions through the API when online', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkflowActionPanel
        {...baseProps}
        {...depotReady}
        apiOnline
        role="CONTROL_OFFICE"
        onComplete={onComplete}
      />
    );

    const riceGroup = within(screen.getByTestId('commodity-group-Rice'));
    await user.click(riceGroup.getByRole('button', { name: 'Run action' }));

    expect(executeWorkflowAction).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalled();
  });

  it('lets FPS see the upstream allocation action but not execute it', () => {
    render(
      <WorkflowActionPanel
        {...baseProps}
        {...issueReady}
        apiOnline={false}
        role="FPS"
      />
    );

    const riceGroup = within(screen.getByTestId('commodity-group-Rice'));
    expect(riceGroup.getByText('Allocate Rice stock to FPS')).toBeInTheDocument();
    expect(riceGroup.getByRole('button', { name: 'Waiting for Depot / Issue Point' })).toBeDisabled();
  });

  it('lets the depot create the FPS allocation', () => {
    render(
      <WorkflowActionPanel
        {...baseProps}
        {...issueReady}
        apiOnline={false}
        role="DEPOT"
      />
    );

    expect(screen.getByText('Allocate Rice stock to FPS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run action' })).toBeEnabled();
  });

  it('distinguishes depot sender context from issue-point receipt context', () => {
    const roEvent = {
      ledgerTxId: 'TX-RO',
      entityType: 'workflow' as const,
      entityId: 'TR-POC-RICE-DEPOT-ISSUE',
      eventType: 'RO_LITE_APPROVED',
      payload: {},
      timestamp: '2026-06-30T10:00:00.000Z'
    };
    const { rerender } = render(
      <WorkflowActionPanel
        {...baseProps}
        {...depotReady}
        ledgerEvents={[roEvent]}
        apiOnline={false}
        role="DEPOT"
      />
    );

    let riceGroup = within(screen.getByTestId('commodity-group-Rice'));
    expect(riceGroup.getByText('Stage-II state depot dispatch to issue point')).toBeInTheDocument();
    expect(riceGroup.getByText('Acting as')).toBeInTheDocument();
    expect(riceGroup.getByText('GODOWN-S-001')).toBeInTheDocument();
    expect(riceGroup.getByText('Destination')).toBeInTheDocument();
    expect(riceGroup.getByText('ISSUE-001')).toBeInTheDocument();

    rerender(
      <WorkflowActionPanel
        {...baseProps}
        transfers={[
          ...depotReady.transfers,
          {
            transferId: 'TR-POC-RICE-DEPOT-ISSUE',
            lotId: 'LOT-RICE-2026-001',
            fromOrg: 'GODOWN-S-001',
            toOrg: 'ISSUE-001',
            dispatchedQtyKg: demoQuantities.stageOneTransferKg,
            vehicleNo: 'KA01AB1000',
            status: TransferStatus.DISPATCHED,
            dispatchTimestamp: '2026-06-30T10:00:00.000Z',
            stage: 'II',
            authorizedBy: 'DSO-001',
            approvalStatus: 'APPROVED',
            roRef: 'RO-DSO-POC-001'
          }
        ]}
        ledgerEvents={[roEvent]}
        apiOnline={false}
        role="DEPOT"
      />
    );

    riceGroup = within(screen.getByTestId('commodity-group-Rice'));
    expect(riceGroup.getByText('Confirm receipt at ISSUE-001')).toBeInTheDocument();
    expect(riceGroup.getByText('Acting as')).toBeInTheDocument();
    expect(riceGroup.getByText('ISSUE-001')).toBeInTheDocument();
    expect(riceGroup.getByText('Receiving from')).toBeInTheDocument();
    expect(riceGroup.getByText('GODOWN-S-001')).toBeInTheDocument();
  });

  it('prefills the FPS receipt quantity from the allocated amount', () => {
    render(
      <WorkflowActionPanel
        {...baseProps}
        {...issueReady}
        allocations={[
          {
            allocationId: 'ALLOC-POC-RICE-FPS',
            fpsId: 'FPS-101',
            commodity: 'Rice',
            allocatedQtyKg: demoQuantities.fpsAllocationKg,
            month: '2026-06',
            sourceGodownId: 'ISSUE-001',
            status: 'ALLOCATED'
          }
        ]}
        apiOnline={false}
        role="FPS"
      />
    );

    expect(screen.getByLabelText('Received quantity (kg)')).toHaveValue(demoQuantities.fpsAllocationKg);
    expect(screen.getByLabelText('Received quantity (kg)')).toHaveAttribute(
      'max',
      demoQuantities.fpsAllocationKg.toString()
    );
  });

  it('lets management inspect but not execute operational actions', () => {
    render(<WorkflowActionPanel {...baseProps} apiOnline={false} role="MANAGEMENT" />);

    expect(screen.getByText('Management inspection')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run action' })).not.toBeInTheDocument();
  });

  it('renders multiple commodity groups for operational review', () => {
    render(<WorkflowActionPanel {...baseProps} apiOnline={false} role="PROCUREMENT" />);

    expect(screen.getByTestId('commodity-group-Rice')).toBeInTheDocument();
    expect(screen.getByTestId('commodity-group-Wheat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Commodity route')).not.toBeInTheDocument();
  });
});
