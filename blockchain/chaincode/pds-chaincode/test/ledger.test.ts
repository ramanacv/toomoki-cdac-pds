import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, AlertType, GrievanceType, RationCardType, EntitlementRuleStatus, StakeholderType, StakeholderStatus, TransferStatus } from '@pds/shared-types';
import { PdsLedgerEngine } from '../src/index.js';

const dispatchAndReceive = (
  engine: PdsLedgerEngine,
  transferId: string,
  lotId: string,
  fromOrg: string,
  toOrg: string,
  quantityKg: number
) => {
  engine.dispatchLot({
    transferId,
    lotId,
    fromOrg,
    toOrg,
    dispatchedQtyKg: quantityKg,
    vehicleNo: 'KA01AB0001'
  });
  engine.receiveLot({ transferId, receivedQtyKg: quantityKg });
};

describe('PdsLedgerEngine', () => {
  it('seeds the demo dataset', () => {
    const engine = new PdsLedgerEngine(true);
    expect(engine.snapshot().stakeholders.length).toBeGreaterThan(0);
    expect(engine.snapshot().lots[0]?.lotId).toBe('LOT-RICE-2026-001');
    expect(engine.snapshot().lots.map((lot) => lot.commodity)).toEqual(
      expect.arrayContaining(['Rice', 'Wheat', 'Dal', 'Sugar', 'Cooking Oil', 'Kerosene'])
    );
    expect(engine.listEntitlements().map((entitlement) => entitlement.commodity)).toEqual(
      expect.arrayContaining(['Rice', 'Wheat', 'Dal', 'Sugar', 'Cooking Oil', 'Kerosene'])
    );
    expect(engine.exportState().stock).toEqual(
      expect.arrayContaining([
        ['PROC-001:Rice', 10000],
        ['PROC-001:Wheat', 7000],
        ['PROC-001:Dal', 2000],
        ['PROC-001:Sugar', 2000],
        ['PROC-001:Cooking Oil', 1000],
        ['PROC-001:Kerosene', 1000]
      ])
    );
  });

  it('reseeds all initial commodity lots after transactional reset', () => {
    const engine = new PdsLedgerEngine(true);
    engine.resetTransactionalData();

    expect(engine.snapshot().lots.map((lot) => lot.commodity)).toEqual(
      expect.arrayContaining(['Rice', 'Wheat', 'Dal', 'Sugar', 'Cooking Oil', 'Kerosene'])
    );
    expect(engine.exportState().stock).toEqual(
      expect.arrayContaining([
        ['PROC-001:Rice', 10000],
        ['PROC-001:Wheat', 7000],
        ['PROC-001:Dal', 2000],
        ['PROC-001:Sugar', 2000],
        ['PROC-001:Cooking Oil', 1000],
        ['PROC-001:Kerosene', 1000]
      ])
    );
    const eventTypes = engine.exportState().events.map((event) => event.eventType);
    const resetIndex = eventTypes.indexOf('ResetTransactionalData');
    expect(eventTypes[0]).toBe('RegisterStakeholder');
    expect(resetIndex).toBeGreaterThan(0);
    expect(eventTypes.slice(resetIndex + 1)).toEqual([
      'CreateCommodityLot',
      'CreateCommodityLot',
      'CreateCommodityLot',
      'CreateCommodityLot',
      'CreateCommodityLot',
      'CreateCommodityLot'
    ]);
  });

  it('records a non-rice distribution when stock and entitlement exist', () => {
    const engine = new PdsLedgerEngine(true);
    engine.addStockForTest('FPS-101', 'Wheat', 10);
    const auth = engine.simulateAuthentication({
      authTxnId: 'AUTH-WHEAT-1',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS
    });

    const distribution = engine.recordDistribution({
      distributionId: 'DIST-WHEAT-1',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Wheat',
      deliveredKg: 5,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      dealerId: 'FPS-DEALER-101',
      timestamp: '2026-06-15T10:00:00.000Z'
    });

    expect(distribution.commodity).toBe('Wheat');
    expect(engine.getEntitlement('demo-ration-card-hash', 'Wheat', '2026-06').availableBalanceKg).toBe(5);
  });

  it('rejects commodity movements outside the configured route template', () => {
    const engine = new PdsLedgerEngine(true);

    expect(() =>
      engine.dispatchLot({
        transferId: 'TR-KEROSENE-INVALID-DSO',
        lotId: 'LOT-KEROSENE-2026-001',
        fromOrg: 'PROC-001',
        toOrg: 'DSO-001',
        dispatchedQtyKg: 100,
        vehicleNo: 'KA01AB8001'
      })
    ).toThrow(/Kerosene route does not allow movement/);
  });

  it('lists seeded lots and distributions in sorted order', () => {
    const engine = new PdsLedgerEngine(true);
    const lots = engine.listLots();
    const distributions = engine.listDistributions();

    expect(lots.map((lot) => lot.lotId)).toEqual(
      expect.arrayContaining(['LOT-RICE-2026-001', 'LOT-WHEAT-2026-001'])
    );
    expect(distributions).toHaveLength(0);
  });

  it('returns direct lot, transfer, and allocation lookups', () => {
    const engine = new PdsLedgerEngine(true);
    dispatchAndReceive(engine, 'TR-LOOKUP-001', 'LOT-RICE-2026-001', 'PROC-001', 'FCI-001', 100);
    engine.addStockForTest('ISSUE-001', 'Rice', 100);
    engine.allocateToFps({
      allocationId: 'ALLOC-LOOKUP-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 50,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
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
    engine.addStockForTest('ISSUE-001', 'Rice', 200);
    engine.allocateToFps({
      allocationId: 'ALLOC-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 200,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
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
      dealerId: 'DEALER-001',
      timestamp: '2026-06-09T10:10:00.000Z'
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
      toOrg: 'FCI-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB5678'
    });
    engine.receiveLot({
      transferId: 'TR-002',
      receivedQtyKg: 900
    });

    expect(engine.getAlerts().some((alert) => alert.alertType === AlertType.SHORT_RECEIPT)).toBe(true);
  });

  it('rejects duplicate lot, transfer, allocation, distribution and auth IDs', () => {
    const engine = new PdsLedgerEngine(false);
    engine.registerStakeholder({
      stakeholderId: 'PROC-001',
      stakeholderType: StakeholderType.PROCUREMENT_CENTER,
      name: 'Proc',
      district: 'X',
      licenseNo: 'L',
      status: StakeholderStatus.ACTIVE
    });
    engine.createCommodityLot({
      lotId: 'LOT-DUP-1',
      commodity: 'Test Grain',
      season: 'Kharif',
      quantityKg: 100,
      qualityGrade: 'A',
      source: 's',
      currentOwner: 'PROC-001',
      currentLocation: 'yard'
    });
    expect(() =>
      engine.createCommodityLot({
        lotId: 'LOT-DUP-1',
        commodity: 'Rice',
        season: 'Kharif',
        quantityKg: 100,
        qualityGrade: 'A',
        source: 's',
        currentOwner: 'PROC-001',
        currentLocation: 'yard'
      })
    ).toThrow(/already exists/);
  });

  it('rejects unknown ledger event types via applyLedgerEvent (T1.4)', () => {
    const engine = new PdsLedgerEngine(true);
    expect(() =>
      engine.applyLedgerEvent({
        ledgerTxId: 'TX-BOGUS',
        entityType: 'lot',
        entityId: 'LOT-RICE-2026-001',
        eventType: 'TotallyBogus',
        payload: {},
        timestamp: '2026-06-01T00:00:00.000Z'
      })
    ).toThrow(/Unsupported ledger event type/);
  });

  it('rejects PII-bearing payloads and raw numeric hashes (T6.4)', () => {
    const engine = new PdsLedgerEngine(false);
    expect(() =>
      engine.applyLedgerEvent({
        ledgerTxId: 'TX-PII',
        entityType: 'stakeholder',
        entityId: 'S-1',
        eventType: 'RegisterStakeholder',
        payload: { stakeholderId: 'S-1', aadhaar: '123412341234' },
        timestamp: '2026-06-01T00:00:00.000Z'
      })
    ).toThrow(/prohibited PII field/);
    expect(() =>
      engine.simulateAuthentication({
        authTxnId: 'AUTH-PII',
        beneficiaryRefHash: '9876543210',
        rationCardHash: 'demo-ration-card-hash',
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS
      })
    ).toThrow(/raw numeric identifier/);
  });

  it('initializes stock on createCommodityLot so getCurrentStock reflects quantityKg (T1.2)', () => {
    const engine = new PdsLedgerEngine(false);
    engine.registerStakeholder({
      stakeholderId: 'PROC-001',
      stakeholderType: StakeholderType.PROCUREMENT_CENTER,
      name: 'Proc',
      district: 'X',
      licenseNo: 'L',
      status: StakeholderStatus.ACTIVE
    });
    engine.createCommodityLot({
      lotId: 'LOT-STOCK-INIT',
      commodity: 'Rice',
      season: 'Kharif',
      quantityKg: 250,
      qualityGrade: 'A',
      source: 's',
      currentOwner: 'PROC-001',
      currentLocation: 'yard'
    });
    const stock = engine.exportState().stock;
    expect(stock).toContainEqual(['PROC-001:Rice', 250]);
  });

  it('conserves stock across dispatch + receive for both orgs and rejects re-dispatch after RECEIVED (T1.3)', () => {
    const engine = new PdsLedgerEngine(false);
    engine.registerStakeholder({
      stakeholderId: 'PROC-001',
      stakeholderType: StakeholderType.PROCUREMENT_CENTER,
      name: 'Proc',
      district: 'X',
      licenseNo: 'L',
      status: StakeholderStatus.ACTIVE
    });
    engine.registerStakeholder({
      stakeholderId: 'FCI-001',
      stakeholderType: StakeholderType.FCI,
      name: 'Miller',
      district: 'X',
      licenseNo: 'L2',
      status: StakeholderStatus.ACTIVE
    });
    engine.createCommodityLot({
      lotId: 'LOT-CONSERVE',
      commodity: 'Test Grain',
      season: 'Kharif',
      quantityKg: 100,
      qualityGrade: 'A',
      source: 's',
      currentOwner: 'PROC-001',
      currentLocation: 'yard'
    });

    const stockOf = (org: string, commodity: string): number =>
      engine.exportState().stock.find(([key]) => key === `${org}:${commodity}`)?.[1] ?? 0;

    expect(stockOf('PROC-001', 'Test Grain')).toBe(100);
    expect(stockOf('FCI-001', 'Test Grain')).toBe(0);

    engine.dispatchLot({
      transferId: 'TR-CONSERVE-1',
      lotId: 'LOT-CONSERVE',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 60,
      vehicleNo: 'KA01AB0001'
    });
    // Sender stock deducted; receiver not yet credited (in-transit model).
    expect(stockOf('PROC-001', 'Test Grain')).toBe(40);
    expect(stockOf('FCI-001', 'Test Grain')).toBe(0);

    engine.receiveLot({ transferId: 'TR-CONSERVE-1', receivedQtyKg: 60 });
    expect(stockOf('PROC-001', 'Test Grain')).toBe(40);
    expect(stockOf('FCI-001', 'Test Grain')).toBe(60);
    // Total conserved across both orgs.
    expect(stockOf('PROC-001', 'Test Grain') + stockOf('FCI-001', 'Test Grain')).toBe(100);

    // The remaining stock can still be dispatched by the holder even after a
    // partial receipt moved the lot's currentOwner to the receiving org.
    engine.dispatchLot({
      transferId: 'TR-CONSERVE-2',
      lotId: 'LOT-CONSERVE',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 40,
      vehicleNo: 'KA01AB0002'
    });
    expect(stockOf('PROC-001', 'Test Grain')).toBe(0);
    engine.receiveLot({ transferId: 'TR-CONSERVE-2', receivedQtyKg: 40 });

    // Dispatch beyond the sender's remaining stock must still be rejected.
    expect(() =>
      engine.dispatchLot({
        transferId: 'TR-CONSERVE-3',
        lotId: 'LOT-CONSERVE',
        fromOrg: 'PROC-001',
        toOrg: 'FCI-001',
        dispatchedQtyKg: 10,
        vehicleNo: 'KA01AB0002'
      })
    ).toThrow(/owned by/);
  });

  it('records shortage without creating stock and rejects non-positive or excess receipt quantities', () => {
    const engine = new PdsLedgerEngine(false);
    engine.registerStakeholder({
      stakeholderId: 'PROC-001',
      stakeholderType: StakeholderType.PROCUREMENT_CENTER,
      name: 'Proc',
      district: 'X',
      licenseNo: 'L',
      status: StakeholderStatus.ACTIVE
    });
    engine.registerStakeholder({
      stakeholderId: 'FCI-001',
      stakeholderType: StakeholderType.FCI,
      name: 'Miller',
      district: 'X',
      licenseNo: 'L2',
      status: StakeholderStatus.ACTIVE
    });
    engine.createCommodityLot({
      lotId: 'LOT-RECEIPT-QTY',
      commodity: 'Test Grain',
      season: 'Kharif',
      quantityKg: 100,
      qualityGrade: 'A',
      source: 's',
      currentOwner: 'PROC-001',
      currentLocation: 'yard'
    });

    const stockOf = (org: string, commodity: string): number =>
      engine.exportState().stock.find(([key]) => key === `${org}:${commodity}`)?.[1] ?? 0;

    engine.dispatchLot({
      transferId: 'TR-RECEIPT-QTY-OVER',
      lotId: 'LOT-RECEIPT-QTY',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 60,
      vehicleNo: 'KA01AB0001'
    });

    expect(() => engine.receiveLot({ transferId: 'TR-RECEIPT-QTY-OVER', receivedQtyKg: 0 })).toThrow(/must be positive/);
    expect(() => engine.receiveLot({ transferId: 'TR-RECEIPT-QTY-OVER', receivedQtyKg: 61 })).toThrow(/cannot exceed dispatchedQtyKg/);
    expect(stockOf('PROC-001', 'Test Grain')).toBe(40);
    expect(stockOf('FCI-001', 'Test Grain')).toBe(0);

    const received = engine.receiveLot({ transferId: 'TR-RECEIPT-QTY-OVER', receivedQtyKg: 50 });
    expect(received.status).toBe(TransferStatus.RECEIVED_WITH_SHORTAGE);
    expect(received.shortageQtyKg).toBe(10);
    expect(stockOf('PROC-001', 'Test Grain') + stockOf('FCI-001', 'Test Grain')).toBe(90);
  });

  it('rejects dispatch with non-positive or over-stock dispatchedQtyKg (T1.3)', () => {
    const engine = new PdsLedgerEngine(false);
    engine.registerStakeholder({
      stakeholderId: 'PROC-001',
      stakeholderType: StakeholderType.PROCUREMENT_CENTER,
      name: 'Proc',
      district: 'X',
      licenseNo: 'L',
      status: StakeholderStatus.ACTIVE
    });
    engine.registerStakeholder({
      stakeholderId: 'FCI-001',
      stakeholderType: StakeholderType.FCI,
      name: 'Miller',
      district: 'X',
      licenseNo: 'L2',
      status: StakeholderStatus.ACTIVE
    });
    engine.createCommodityLot({
      lotId: 'LOT-QTY',
      commodity: 'Test Grain',
      season: 'Kharif',
      quantityKg: 50,
      qualityGrade: 'A',
      source: 's',
      currentOwner: 'PROC-001',
      currentLocation: 'yard'
    });

    expect(() =>
      engine.dispatchLot({
        transferId: 'TR-QTY-0',
        lotId: 'LOT-QTY',
        fromOrg: 'PROC-001',
        toOrg: 'FCI-001',
        dispatchedQtyKg: 0,
        vehicleNo: 'KA01AB0001'
      })
    ).toThrow(/must be positive/);

    expect(() =>
      engine.dispatchLot({
        transferId: 'TR-QTY-OVER',
        lotId: 'LOT-QTY',
        fromOrg: 'PROC-001',
        toOrg: 'FCI-001',
        dispatchedQtyKg: 999,
        vehicleNo: 'KA01AB0002'
      })
    ).toThrow(/Insufficient stock/);
  });

  it('rejects duplicate transfer, allocation, distribution and auth IDs (T6.3)', () => {
    const engine = new PdsLedgerEngine(true);
    // Seed a second transfer for duplicate-transfer test using the seeded lot.
    engine.dispatchLot({
      transferId: 'TR-DUP-1',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 100,
      vehicleNo: 'KA01AB0001'
    });
    expect(() =>
      engine.dispatchLot({
        transferId: 'TR-DUP-1',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'PROC-001',
        toOrg: 'FCI-001',
        dispatchedQtyKg: 100,
        vehicleNo: 'KA01AB0002'
      })
    ).toThrow(/already exists/);

    engine.addStockForTest('ISSUE-001', 'Rice', 100);

    engine.allocateToFps({
      allocationId: 'ALLOC-DUP-1',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 30,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    });
    engine.recordFpsReceipt({ allocationId: 'ALLOC-DUP-1', receivedQtyKg: 30 });
    expect(() =>
      engine.allocateToFps({
        allocationId: 'ALLOC-DUP-1',
        fpsId: 'FPS-101',
        commodity: 'Rice',
        allocatedQtyKg: 30,
        month: '2026-06',
        sourceGodownId: 'ISSUE-001'
      })
    ).toThrow(/already exists/);

    const auth = engine.simulateAuthentication({
      authTxnId: 'AUTH-DUP-1',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS
    });
    expect(() =>
      engine.simulateAuthentication({
        authTxnId: 'AUTH-DUP-1',
        beneficiaryRefHash: 'beneficiary-hash',
        rationCardHash: 'demo-ration-card-hash',
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS
      })
    ).toThrow(/already exists/);

    engine.recordDistribution({
      distributionId: 'DIST-DUP-1',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: 5,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      dealerId: 'DEALER-1',
      timestamp: '2026-06-09T10:10:00.000Z'
    });
    expect(() =>
      engine.recordDistribution({
        distributionId: 'DIST-DUP-1',
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: 5,
        authMode: auth.authMode,
        authResult: auth.authResult,
        authTxnRefHash: auth.authTxnRefHash,
        dealerId: 'DEALER-1',
        timestamp: '2026-06-09T10:10:00.000Z'
      })
    ).toThrow(/already exists/);
  });

  it('emits a CreateMonthlyEntitlement ledger event on create (T6.3)', () => {
    const engine = new PdsLedgerEngine(false);
    const before = engine.exportState().events.length;
    engine.createOrUpdateEntitlement({
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Rice',
      month: '2026-08',
      monthlyEntitlementKg: 25,
      alreadyLiftedKg: 0,
      availableBalanceKg: 25,
      active: true
    });
    const after = engine.exportState().events;
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)?.eventType).toBe('CreateMonthlyEntitlement');
    engine.createOrUpdateEntitlement({
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Rice',
      month: '2026-08',
      monthlyEntitlementKg: 30,
      alreadyLiftedKg: 0,
      availableBalanceKg: 30,
      active: true
    });
    const afterUpdate = engine.exportState().events;
    expect(afterUpdate.length).toBe(after.length + 1);
    expect(afterUpdate.at(-1)?.eventType).toBe('CreateMonthlyEntitlement');
  });

  it('rejects every PII denylist field and malformed hashes (T6.4)', () => {
    const engine = new PdsLedgerEngine(false);
    for (const field of ['aadhaar', 'mobile', 'otp', 'rationCard', 'rationCardNumber', 'phone']) {
      expect(() =>
        engine.applyLedgerEvent({
          ledgerTxId: `TX-PII-${field}`,
          entityType: 'stakeholder',
          entityId: 'S-1',
          eventType: 'RegisterStakeholder',
          payload: { stakeholderId: 'S-1', [field]: 'leak' },
          timestamp: '2026-06-01T00:00:00.000Z'
        })
      ).toThrow(/prohibited PII field/);
    }

    // Malformed hashes: too short, whitespace, raw numeric.
    expect(() =>
      engine.simulateAuthentication({
        authTxnId: 'AUTH-SHORT',
        beneficiaryRefHash: 'short',
        rationCardHash: 'demo-ration-card-hash',
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS
      })
    ).toThrow(/at least 8 characters/);
    expect(() =>
      engine.simulateAuthentication({
        authTxnId: 'AUTH-WS',
        beneficiaryRefHash: 'has whitespace',
        rationCardHash: 'demo-ration-card-hash',
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS
      })
    ).toThrow(/whitespace/);
    expect(() =>
      engine.createOrUpdateEntitlement({
        rationCardHash: '1234567890',
        commodity: 'Rice',
        month: '2026-06',
        monthlyEntitlementKg: 25,
        alreadyLiftedKg: 0,
        availableBalanceKg: 25,
        active: true
      })
    ).toThrow(/raw numeric identifier/);
  });

  it('derives the entitlement month from the distribution timestamp (T6.3)', () => {
    const engine = new PdsLedgerEngine(true);
    // Seed entitlement for 2026-07 then distribute with a July timestamp.
    engine.createOrUpdateEntitlement({
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Rice',
      month: '2026-07',
      monthlyEntitlementKg: 25,
      alreadyLiftedKg: 0,
      availableBalanceKg: 25,
      active: true
    });
    // Drive stock to FPS-101 for the July distribution. FPS-101 is already seeded.
    engine.addStockForTest('FPS-101', 'Rice', 100);
    const auth = engine.simulateAuthentication({
      authTxnId: 'AUTH-MONTH-1',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS
    });
    const dist = engine.recordDistribution({
      distributionId: 'DIST-MONTH-1',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: 10,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      dealerId: 'DEALER-1',
      timestamp: '2026-07-15T10:00:00.000Z'
    });
    expect(dist.distributionId).toBe('DIST-MONTH-1');
    expect(engine.getEntitlement('demo-ration-card-hash', 'Rice', '2026-07').availableBalanceKg).toBe(15);
  });
});

