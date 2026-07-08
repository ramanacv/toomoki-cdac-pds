import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { demoQuantities } from '@pds/fixtures';
import { AlertType, AuthMode, AuthResult, StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { PdsRuntime } from '../src/pds-runtime.js';

const createStatePath = (): string => join(mkdtempSync(join(tmpdir(), 'pds-api-')), 'state.json');

const boot = async (seed: boolean, statePath: string): Promise<PdsRuntime> => {
  const service = new PdsRuntime(seed, statePath, { deferBootstrap: true });
  await service.bootstrapFromPersistenceAsync();
  return service;
};

/** Drain in-flight persists before the test's temp dir is removed. */
const cleanup = async (service: PdsRuntime, statePath: string): Promise<void> => {
  try {
    await service.flushPersist();
  } catch {
    // ignore persist errors during cleanup
  }
  rmSync(dirname(statePath), { recursive: true, force: true });
};

describe('PdsRuntime', () => {
  it('persists state across service instances', async () => {
    const statePath = createStatePath();
    let service: PdsRuntime | null = null;
    try {
      const first = await boot(true, statePath);
      service = first;
      first.registerStakeholder({
        stakeholderId: 'TEST-001',
        stakeholderType: StakeholderType.DEPARTMENT,
        name: 'Test Department',
        district: 'Demo District',
        licenseNo: 'TEST-LIC-001',
        status: StakeholderStatus.ACTIVE
      });
      await first.flushPersist();

      const second = await boot(false, statePath);
      service = second;
      expect(second.listStakeholders().some((stakeholder) => stakeholder.stakeholderId === 'TEST-001')).toBe(true);
    } finally {
      if (service) await cleanup(service, statePath);
    }
  });

  it('provides a seeded summary', async () => {
    const statePath = createStatePath();
    const service = await boot(true, statePath);
    try {
      const summary = service.getDashboardSummary();
      expect(summary.activeLots).toBeGreaterThan(0);
      expect(service.listLots().length).toBeGreaterThan(0);
    } finally {
      await cleanup(service, statePath);
    }
  });

  it('returns direct lookups for lot, transfer, and allocation records', async () => {
    const statePath = createStatePath();
    const service = await boot(true, statePath);
    try {
      expect(service.getLot('LOT-RICE-2026-001').lotId).toBe('LOT-RICE-2026-001');
      expect(() => service.getTransfer('TR-000')).toThrow();
      service.dispatchLot({ transferId: 'TR-LOOKUP-001', lotId: 'LOT-RICE-2026-001', fromOrg: 'PROC-001', toOrg: 'FCI-001', dispatchedQtyKg: 100, vehicleNo: 'KA01AB0004' });
      service.receiveLot({ transferId: 'TR-LOOKUP-001', receivedQtyKg: 100 });
      service.addStockForTest('GODOWN-B-001', 'Rice', 100);
      service.allocateToFps({ allocationId: 'ALLOC-LOOKUP-001', fpsId: 'FPS-101', commodity: 'Rice', allocatedQtyKg: 50, month: '2026-06', sourceGodownId: 'GODOWN-B-001' });
      const auth = service.simulateAuthentication({ authTxnId: 'AUTH-LOOKUP-001', beneficiaryRefHash: 'beneficiary-hash', rationCardHash: 'demo-ration-card-hash', authMode: AuthMode.MOCK_OTP, authResult: AuthResult.SUCCESS });

      expect(service.getTransfer('TR-LOOKUP-001').transferId).toBe('TR-LOOKUP-001');
      expect(service.getAllocation('ALLOC-LOOKUP-001').allocationId).toBe('ALLOC-LOOKUP-001');
      expect(service.getAuthTransaction(auth.authTxnId).authTxnId).toBe('AUTH-LOOKUP-001');
      expect(service.listEntitlements().some((item) => item.rationCardHash === 'demo-ration-card-hash')).toBe(true);
    } finally {
      await cleanup(service, statePath);
    }
  });

  it('supports end-to-end distribution flow', async () => {
    const statePath = createStatePath();
    const service = await boot(true, statePath);
    try {
      service.addStockForTest('GODOWN-B-001', 'Rice', demoQuantities.fpsAllocationKg);
      service.allocateToFps({ allocationId: 'ALLOC-API-001', fpsId: 'FPS-101', commodity: 'Rice', allocatedQtyKg: demoQuantities.fpsAllocationKg, month: '2026-06', sourceGodownId: 'GODOWN-B-001' });
      service.recordFpsReceipt({ allocationId: 'ALLOC-API-001', receivedQtyKg: demoQuantities.fpsReceiptKg });
      const auth = service.simulateAuthentication({ authTxnId: 'AUTH-API-001', beneficiaryRefHash: 'beneficiary-hash', rationCardHash: 'demo-ration-card-hash', authMode: AuthMode.MOCK_OTP, authResult: AuthResult.SUCCESS });
      const distribution = service.recordDistribution({
        distributionId: 'DIST-API-001',
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: demoQuantities.citizenDistributionKg,
        authMode: auth.authMode,
        authResult: auth.authResult,
        authTxnRefHash: auth.authTxnRefHash,
        dealerId: 'DEALER-001',
        timestamp: '2026-06-09T10:10:00.000Z'
      });
      expect(distribution.ledgerTxId).toBeDefined();
      expect(service.getDistributionReceipt('DIST-API-001').distributionId).toBe('DIST-API-001');
      expect(service.listDistributions().some((item) => item.distributionId === 'DIST-API-001')).toBe(true);
    } finally {
      await cleanup(service, statePath);
    }
  });

  it('supports the role-workbench POC sequence from seed state', async () => {
    const statePath = createStatePath();
    const service = await boot(true, statePath);
    try {
      const approval = service.authorizeMovement({
        transferId: 'TR-POC-MILLER-ISSUE',
        authorizedBy: 'DSO-001',
        roRef: 'RO-DSO-POC-001'
      });
      expect(approval.ledgerTxId).toBeDefined();

      const legs = [
        ['TR-POC-PROC-FCI', 'LOT-RICE-2026-001', 'PROC-001', 'FCI-001', demoQuantities.stageOneTransferKg, 'KA01AB1999'],
        ['TR-POC-FCI-BUF', 'LOT-RICE-2026-001', 'FCI-001', 'FCI-BUF-001', demoQuantities.stageOneTransferKg, 'FCI01AB2001'],
        ['TR-POC-BUF-DEPOT', 'LOT-RICE-2026-001', 'FCI-BUF-001', 'GODOWN-S-001', demoQuantities.stageOneTransferKg, 'KA01AB2002'],
        ['TR-POC-DEPOT-MILLER', 'LOT-RICE-2026-001', 'GODOWN-S-001', 'MLL-001', demoQuantities.stageOneTransferKg, 'KA01AB2003']
      ] as const;

      for (const [transferId, lotId, fromOrg, toOrg, dispatchedQtyKg, vehicleNo] of legs) {
        service.dispatchLot({ transferId, lotId, fromOrg, toOrg, dispatchedQtyKg, vehicleNo, stage: 'I', transporterId: 'TRANS-001' });
        service.receiveLot({ transferId, receivedQtyKg: dispatchedQtyKg });
      }

      const childLot = service.transformLot({
        parentLotId: 'LOT-RICE-2026-001',
        childLotId: 'LOT-RICE-2026-002',
        transformedBy: 'MLL-001',
        commodity: 'Rice',
        quantityKg: demoQuantities.millerToIssueKg,
        qualityGrade: 'A',
        source: 'Miller 01'
      });
      expect(childLot.currentOwner).toBe('MLL-001');

      service.dispatchLot({
        transferId: 'TR-POC-MILLER-ISSUE',
        lotId: 'LOT-RICE-2026-002',
        fromOrg: 'MLL-001',
        toOrg: 'ISSUE-001',
        dispatchedQtyKg: demoQuantities.millerToIssueKg,
        vehicleNo: 'KA01AB2004',
        stage: 'II',
        roRef: 'RO-DSO-POC-001',
        transporterId: 'TRANS-001',
        transformedFromLotId: 'LOT-RICE-2026-001'
      });
      service.receiveLot({ transferId: 'TR-POC-MILLER-ISSUE', receivedQtyKg: demoQuantities.millerToIssueKg });

      const endpointLegs = [
        ['TR-POC-ISSUE-FPS', 'FPS-101', demoQuantities.endpointDispatchKg.fps, 'KA01AB2005', 'RO-DSO-POC-FPS'],
        ['TR-POC-ISSUE-WI', 'WI-101', demoQuantities.endpointDispatchKg.welfareInstitute, 'KA01AB2006', 'RO-DSO-POC-WI'],
        ['TR-POC-ISSUE-SBE', 'SBE-101', demoQuantities.endpointDispatchKg.shivBhojan, 'KA01AB2007', 'RO-DSO-POC-SBE']
      ] as const;
      for (const [transferId, toOrg, dispatchedQtyKg, vehicleNo, roRef] of endpointLegs) {
        service.dispatchLot({
          transferId,
          lotId: 'LOT-RICE-2026-002',
          fromOrg: 'ISSUE-001',
          toOrg,
          dispatchedQtyKg,
          vehicleNo,
          stage: 'II',
          roRef,
          authorizedBy: 'DSO-001',
          transporterId: 'TRANS-001'
        });
        service.receiveLot({ transferId, receivedQtyKg: dispatchedQtyKg });
      }

      const distribution = service.recordDistribution({
        distributionId: 'DIST-POC-001',
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: demoQuantities.citizenDistributionKg,
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS,
        authTxnRefHash: 'auth-ref-poc-001',
        dealerId: 'FPS-DEALER-101',
        timestamp: '2026-06-30T10:00:00.000Z'
      });
      expect(distribution.ledgerTxId).toBeDefined();

      expect(() =>
        service.recordDistribution({
          distributionId: 'DIST-POC-002',
          fpsId: 'FPS-101',
          rationCardHash: 'demo-ration-card-hash',
          beneficiaryRefHash: 'beneficiary-hash',
          commodity: 'Rice',
          deliveredKg: demoQuantities.citizenDistributionKg,
          authMode: AuthMode.MOCK_OTP,
          authResult: AuthResult.SUCCESS,
          authTxnRefHash: 'auth-ref-poc-duplicate',
          dealerId: 'FPS-DEALER-101',
          timestamp: '2026-06-30T10:05:00.000Z'
        })
      ).toThrow(/Requested quantity exceeds balance/);
      expect(service.getAlerts().some((alert) => alert.alertType === AlertType.DUPLICATE_CLAIM)).toBe(true);

      service.createOrUpdateEntitlement({
        rationCardHash: 'exception-ration-card-hash',
        commodity: 'Rice',
        month: '2026-06',
        monthlyEntitlementKg: 10,
        alreadyLiftedKg: 0,
        availableBalanceKg: 10,
        active: true
      });
      const exceptionDistribution = service.recordDistribution({
        distributionId: 'DIST-POC-EXCEPTION',
        fpsId: 'FPS-101',
        rationCardHash: 'exception-ration-card-hash',
        beneficiaryRefHash: 'exception-beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: 10,
        authMode: AuthMode.SUPERVISOR_EXCEPTION,
        authResult: AuthResult.EXCEPTION_APPROVED,
        authTxnRefHash: 'auth-ref-poc-exception',
        dealerId: 'FPS-DEALER-101',
        timestamp: '2026-06-30T10:10:00.000Z'
      });
      expect(exceptionDistribution.distributionId).toBe('DIST-POC-EXCEPTION');
      expect(service.getAlerts().some((alert) => alert.alertType === AlertType.UNAUTHORIZED_TRANSACTION)).toBe(true);
    } finally {
      await cleanup(service, statePath);
    }
  });

  it('resolves an audit alert', async () => {
    const statePath = createStatePath();
    const service = await boot(true, statePath);
    try {
      service.dispatchLot({ transferId: 'TR-ALERT-001', lotId: 'LOT-RICE-2026-001', fromOrg: 'PROC-001', toOrg: 'FCI-001', dispatchedQtyKg: demoQuantities.shortReceiptDispatchKg, vehicleNo: 'KA01AB9999' });
      service.receiveLot({ transferId: 'TR-ALERT-001', receivedQtyKg: demoQuantities.shortReceiptReceivedKg });
      const alert = service.getAlerts().find((item) => item.alertType === 'SHORT_RECEIPT');
      expect(alert).toBeDefined();

      const resolved = service.resolveAuditAlert({ alertId: alert!.alertId, resolvedBy: 'AUD-001', resolutionNote: 'Checked shortage and closed case' });

      expect(resolved.status).toBe('RESOLVED');
      expect(service.getAlerts().find((item) => item.alertId === alert!.alertId)?.status).toBe('RESOLVED');
    } finally {
      await cleanup(service, statePath);
    }
  });
});
