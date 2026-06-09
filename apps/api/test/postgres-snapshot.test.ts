import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { PdsLedgerEngine } from '@pds/pds-chaincode';
import { buildSnapshotWritePlan, hydratePdsState } from '../src/postgres-snapshot.js';

describe('postgres snapshot mapper', () => {
  it('creates a deterministic write plan from the in-memory state', () => {
    const engine = new PdsLedgerEngine(true);
    const plan = buildSnapshotWritePlan(engine.exportState());

    expect(plan[0]?.text).toBe('BEGIN');
    expect(plan[1]?.text).toContain('TRUNCATE stakeholders, commodity_lots');
    expect(plan.at(-1)?.text).toBe('COMMIT');
    expect(plan.some((statement) => statement.text.includes('ledger_events'))).toBe(true);
  });

  it('hydrates a state snapshot from postgres-shaped rows', () => {
    const state = hydratePdsState({
      stakeholders: [
        {
          stakeholderId: 'S-1',
          stakeholderType: StakeholderType.DEPARTMENT,
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
});