// ── Ration Card Lifecycle ─────────────────────────────────────────────────────

describe('Ration card lifecycle', () => {
  const makeEngine = () => {
    const engine = new PdsLedgerEngine(false);
    engine.registerStakeholder({ stakeholderId: 'FPS-RC-001', stakeholderType: StakeholderType.FAIR_PRICE_SHOP, name: 'FPS RC', district: 'D', licenseNo: 'L1', status: StakeholderStatus.ACTIVE });
    engine.registerStakeholder({ stakeholderId: 'FPS-RC-002', stakeholderType: StakeholderType.FAIR_PRICE_SHOP, name: 'FPS RC2', district: 'D', licenseNo: 'L2', status: StakeholderStatus.ACTIVE });
    return engine;
  };

  it('issues, activates, and records card history', () => {
    const engine = makeEngine();
    const card = engine.issueRationCard({ rationCardHash: 'abcdef1234567890', cardType: RationCardType.BPL, assignedFpsId: 'FPS-RC-001' });
    expect(card.status).toBe('ISSUED');
    const activated = engine.activateRationCard({ rationCardHash: 'abcdef1234567890' });
    expect(activated.status).toBe('ACTIVE');
    const history = engine.getRationCardHistory('abcdef1234567890');
    expect(history.map((e) => e.eventType)).toEqual(['IssueRationCard', 'ActivateRationCard']);
  });

  it('suspends a card and raises an audit alert', () => {
    const engine = makeEngine();
    engine.issueRationCard({ rationCardHash: 'abcdef1234567890', cardType: RationCardType.BPL, assignedFpsId: 'FPS-RC-001' });
    engine.activateRationCard({ rationCardHash: 'abcdef1234567890' });
    engine.suspendRationCard({ rationCardHash: 'abcdef1234567890', suspendReason: 'Duplicate beneficiary detected' });
    expect(engine.getAlerts().some((a) => a.entityId === 'abcdef1234567890')).toBe(true);
  });

  it('transfers a card between FPS and updates assignedFpsId', () => {
    const engine = makeEngine();
    engine.issueRationCard({ rationCardHash: 'abcdef1234567890', cardType: RationCardType.BPL, assignedFpsId: 'FPS-RC-001' });
    engine.activateRationCard({ rationCardHash: 'abcdef1234567890' });
    const transferred = engine.transferRationCard({ rationCardHash: 'abcdef1234567890', toFpsId: 'FPS-RC-002', authorizedBy: 'FoodAndCivilSuppliesMSP' });
    expect(transferred.assignedFpsId).toBe('FPS-RC-002');
    expect(transferred.transferHistory).toHaveLength(1);
  });

  it('blocks distribution when ration card is suspended', () => {
    const engine = makeEngine();
    engine.addStockForTest('FPS-RC-001', 'Rice', 100);
    engine.createOrUpdateEntitlement({ rationCardHash: 'abcdef1234567890', commodity: 'Rice', month: '2026-07', monthlyEntitlementKg: 25, alreadyLiftedKg: 0, availableBalanceKg: 25, active: true });
    engine.issueRationCard({ rationCardHash: 'abcdef1234567890', cardType: RationCardType.BPL, assignedFpsId: 'FPS-RC-001' });
    engine.activateRationCard({ rationCardHash: 'abcdef1234567890' });
    engine.suspendRationCard({ rationCardHash: 'abcdef1234567890', suspendReason: 'Fraud investigation' });
    expect(() =>
      engine.recordDistribution({
        distributionId: 'DIST-RC-BLOCK',
        fpsId: 'FPS-RC-001',
        rationCardHash: 'abcdef1234567890',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: 10,
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS,
        authTxnRefHash: 'atxhash',
        dealerId: 'D1',
        timestamp: '2026-07-10T10:00:00.000Z'
      })
    ).toThrow(/not active/);
  });

  it('rejects duplicate card issuance', () => {
    const engine = makeEngine();
    engine.issueRationCard({ rationCardHash: 'abcdef1234567890', cardType: RationCardType.BPL, assignedFpsId: 'FPS-RC-001' });
    expect(() => engine.issueRationCard({ rationCardHash: 'abcdef1234567890', cardType: RationCardType.AAY, assignedFpsId: 'FPS-RC-001' })).toThrow(/already exists/);
  });
});

