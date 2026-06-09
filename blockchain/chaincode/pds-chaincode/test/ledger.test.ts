import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, AlertType } from '@pds/shared-types';
import { PdsLedgerEngine } from '../src/index.js';

describe('PdsLedgerEngine', () => {
  it('seeds the demo dataset', () => {
    const engine = new PdsLedgerEngine(true);
    expect(engine.snapshot().stakeholders.length).toBeGreaterThan(0);
    expect(engine.snapshot().lots[0]?.lotId).toBe('LOT-RICE-2026-001');
  });

  it('lists seeded lots and distributions in sorted order', () => {
    const engine = new PdsLedgerEngine(true);
    const lots = engine.listLots();
    const distributions = engine.listDistributions();

    expect(lots[0]?.lotId).toBe('LOT-RICE-2026-001');
    expect(distributions).toHaveLength(0);
  });

  it('returns direct lot, transfer, and allocation lookups', () => {
    const engine = new PdsLedgerEngine(true);
    engine.dispatchLot({
      transferId: 'TR-LOOKUP-000',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB0001'
    });
    engine.receiveLot({
      transferId: 'TR-LOOKUP-000',
      receivedQtyKg: 1000
    });
    engine.dispatchLot({
      transferId: 'TR-LOOKUP-000-2',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'MLL-001',
      toOrg: 'GODOWN-S-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB0002'
    });
    engine.receiveLot({
      transferId: 'TR-LOOKUP-000-2',
      receivedQtyKg: 1000
    });
    engine.dispatchLot({
      transferId: 'TR-LOOKUP-000-3',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'GODOWN-S-001',
      toOrg: 'GODOWN-B-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB0003'
    });
    engine.receiveLot({
      transferId: 'TR-LOOKUP-000-3',
      receivedQtyKg: 1000
    });
    engine.dispatchLot({
      transferId: 'TR-LOOKUP-001',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'GODOWN-B-001',
      toOrg: 'FPS-101',
      dispatchedQtyKg: 100,
      vehicleNo: 'KA01AB0004'
    });
    engine.receiveLot({
      transferId: 'TR-LOOKUP-001',
      receivedQtyKg: 100
    });
    engine.allocateToFps({
      allocationId: 'ALLOC-LOOKUP-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 50,
      month: '2026-06',
      sourceGodownId: 'GODOWN-B-001'
    });
    const auth = engine.simulateAuthentication({
      authTxnId: 'AUTH-LOOKUP-001',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS
    });

    expect(engine.getLot('LOT-RICE-2026-001').lotId).toBe('LOT-RICE-2026-001');
    expect(engine.getTransfer('TR-LOOKUP-001').transferId).toBe('TR-LOOKUP-001');
    expect(engine.getAllocation('ALLOC-LOOKUP-001').allocationId).toBe('ALLOC-LOOKUP-001');
    expect(engine.getAuthTransaction(auth.authTxnId).authTxnId).toBe('AUTH-LOOKUP-001');
    expect(engine.listEntitlements().some((item) => item.rationCardHash === 'demo-ration-card-hash')).toBe(true);
  });

  it('records a happy-path distribution', () => {
    const engine = new PdsLedgerEngine(true);
    engine.dispatchLot({
      transferId: 'TR-001',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB1234'
    });
    engine.receiveLot({
      transferId: 'TR-001',
      receivedQtyKg: 1000
    });
    engine.dispatchLot({
      transferId: 'TR-002',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'MLL-001',
      toOrg: 'GODOWN-S-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB5678'
    });
    engine.receiveLot({
      transferId: 'TR-002',
      receivedQtyKg: 1000
    });
    engine.dispatchLot({
      transferId: 'TR-003',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'GODOWN-S-001',
      toOrg: 'GODOWN-B-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB9012'
    });
    engine.receiveLot({
      transferId: 'TR-003',
      receivedQtyKg: 1000
    });
    engine.allocateToFps({
      allocationId: 'ALLOC-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 200,
      month: '2026-06',
      sourceGodownId: 'GODOWN-B-001'
    });
    engine.recordFpsReceipt({
      allocationId: 'ALLOC-001',
      receivedQtyKg: 200
    });
    const auth = engine.simulateAuthentication({
      authTxnId: 'AUTH-001',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS
    });
    const distribution = engine.recordDistribution({
      distributionId: 'DIST-001',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: 25,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      dealerId: 'DEALER-001'
    });

    expect(distribution.ledgerTxId).toBeDefined();
    expect(engine.getDistributionReceipt('DIST-001').distributionId).toBe('DIST-001');
  });

  it('raises an alert on shortage', () => {
    const engine = new PdsLedgerEngine(true);
    engine.dispatchLot({
      transferId: 'TR-002',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB5678'
    });
    engine.receiveLot({
      transferId: 'TR-002',
      receivedQtyKg: 900
    });

    expect(engine.getAlerts().some((alert) => alert.alertType === AlertType.SHORT_RECEIPT)).toBe(true);
  });
});
