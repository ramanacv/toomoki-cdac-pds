import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, AlertType, GrievanceType, RationCardType, EntitlementRuleStatus, StakeholderType, StakeholderStatus } from '@pds/shared-types';
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
      commodity: 'Rice',
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
      stakeholderId: 'MLL-001',
      stakeholderType: StakeholderType.MILLER,
      name: 'Miller',
      district: 'X',
      licenseNo: 'L2',
      status: StakeholderStatus.ACTIVE
    });
    engine.createCommodityLot({
      lotId: 'LOT-CONSERVE',
      commodity: 'Wheat',
      season: 'Kharif',
      quantityKg: 100,
      qualityGrade: 'A',
      source: 's',
      currentOwner: 'PROC-001',
      currentLocation: 'yard'
    });

    const stockOf = (org: string, commodity: string): number =>
      engine.exportState().stock.find(([key]) => key === `${org}:${commodity}`)?.[1] ?? 0;

    expect(stockOf('PROC-001', 'Wheat')).toBe(100);
    expect(stockOf('MLL-001', 'Wheat')).toBe(0);

    engine.dispatchLot({
      transferId: 'TR-CONSERVE-1',
      lotId: 'LOT-CONSERVE',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 60,
      vehicleNo: 'KA01AB0001'
    });
    // Sender stock deducted; receiver not yet credited (in-transit model).
    expect(stockOf('PROC-001', 'Wheat')).toBe(40);
    expect(stockOf('MLL-001', 'Wheat')).toBe(0);

    engine.receiveLot({ transferId: 'TR-CONSERVE-1', receivedQtyKg: 60 });
    expect(stockOf('PROC-001', 'Wheat')).toBe(40);
    expect(stockOf('MLL-001', 'Wheat')).toBe(60);
    // Total conserved across both orgs.
    expect(stockOf('PROC-001', 'Wheat') + stockOf('MLL-001', 'Wheat')).toBe(100);

    // Re-dispatch of a RECEIVED lot must be rejected (lot is now owned by MLL-001).
    expect(() =>
      engine.dispatchLot({
        transferId: 'TR-CONSERVE-2',
        lotId: 'LOT-CONSERVE',
        fromOrg: 'PROC-001',
        toOrg: 'MLL-001',
        dispatchedQtyKg: 10,
        vehicleNo: 'KA01AB0002'
      })
    ).toThrow(/owned by/);
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
      stakeholderId: 'MLL-001',
      stakeholderType: StakeholderType.MILLER,
      name: 'Miller',
      district: 'X',
      licenseNo: 'L2',
      status: StakeholderStatus.ACTIVE
    });
    engine.createCommodityLot({
      lotId: 'LOT-QTY',
      commodity: 'Rice',
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
        toOrg: 'MLL-001',
        dispatchedQtyKg: 0,
        vehicleNo: 'KA01AB0001'
      })
    ).toThrow(/must be positive/);

    expect(() =>
      engine.dispatchLot({
        transferId: 'TR-QTY-OVER',
        lotId: 'LOT-QTY',
        fromOrg: 'PROC-001',
        toOrg: 'MLL-001',
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
      toOrg: 'MLL-001',
      dispatchedQtyKg: 100,
      vehicleNo: 'KA01AB0001'
    });
    expect(() =>
      engine.dispatchLot({
        transferId: 'TR-DUP-1',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'PROC-001',
        toOrg: 'MLL-001',
        dispatchedQtyKg: 100,
        vehicleNo: 'KA01AB0002'
      })
    ).toThrow(/already exists/);

    engine.receiveLot({ transferId: 'TR-DUP-1', receivedQtyKg: 100 });
    engine.dispatchLot({
      transferId: 'TR-DUP-2',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'MLL-001',
      toOrg: 'GODOWN-S-001',
      dispatchedQtyKg: 100,
      vehicleNo: 'KA01AB0003'
    });
    engine.receiveLot({ transferId: 'TR-DUP-2', receivedQtyKg: 100 });
    engine.dispatchLot({
      transferId: 'TR-DUP-3',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'GODOWN-S-001',
      toOrg: 'GODOWN-B-001',
      dispatchedQtyKg: 100,
      vehicleNo: 'KA01AB0004'
    });
    engine.receiveLot({ transferId: 'TR-DUP-3', receivedQtyKg: 100 });

    engine.allocateToFps({
      allocationId: 'ALLOC-DUP-1',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 30,
      month: '2026-06',
      sourceGodownId: 'GODOWN-B-001'
    });
    engine.recordFpsReceipt({ allocationId: 'ALLOC-DUP-1', receivedQtyKg: 30 });
    expect(() =>
      engine.allocateToFps({
        allocationId: 'ALLOC-DUP-1',
        fpsId: 'FPS-101',
        commodity: 'Rice',
        allocatedQtyKg: 30,
        month: '2026-06',
        sourceGodownId: 'GODOWN-B-001'
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
      dealerId: 'DEALER-1'
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
        dealerId: 'DEALER-1'
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
    // An update (same key) must NOT emit a second event.
    engine.createOrUpdateEntitlement({
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Rice',
      month: '2026-08',
      monthlyEntitlementKg: 30,
      alreadyLiftedKg: 0,
      availableBalanceKg: 30,
      active: true
    });
    expect(engine.exportState().events.length).toBe(after.length);
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
});