// ── Grievance Tokens ──────────────────────────────────────────────────────────

describe('Grievance token with SLA', () => {
  it('files, acknowledges, and resolves a grievance', () => {
    const engine = new PdsLedgerEngine(false);
    const grievance = engine.fileGrievance({
      grievanceId: 'GRV-001',
      rationCardHash: 'abcdef1234567890',
      fpsId: 'FPS-001',
      grievanceType: GrievanceType.NOT_RECEIVED,
      description: 'Did not receive ration this month'
    });
    expect(grievance.status).toBe('OPEN');
    expect(grievance.slaDeadlineAt).toBeDefined();

    engine.acknowledgeGrievance({ grievanceId: 'GRV-001' });
    expect(engine.listGrievances()[0]?.status).toBe('ACKNOWLEDGED');

    const resolved = engine.resolveGrievance({ grievanceId: 'GRV-001', resolvedBy: 'FPS-DEALER-1', resolutionNote: 'Ration delivered on recheck' });
    expect(resolved.status).toBe('RESOLVED');
  });

  it('escalates overdue grievances and raises HIGH alerts', () => {
    const engine = new PdsLedgerEngine(false);
    engine.fileGrievance({
      grievanceId: 'GRV-OVERDUE',
      rationCardHash: 'abcdef1234567890',
      fpsId: 'FPS-001',
      grievanceType: GrievanceType.QUANTITY_SHORT,
      description: 'Received less than entitlement',
      filedAt: '2026-06-01T00:00:00.000Z' // 25+ days ago
    });
    const result = engine.escalateOverdueGrievances({ currentTimestamp: '2026-06-30T00:00:00.000Z' });
    expect(result.escalated).toHaveLength(1);
    expect(result.alerts.some((a) => a.alertType === AlertType.GRIEVANCE_SLA_BREACH)).toBe(true);
    expect(engine.listGrievances()[0]?.status).toBe('ESCALATED');
  });

  it('rejects description over 500 chars', () => {
    const engine = new PdsLedgerEngine(false);
    expect(() =>
      engine.fileGrievance({
        grievanceId: 'GRV-LONG',
        rationCardHash: 'abcdef1234567890',
        fpsId: 'FPS-001',
        grievanceType: GrievanceType.OTHER,
        description: 'x'.repeat(501)
      })
    ).toThrow(/500 characters/);
  });
});

