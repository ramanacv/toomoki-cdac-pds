import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { PdsLedgerEngine } from '@pds/pds-chaincode';
import {
  buildSnapshotWritePlan,
  hydratePdsState,
  mapAuthTransactionRow,
  mapAllocationRow,
  mapDistributionRow,
  mapEntitlementRow
} from '../src/infrastructure/postgres-snapshot.js';

describe('postgres snapshot mapper', () => {
  it('creates a deterministic write plan from the in-memory state', () => {
    const engine = new PdsLedgerEngine(true);
    const plan = buildSnapshotWritePlan(engine.exportState());

    expect(plan[0]?.text).toBe('BEGIN');
    expect(plan.some((statement) => statement.text.includes('TRUNCATE') && statement.text.includes('stakeholders'))).toBe(true);
    expect(plan.at(-1)?.text).toBe('COMMIT');
    expect(plan.some((statement) => statement.text.includes('ledger_events'))).toBe(true);
  });

  it('hydrates a state snapshot from postgres-shaped rows', () => {
    const state = hydratePdsState({
      stakeholders: [
        {
          stakeholderId: 'S-1',
          stakeholderType: StakeholderType.DISTRICT_SUPPLY_OFFICE,
          name: 'Food Department',
          district: 'Demo District',
          licenseNo: 'FD-1',
          status: StakeholderStatus.ACTIVE
        }
      ],
      authTransactions: [
        {
          authTxnId: 'AUTH-1',
          beneficiaryRefHash: 'beneficiary',
          rationCardHash: 'ration',
          authMode: AuthMode.MOCK_OTP,
          authResult: AuthResult.SUCCESS,
          authTxnRefHash: 'ref',
          timestamp: '2026-06-09T10:00:00.000Z'
        }
      ]
    });

    expect(state.stakeholders).toHaveLength(1);
    expect(state.authTransactions).toHaveLength(1);
    expect(state.authTransactions[0]?.authMode).toBe('MOCK_OTP');
  });

  it('hydrates stock positions from postgres-shaped rows', () => {
    const state = hydratePdsState({
      stock: [['FCI-001:Rice', 10000]]
    });

    expect(state.stock).toEqual([['FCI-001:Rice', 10000]]);
  });

  it('maps resolved ledger tx ids onto auth, allocation, entitlement, and distribution rows', () => {
    expect(
      mapAuthTransactionRow({
        auth_txn_id: 'AUTH-1',
        beneficiary_ref_hash: 'beneficiary',
        ration_card_hash: 'ration',
        auth_mode: AuthMode.MOCK_OTP,
        auth_result: AuthResult.SUCCESS,
        auth_txn_ref_hash: 'ref',
        timestamp: '2026-06-09T10:00:00.000Z',
        resolved_ledger_tx_id: 'TX-AUTH-1'
      }).ledgerTxId
    ).toBe('TX-AUTH-1');

    expect(
      mapAllocationRow({
        allocation_id: 'ALLOC-1',
        fps_id: 'FPS-101',
        commodity: 'Rice',
        allocated_qty_kg: 100,
        month: '2026-07',
        source_godown_id: 'GODOWN-B-001',
        status: 'ALLOCATED',
        transporter_id: 'TR-1',
        transporter_name: 'Demo',
        vehicle_no: 'MH-01-AB-1234',
        dispatch_timestamp: '2026-07-23T08:00:00.000Z',
        resolved_ledger_tx_id: 'TX-ALLOC-1'
      }).ledgerTxId
    ).toBe('TX-ALLOC-1');

    expect(
      mapEntitlementRow({
        ration_card_hash: 'ration',
        commodity: 'Rice',
        month: '2026-07',
        monthly_entitlement_kg: 25,
        already_lifted_kg: 0,
        available_balance_kg: 25,
        active: true,
        resolved_ledger_tx_id: 'TX-ENT-1'
      }).ledgerTxId
    ).toBe('TX-ENT-1');

    expect(
      mapDistributionRow({
        distribution_id: 'DIST-1',
        fps_id: 'FPS-101',
        ration_card_hash: 'ration',
        beneficiary_ref_hash: 'beneficiary',
        commodity: 'Rice',
        delivered_kg: 5,
        auth_mode: AuthMode.MOCK_OTP,
        auth_result: AuthResult.SUCCESS,
        auth_txn_ref_hash: 'ref',
        dealer_id: 'FPS-101',
        timestamp: '2026-07-23T08:00:00.000Z',
        ledger_tx_id: null,
        resolved_ledger_tx_id: 'TX-DIST-1'
      }).ledgerTxId
    ).toBe('TX-DIST-1');
  });
});
