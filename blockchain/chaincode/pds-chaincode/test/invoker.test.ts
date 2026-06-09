import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult } from '@pds/shared-types';
import { PdsChaincodeInvoker } from '../src/invoker.js';

describe('PdsChaincodeInvoker', () => {
  it('records ledger proofs and serves lot history queries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pds-chaincode-'));
    const statePath = join(dir, 'world-state.json');
    const invoker = new PdsChaincodeInvoker(statePath);

    try {
      const event = {
        ledgerTxId: 'TX-CHAIN-001',
        entityType: 'lot' as const,
        entityId: 'LOT-RICE-2026-001',
        eventType: 'CreateCommodityLot',
        payload: {
          lotId: 'LOT-RICE-2026-001',
          commodity: 'Rice',
          season: 'Kharif 2026',
          quantityKg: 1000,
          qualityGrade: 'A',
          source: 'Procurement Centre 01',
          currentOwner: 'PROC-001',
          currentLocation: 'Procurement Yard',
          status: 'CREATED'
        },
        timestamp: '2026-06-09T10:00:00.000Z'
      };

      invoker.submitLedgerEvent(event);
      const history = invoker.evaluate('GetLotHistory', { lotId: 'LOT-RICE-2026-001' }) as Array<{ ledgerTxId: string }>;

      expect(history).toHaveLength(1);
      expect(history[0]?.ledgerTxId).toBe('TX-CHAIN-001');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('supports direct contract writes and duplicate-claim checks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pds-chaincode-'));
    const statePath = join(dir, 'world-state.json');
    const invoker = new PdsChaincodeInvoker(statePath);

    try {
      invoker.submit('CreateMonthlyEntitlement', {
        rationCardHash: 'demo-ration-card-hash',
        commodity: 'Rice',
        month: '2026-06',
        monthlyEntitlementKg: 25,
        alreadyLiftedKg: 20,
        availableBalanceKg: 5,
        active: true
      });

      const duplicateCheck = invoker.evaluate('CheckDuplicateClaim', {
        rationCardHash: 'demo-ration-card-hash',
        commodity: 'Rice',
        month: '2026-06',
        requestedQtyKg: 10
      }) as { allowed: boolean };

      expect(duplicateCheck.allowed).toBe(false);

      invoker.submit('RegisterBeneficiaryHash', {
        authTxnId: 'AUTH-CHAIN-001',
        beneficiaryRefHash: 'beneficiary-hash',
        rationCardHash: 'demo-ration-card-hash',
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS
      });

      const digest = invoker.evaluate('VerifyDatabaseHash', { digest: 'missing' }) as { match: boolean };
      expect(digest.match).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