// ── Entitlement Rules Engine ──────────────────────────────────────────────────

describe('Entitlement rules engine', () => {
  it('propose → approve → active; previous rule superseded', () => {
    const engine = new PdsLedgerEngine(false);
    engine.proposeEntitlementRule({ ruleId: 'RULE-001', category: RationCardType.BPL, commodity: 'Rice', monthlyKg: 25, effectiveFrom: '2026-01', proposedBy: 'FoodAndCivilSuppliesMSP' });
    engine.approveEntitlementRule({ ruleId: 'RULE-001', approvedBy: 'AuditAuthorityMSP' });
    expect(engine.getActiveEntitlementRules()).toHaveLength(1);
    expect(engine.getActiveEntitlementRules()[0]?.ruleId).toBe('RULE-001');

    // Propose and approve a replacement
    engine.proposeEntitlementRule({ ruleId: 'RULE-002', category: RationCardType.BPL, commodity: 'Rice', monthlyKg: 30, effectiveFrom: '2026-07', proposedBy: 'FoodAndCivilSuppliesMSP' });
    engine.approveEntitlementRule({ ruleId: 'RULE-002', approvedBy: 'AuditAuthorityMSP' });
    const active = engine.getActiveEntitlementRules();
    expect(active).toHaveLength(1);
    expect(active[0]?.ruleId).toBe('RULE-002');
  });

  it('rejects entitlement exceeding active rule cap', () => {
    const engine = new PdsLedgerEngine(false);
    engine.proposeEntitlementRule({ ruleId: 'RULE-CAP', category: RationCardType.BPL, commodity: 'Rice', monthlyKg: 20, effectiveFrom: '2026-01', proposedBy: 'FoodAndCivilSuppliesMSP' });
    engine.approveEntitlementRule({ ruleId: 'RULE-CAP', approvedBy: 'AuditAuthorityMSP' });
    expect(() =>
      engine.createOrUpdateEntitlement({ rationCardHash: 'abcdef1234567890', commodity: 'Rice', month: '2026-07', monthlyEntitlementKg: 25, alreadyLiftedKg: 0, availableBalanceKg: 25, active: true, category: RationCardType.BPL })
    ).toThrow(/exceeds active rule cap/);
  });

  it('allows entitlement within rule cap', () => {
    const engine = new PdsLedgerEngine(false);
    engine.proposeEntitlementRule({ ruleId: 'RULE-OK', category: RationCardType.BPL, commodity: 'Rice', monthlyKg: 25, effectiveFrom: '2026-01', proposedBy: 'FoodAndCivilSuppliesMSP' });
    engine.approveEntitlementRule({ ruleId: 'RULE-OK', approvedBy: 'AuditAuthorityMSP' });
    expect(() =>
      engine.createOrUpdateEntitlement({ rationCardHash: 'abcdef1234567890', commodity: 'Rice', month: '2026-07', monthlyEntitlementKg: 25, alreadyLiftedKg: 0, availableBalanceKg: 25, active: true, category: RationCardType.BPL })
    ).not.toThrow();
  });

  it('rejects approval of non-pending rule', () => {
    const engine = new PdsLedgerEngine(false);
    engine.proposeEntitlementRule({ ruleId: 'RULE-X', category: RationCardType.AAY, commodity: 'Wheat', monthlyKg: 35, effectiveFrom: '2026-01', proposedBy: 'FoodAndCivilSuppliesMSP' });
    engine.approveEntitlementRule({ ruleId: 'RULE-X', approvedBy: 'AuditAuthorityMSP' });
    expect(() => engine.approveEntitlementRule({ ruleId: 'RULE-X', approvedBy: 'AuditAuthorityMSP' })).toThrow(/not pending approval/);
  });
});

