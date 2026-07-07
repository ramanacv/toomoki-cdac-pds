import { describe, expect, it } from 'vitest';
import type { AuditAlert, DashboardSummary, FPSAllocation, TransferOrder } from '@pds/shared-types';
import { AlertType, AuthMode, AuthResult, TransferStatus } from '@pds/shared-types';
import { roleSummaryCards, type RoleSummaryInput } from '../src/lib/role-summary.js';

const liveSummary: DashboardSummary = {
  trackedStockKg: 12425,
  activeLots: 2,
  completedDistributions: 1,
  pendingReceipts: 3
};

const transfer = (overrides: Partial<TransferOrder>): TransferOrder => ({
  transferId: 'TR-1',
  lotId: 'LOT-1',
  fromOrg: 'ISSUE-001',
  toOrg: 'FPS-101',
  dispatchedQtyKg: 100,
  vehicleNo: 'MH-01',
  status: TransferStatus.DISPATCHED,
  dispatchTimestamp: '2026-07-01T00:00:00Z',
  ...overrides
});

const allocation = (overrides: Partial<FPSAllocation>): FPSAllocation => ({
  allocationId: 'ALLOC-1',
  fpsId: 'FPS-101',
  commodity: 'Rice',
  allocatedQtyKg: 100,
  month: '2026-07',
  sourceGodownId: 'GODOWN-S-001',
  status: 'ALLOCATED',
  ...overrides
});

const alert = (overrides: Partial<AuditAlert>): AuditAlert => ({
  alertId: 'ALERT-1',
  alertType: AlertType.SHORT_RECEIPT,
  entityId: 'TR-1',
  riskLevel: 'MEDIUM',
  message: 'Shortage recorded',
  status: 'OPEN',
  evidence: {},
  createdAt: '2026-07-01T00:00:00Z',
  ...overrides
});

const emptyData: RoleSummaryInput = {
  lots: [],
  transfers: [],
  allocations: [],
  authTransactions: [],
  entitlements: [],
  distributions: [],
  alerts: [],
  ledgerEvents: [],
  stakeholders: []
};

const asMap = (cards: Array<[string, string]>) => Object.fromEntries(cards);

describe('roleSummaryCards', () => {
  it('keeps the network-wide cards for management', () => {
    const cards = asMap(roleSummaryCards('MANAGEMENT', emptyData, liveSummary));
    expect(cards['Tracked stock']).toBe('12,425 kg');
    expect(cards['Active lots']).toBe('2');
  });

  it('scopes fps cards to its own allocations and distributions', () => {
    const cards = asMap(
      roleSummaryCards(
        'FPS',
        {
          ...emptyData,
          allocations: [
            allocation({ receivedQtyKg: 100, status: 'RECEIVED' }),
            allocation({ allocationId: 'ALLOC-OTHER', fpsId: 'FPS-999', allocatedQtyKg: 500 })
          ],
          distributions: [
            {
              distributionId: 'DIST-1',
              fpsId: 'FPS-101',
              rationCardHash: 'card',
              beneficiaryRefHash: 'ben',
              commodity: 'Rice',
              deliveredKg: 25,
              authMode: AuthMode.MOCK_OTP,
              authResult: AuthResult.SUCCESS,
              authTxnRefHash: 'auth',
              dealerId: 'FPS-DEALER-101',
              timestamp: '2026-07-01T00:00:00Z'
            }
          ]
        },
        liveSummary
      )
    );

    expect(cards['Allocated']).toBe('100 kg');
    expect(cards['Received']).toBe('100 kg');
    expect(cards['Distributed']).toBe('25 kg');
  });

  it('scopes godown cards to inbound stock and shortages', () => {
    const cards = asMap(
      roleSummaryCards(
        'GODOWN',
        {
          ...emptyData,
          transfers: [
            transfer({
              transferId: 'TR-IN',
              toOrg: 'GODOWN-S-001',
              dispatchedQtyKg: 1000,
              receivedQtyKg: 800,
              shortageQtyKg: 200,
              status: TransferStatus.RECEIVED_WITH_SHORTAGE
            }),
            transfer({ transferId: 'TR-PENDING', toOrg: 'GODOWN-S-001', dispatchedQtyKg: 500 }),
            transfer({ transferId: 'TR-ELSEWHERE', toOrg: 'FPS-101', dispatchedQtyKg: 300 })
          ]
        },
        liveSummary
      )
    );

    expect(cards['Inbound pending']).toBe('1');
    expect(cards['Received']).toBe('800 kg');
    expect(cards['Shortages']).toBe('200 kg');
  });

  it('gives auditors alert-centric cards', () => {
    const cards = asMap(
      roleSummaryCards(
        'AUDITOR',
        {
          ...emptyData,
          alerts: [
            alert({}),
            alert({ alertId: 'ALERT-2', riskLevel: 'HIGH' }),
            alert({ alertId: 'ALERT-RESOLVED', status: 'RESOLVED' })
          ]
        },
        liveSummary
      )
    );

    expect(cards['Open alerts']).toBe('2');
    expect(cards['High risk']).toBe('1');
  });

  it('returns four cards for every role', () => {
    const roles = [
      'MANAGEMENT',
      'CONTROL_OFFICE',
      'FCI_DEPOT',
      'DEPOT',
      'FPS',
      'WELFARE_INSTITUTE',
      'SHIV_BHOJAN_OPERATOR',
      'AUDITOR',
      'DEPARTMENT',
      'PROCUREMENT',
      'GODOWN'
    ] as const;
    for (const role of roles) {
      expect(roleSummaryCards(role, emptyData, liveSummary)).toHaveLength(4);
    }
  });
});