// ── Quota Rollover ────────────────────────────────────────────────────────────

describe('Quota rollover', () => {
  it('carries forward unclaimed balance at given percentage', () => {
    const engine = new PdsLedgerEngine(false);
    // Beneficiary has 25kg entitlement and only lifted 10kg — 15kg unclaimed
    engine.createOrUpdateEntitlement({ rationCardHash: 'abcdef1234567890', commodity: 'Rice', month: '2026-06', monthlyEntitlementKg: 25, alreadyLiftedKg: 10, availableBalanceKg: 15, active: true });
    const result = engine.rolloverUnclaimedQuota({ fromMonth: '2026-06', toMonth: '2026-07', commodity: 'Rice', rolloverPct: 50 });
    expect(result.beneficiariesAffected).toBe(1);
    expect(result.rolledOver).toBe(7); // Math.floor(15 * 50 / 100)
    const next = engine.getEntitlement('abcdef1234567890', 'Rice', '2026-07');
    expect(next.availableBalanceKg).toBe(7);
  });

  it('adds rollover to existing next-month entitlement', () => {
    const engine = new PdsLedgerEngine(false);
    engine.createOrUpdateEntitlement({ rationCardHash: 'abcdef1234567890', commodity: 'Rice', month: '2026-06', monthlyEntitlementKg: 25, alreadyLiftedKg: 0, availableBalanceKg: 25, active: true });
    engine.createOrUpdateEntitlement({ rationCardHash: 'abcdef1234567890', commodity: 'Rice', month: '2026-07', monthlyEntitlementKg: 25, alreadyLiftedKg: 0, availableBalanceKg: 25, active: true });
    engine.rolloverUnclaimedQuota({ fromMonth: '2026-06', toMonth: '2026-07', commodity: 'Rice', rolloverPct: 100 });
    const next = engine.getEntitlement('abcdef1234567890', 'Rice', '2026-07');
    expect(next.availableBalanceKg).toBe(50);
  });

  it('rejects invalid rollover percentage', () => {
    const engine = new PdsLedgerEngine(false);
    expect(() => engine.rolloverUnclaimedQuota({ fromMonth: '2026-06', toMonth: '2026-07', commodity: 'Rice', rolloverPct: 150 })).toThrow(/between 0 and 100/);
  });

  it('rejects non-positive allocation quantities', () => {
    const engine = new PdsLedgerEngine(true);
    engine.addStockForTest('ISSUE-001', 'Rice', 500);
    expect(() =>
      engine.allocateToFps({
        allocationId: 'ALLOC-NEG-1',
        fpsId: 'FPS-101',
        commodity: 'Rice',
        allocatedQtyKg: 0,
        month: '2026-06',
        sourceGodownId: 'ISSUE-001'
      })
    ).toThrow(/allocatedQtyKg must be positive/);
    expect(() =>
      engine.allocateToFps({
        allocationId: 'ALLOC-NEG-2',
        fpsId: 'FPS-101',
        commodity: 'Rice',
        allocatedQtyKg: -50,
        month: '2026-06',
        sourceGodownId: 'ISSUE-001'
      })
    ).toThrow(/allocatedQtyKg must be positive/);
  });

  it('rejects allocation beyond available godown stock and raises an audit alert', () => {
    const engine = new PdsLedgerEngine(true);
    engine.addStockForTest('ISSUE-001', 'Rice', 100);
    expect(() =>
      engine.allocateToFps({
        allocationId: 'ALLOC-OVER-1',
        fpsId: 'FPS-101',
        commodity: 'Rice',
        allocatedQtyKg: 500,
        month: '2026-06',
        sourceGodownId: 'ISSUE-001'
      })
    ).toThrow(/Insufficient stock/);
    expect(
      engine.getAlerts().some((alert) => alert.alertType === AlertType.UNAUTHORIZED_TRANSACTION && alert.entityId === 'ALLOC-OVER-1')
    ).toBe(true);
  });

  it('rejects fps receipt quantities outside the allocated amount', () => {
    const engine = new PdsLedgerEngine(true);
    engine.addStockForTest('ISSUE-001', 'Rice', 500);
    engine.allocateToFps({
      allocationId: 'ALLOC-RCPT-1',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 200,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    });
    expect(() =>
      engine.recordFpsReceipt({ allocationId: 'ALLOC-RCPT-1', receivedQtyKg: 0 })
    ).toThrow(/receivedQtyKg must be positive/);
    expect(() =>
      engine.recordFpsReceipt({ allocationId: 'ALLOC-RCPT-1', receivedQtyKg: 250 })
    ).toThrow(/cannot exceed allocatedQtyKg/);
    expect(
      engine.getAlerts().some((alert) => alert.alertType === AlertType.UNAUTHORIZED_TRANSACTION && alert.entityId === 'ALLOC-RCPT-1')
    ).toBe(true);
    const received = engine.recordFpsReceipt({ allocationId: 'ALLOC-RCPT-1', receivedQtyKg: 180 });
    expect(received.status).toBe('RECEIVED_WITH_SHORTAGE');
    expect(received.receivedQtyKg).toBe(180);
    expect(received.shortageQtyKg).toBe(20);
    expect(
      engine.getAlerts().some(
        (alert) =>
          alert.alertType === AlertType.SHORT_RECEIPT &&
          alert.entityId === 'ALLOC-RCPT-1' &&
          alert.evidence.shortageQtyKg === 20
      )
    ).toBe(true);
  });

  it('rejects non-positive distribution quantities', () => {
    const engine = new PdsLedgerEngine(true);
    engine.addStockForTest('FPS-101', 'Rice', 100);
    expect(() =>
      engine.recordDistribution({
        distributionId: 'DIST-NEG-1',
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: -5,
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS,
        authTxnRefHash: 'auth-ref-neg',
        dealerId: 'FPS-DEALER-101',
        timestamp: '2026-06-15T10:00:00.000Z'
      })
    ).toThrow(/deliveredKg must be positive/);
  });
});

describe('resetTransactionalData', () => {
  it('clears movement/quantity data but keeps stakeholders, ration cards, and entitlement rules', () => {
    const engine = new PdsLedgerEngine(true);
    engine.dispatchLot({
      transferId: 'TR-RESET-SETUP',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB0101'
    });
    engine.createOrUpdateEntitlement({
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Rice',
      month: '2026-06',
      monthlyEntitlementKg: 25,
      alreadyLiftedKg: 25,
      availableBalanceKg: 0,
      active: true
    });

    const stakeholderCountBefore = engine.snapshot().stakeholders.length;
    const rationCardCountBefore = engine.snapshot().rationCards.length;

    const result = engine.resetTransactionalData();

    expect(result.ledgerTxId).toMatch(/^TX-/);
    expect(result.seriesId).toMatch(/^R\d{8}-\d{6}-/);
    expect(result.lots).toHaveLength(6);
    expect(result.lots.every((lot) => lot.lotId.includes(result.seriesId))).toBe(true);
    const state = engine.exportState();
    // Reseeded under a new series with CreateCommodityLot events for Fabric sync.
    expect(state.seriesId).toBe(result.seriesId);
    expect(state.lots).toHaveLength(6);
    expect(state.lots.map((lot) => lot.commodity)).toEqual(
      expect.arrayContaining(['Rice', 'Wheat', 'Dal', 'Sugar', 'Cooking Oil', 'Kerosene'])
    );
    expect(state.lots.every((lot) => lot.lotId.includes(result.seriesId))).toBe(true);
    expect(state.transfers).toHaveLength(0);
    expect(state.allocations).toHaveLength(0);
    expect(state.distributions).toHaveLength(0);
    expect(state.alerts).toHaveLength(0);
    expect(new Map(state.stock).get('PROC-001:Rice')).toBe(10000);
    expect(new Map(state.stock).get('PROC-001:Wheat')).toBe(7000);
    expect(state.events.some((event) => event.eventType === 'RegisterStakeholder')).toBe(true);
    expect(state.events.some((event) => event.eventType === 'ResetTransactionalData')).toBe(true);
    expect(state.events.filter((event) => event.eventType === 'CreateCommodityLot')).toHaveLength(6);
    expect(state.events).toHaveLength(stakeholderCountBefore + 7);

    const entitlement = state.entitlements.find((item) => item.rationCardHash === 'demo-ration-card-hash');
    expect(entitlement?.alreadyLiftedKg).toBe(0);
    expect(entitlement?.availableBalanceKg).toBe(entitlement?.monthlyEntitlementKg);

    expect(state.stakeholders.length).toBe(stakeholderCountBefore);
    expect(state.rationCards.length).toBe(rationCardCountBefore);

    engine.createCommodityLot({
      lotId: 'LOT-RICE-2026-999',
      commodity: 'Rice',
      season: 'Kharif 2026',
      quantityKg: 5000,
      qualityGrade: 'A',
      source: 'Manual top-up',
      currentOwner: 'PROC-001',
      currentLocation: 'Procurement Yard'
    });
    const stockAfterTopUp = new Map(engine.exportState().stock);
    expect(stockAfterTopUp.get('PROC-001:Rice')).toBe(15000);
  });

  // Regression: the fabric-chaincode-runtime persistence path replays every
  // mutation through applyLedgerEvent -> projectEventToState on a freshly
  // loaded engine (see PdsChaincodeInvoker.submitLedgerEvent). If a new event
  // type is added to ALLOWED_LEDGER_EVENT_TYPES without a matching projection
  // case, that replay throws and crashes the API process.
  it('replays via applyLedgerEvent without throwing (chaincode-runtime persistence path)', () => {
    const source = new PdsLedgerEngine(true);
    source.dispatchLot({
      transferId: 'TR-RESET-REPLAY',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB0102'
    });
    const resetResult = source.resetTransactionalData();
    const resetEvents = source.exportState().events;
    expect(resetEvents.some((event) => event.eventType === 'RegisterStakeholder')).toBe(true);
    expect(resetEvents.some((event) => event.eventType === 'ResetTransactionalData')).toBe(true);
    expect(resetEvents.filter((event) => event.eventType === 'CreateCommodityLot')).toHaveLength(6);

    const replayTarget = new PdsLedgerEngine(true);
    for (const event of resetEvents) {
      expect(() => replayTarget.applyLedgerEvent(event)).not.toThrow();
    }

    const replayedState = replayTarget.exportState();
    expect(replayedState.seriesId).toBe(resetResult.seriesId);
    expect(replayedState.lots).toHaveLength(6);
    expect(replayedState.lots.map((lot) => lot.commodity)).toEqual(
      expect.arrayContaining(['Rice', 'Wheat', 'Dal', 'Sugar', 'Cooking Oil', 'Kerosene'])
    );
    expect(replayedState.lots.every((lot) => lot.lotId.includes(resetResult.seriesId))).toBe(true);
    expect(new Map(replayedState.stock).get('PROC-001:Rice')).toBe(10000);
    expect(new Map(replayedState.stock).get('PROC-001:Wheat')).toBe(7000);
    expect(replayedState.events.some((event) => event.eventType === 'ResetTransactionalData')).toBe(true);
    expect(replayedState.stakeholders.length).toBeGreaterThan(0);
  });

  it('scopes the reset to a single commodity, leaving other commodities untouched', () => {
    const engine = new PdsLedgerEngine(true);
    engine.dispatchLot({
      transferId: 'TR-RESET-RICE',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB0101'
    });
    engine.dispatchLot({
      transferId: 'TR-RESET-WHEAT',
      lotId: 'LOT-WHEAT-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 500,
      vehicleNo: 'KA01AB0103'
    });
    engine.raiseAuditFlag({
      alertType: AlertType.SHORT_RECEIPT,
      entityId: 'TR-RESET-RICE',
      message: 'Rice shortage under investigation',
      evidence: {}
    });
    engine.raiseAuditFlag({
      alertType: AlertType.SHORT_RECEIPT,
      entityId: 'TR-RESET-WHEAT',
      message: 'Wheat shortage under investigation',
      evidence: {}
    });
    engine.createOrUpdateEntitlement({
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Rice',
      month: '2026-06',
      monthlyEntitlementKg: 25,
      alreadyLiftedKg: 25,
      availableBalanceKg: 0,
      active: true
    });
    engine.createOrUpdateEntitlement({
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Wheat',
      month: '2026-06',
      monthlyEntitlementKg: 10,
      alreadyLiftedKg: 10,
      availableBalanceKg: 0,
      active: true
    });

    const result = engine.resetTransactionalData('Rice');
    expect(result.ledgerTxId).toMatch(/^TX-/);

    const state = engine.exportState();
    const stock = new Map(state.stock);

    // Rice: cleared and reseeded under a new series.
    expect(state.lots.filter((lot) => lot.commodity === 'Rice')).toHaveLength(1);
    expect(state.lots.find((lot) => lot.commodity === 'Rice')?.lotId).toContain(result.seriesId);
    expect(state.lots.find((lot) => lot.commodity === 'Rice')?.lotId).not.toBe('LOT-RICE-2026-001');
    expect(state.transfers.some((transfer) => transfer.transferId === 'TR-RESET-RICE')).toBe(false);
    expect(state.alerts.some((alert) => alert.entityId === 'TR-RESET-RICE')).toBe(false);
    expect(stock.get('PROC-001:Rice')).toBe(10000);
    const riceEntitlement = state.entitlements.find(
      (item) => item.rationCardHash === 'demo-ration-card-hash' && item.commodity === 'Rice'
    );
    expect(riceEntitlement?.alreadyLiftedKg).toBe(0);
    expect(riceEntitlement?.availableBalanceKg).toBe(25);

    // Wheat: untouched by the Rice-scoped reset.
    expect(state.transfers.some((transfer) => transfer.transferId === 'TR-RESET-WHEAT')).toBe(true);
    expect(state.alerts.some((alert) => alert.entityId === 'TR-RESET-WHEAT')).toBe(true);
    expect(stock.get('PROC-001:Wheat')).toBe(6500);
    const wheatEntitlement = state.entitlements.find(
      (item) => item.rationCardHash === 'demo-ration-card-hash' && item.commodity === 'Wheat'
    );
    expect(wheatEntitlement?.alreadyLiftedKg).toBe(10);

    // The reset event itself, and the surviving Wheat-related event, remain in
    // history — a commodity-scoped reset does not wipe unrelated history.
    expect(state.events.some((event) => event.eventType === 'ResetTransactionalData')).toBe(true);
    expect(state.events.some((event) => event.entityId === 'TR-RESET-WHEAT')).toBe(true);
    expect(state.events.some((event) => event.entityId === 'TR-RESET-RICE')).toBe(false);
  });

  it('replays a commodity-scoped reset event without affecting other commodities', () => {
    const source = new PdsLedgerEngine(true);
    source.dispatchLot({
      transferId: 'TR-RESET-REPLAY-RICE',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB0104'
    });
    source.dispatchLot({
      transferId: 'TR-RESET-REPLAY-WHEAT',
      lotId: 'LOT-WHEAT-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 500,
      vehicleNo: 'KA01AB0105'
    });
    const resetResult = source.resetTransactionalData('Rice');
    const resetEvents = source
      .exportState()
      .events.filter(
        (event) =>
          event.eventType === 'ResetTransactionalData' ||
          (event.eventType === 'CreateCommodityLot' && String(event.payload.commodity) === 'Rice')
      );
    const resetEvent = resetEvents.find((event) => event.eventType === 'ResetTransactionalData');
    expect(resetEvent?.payload.commodity).toBe('Rice');
    expect(resetEvent?.payload.seriesId).toBe(resetResult.seriesId);

    const replayTarget = new PdsLedgerEngine(true);
    replayTarget.dispatchLot({
      transferId: 'TR-RESET-REPLAY-RICE',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB0104'
    });
    replayTarget.dispatchLot({
      transferId: 'TR-RESET-REPLAY-WHEAT',
      lotId: 'LOT-WHEAT-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: 500,
      vehicleNo: 'KA01AB0105'
    });
    for (const event of resetEvents) {
      expect(() => replayTarget.applyLedgerEvent(event)).not.toThrow();
    }

    const replayedState = replayTarget.exportState();
    expect(replayedState.transfers.some((transfer) => transfer.transferId === 'TR-RESET-REPLAY-RICE')).toBe(false);
    expect(replayedState.transfers.some((transfer) => transfer.transferId === 'TR-RESET-REPLAY-WHEAT')).toBe(true);
    expect(replayedState.lots.find((lot) => lot.commodity === 'Rice')?.lotId).toContain(resetResult.seriesId);
    expect(new Map(replayedState.stock).get('PROC-001:Rice')).toBe(10000);
    expect(new Map(replayedState.stock).get('PROC-001:Wheat')).toBe(6500);
  });

  it('uses a different series id on each full reset', () => {
    const engine = new PdsLedgerEngine(true);
    const first = engine.resetTransactionalData();
    const second = engine.resetTransactionalData();
    expect(first.seriesId).not.toBe(second.seriesId);
    expect(first.lots[0]?.lotId).not.toBe(second.lots[0]?.lotId);
  });
});
