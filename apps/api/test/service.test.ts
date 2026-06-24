import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { PdsRuntime } from '../src/pds-runtime.js';

const createStatePath = (): string => join(mkdtempSync(join(tmpdir(), 'pds-api-')), 'state.json');

describe('PdsRuntime', () => {
  it('persists state across service instances', () => {
    const statePath = createStatePath();
    try {
      const first = new PdsRuntime(true, statePath);
      first.registerStakeholder({
        stakeholderId: 'TEST-001',
        stakeholderType: StakeholderType.DEPARTMENT,
        name: 'Test Department',
        district: 'Demo District',
        licenseNo: 'TEST-LIC-001',
        status: StakeholderStatus.ACTIVE
      });

      const second = new PdsRuntime(false, statePath);
      expect(second.listStakeholders().some((stakeholder) => stakeholder.stakeholderId === 'TEST-001')).toBe(true);
    } finally {
      rmSync(dirname(statePath), { recursive: true, force: true });
    }
  });

  it('provides a seeded summary', () => {
    const statePath = createStatePath();
    try {
      const service = new PdsRuntime(true, statePath);
      const summary = service.getDashboardSummary();
      expect(summary.activeLots).toBeGreaterThan(0);
      expect(service.listLots().length).toBeGreaterThan(0);
    } finally {
      rmSync(dirname(statePath), { recursive: true, force: true });
    }
  });

  it('returns direct lookups for lot, transfer, and allocation records', () => {
    const statePath = createStatePath();
    try {
      const service = new PdsRuntime(true, statePath);
      expect(service.getLot('LOT-RICE-2026-001').lotId).toBe('LOT-RICE-2026-001');
      expect(() => service.getTransfer('TR-000')).toThrow();
      service.dispatchLot({
        transferId: 'TR-LOOKUP-000',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'PROC-001',
        toOrg: 'MLL-001',
        dispatchedQtyKg: 1000,
        vehicleNo: 'KA01AB0001'
      });
      service.receiveLot({
        transferId: 'TR-LOOKUP-000',
        receivedQtyKg: 1000
      });
      service.dispatchLot({
        transferId: 'TR-LOOKUP-000-2',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'MLL-001',
        toOrg: 'GODOWN-S-001',
        dispatchedQtyKg: 1000,
        vehicleNo: 'KA01AB0002'
      });
      service.receiveLot({
        transferId: 'TR-LOOKUP-000-2',
        receivedQtyKg: 1000
      });
      service.dispatchLot({
        transferId: 'TR-LOOKUP-000-3',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'GODOWN-S-001',
        toOrg: 'GODOWN-B-001',
        dispatchedQtyKg: 1000,
        vehicleNo: 'KA01AB0003'
      });
      service.receiveLot({
        transferId: 'TR-LOOKUP-000-3',
        receivedQtyKg: 1000
      });
      service.dispatchLot({
        transferId: 'TR-LOOKUP-001',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'GODOWN-B-001',
        toOrg: 'FPS-101',
        dispatchedQtyKg: 100,
        vehicleNo: 'KA01AB0004'
      });
      service.receiveLot({
        transferId: 'TR-LOOKUP-001',
        receivedQtyKg: 100
      });
      service.allocateToFps({
        allocationId: 'ALLOC-LOOKUP-001',
        fpsId: 'FPS-101',
        commodity: 'Rice',
        allocatedQtyKg: 50,
        month: '2026-06',
        sourceGodownId: 'GODOWN-B-001'
      });
      const auth = service.simulateAuthentication({
        authTxnId: 'AUTH-LOOKUP-001',
        beneficiaryRefHash: 'beneficiary-hash',
        rationCardHash: 'demo-ration-card-hash',
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS
      });

      expect(service.getTransfer('TR-LOOKUP-001').transferId).toBe('TR-LOOKUP-001');
      expect(service.getAllocation('ALLOC-LOOKUP-001').allocationId).toBe('ALLOC-LOOKUP-001');
      expect(service.getAuthTransaction(auth.authTxnId).authTxnId).toBe('AUTH-LOOKUP-001');
      expect(service.listEntitlements().some((item) => item.rationCardHash === 'demo-ration-card-hash')).toBe(true);
    } finally {
      rmSync(dirname(statePath), { recursive: true, force: true });
    }
  });

  it('supports end-to-end distribution flow', () => {
    const statePath = createStatePath();
    try {
      const service = new PdsRuntime(true, statePath);
      service.dispatchLot({
        transferId: 'TR-API-001',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'PROC-001',
        toOrg: 'MLL-001',
        dispatchedQtyKg: 500,
        vehicleNo: 'KA01AB2222'
      });
      service.receiveLot({
        transferId: 'TR-API-001',
        receivedQtyKg: 500
      });
      service.dispatchLot({
        transferId: 'TR-API-002',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'MLL-001',
        toOrg: 'GODOWN-S-001',
        dispatchedQtyKg: 500,
        vehicleNo: 'KA01AB3333'
      });
      service.receiveLot({
        transferId: 'TR-API-002',
        receivedQtyKg: 500
      });
      service.dispatchLot({
        transferId: 'TR-API-003',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'GODOWN-S-001',
        toOrg: 'GODOWN-B-001',
        dispatchedQtyKg: 500,
        vehicleNo: 'KA01AB4444'
      });
      service.receiveLot({
        transferId: 'TR-API-003',
        receivedQtyKg: 500
      });
      service.allocateToFps({
        allocationId: 'ALLOC-API-001',
        fpsId: 'FPS-101',
        commodity: 'Rice',
        allocatedQtyKg: 100,
        month: '2026-06',
        sourceGodownId: 'GODOWN-B-001'
      });
      service.recordFpsReceipt({
        allocationId: 'ALLOC-API-001',
        receivedQtyKg: 100
      });
      const auth = service.simulateAuthentication({
        authTxnId: 'AUTH-API-001',
        beneficiaryRefHash: 'beneficiary-hash',
        rationCardHash: 'demo-ration-card-hash',
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS
      });
      const distribution = service.recordDistribution({
        distributionId: 'DIST-API-001',
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
      expect(service.getDistributionReceipt('DIST-API-001').distributionId).toBe('DIST-API-001');
      expect(service.listDistributions().some((item) => item.distributionId === 'DIST-API-001')).toBe(true);
    } finally {
      rmSync(dirname(statePath), { recursive: true, force: true });
    }
  });

  it('resolves an audit alert', () => {
    const statePath = createStatePath();
    try {
      const service = new PdsRuntime(true, statePath);
      service.dispatchLot({
        transferId: 'TR-ALERT-001',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'PROC-001',
        toOrg: 'MLL-001',
        dispatchedQtyKg: 1000,
        vehicleNo: 'KA01AB9999'
      });
      service.receiveLot({
        transferId: 'TR-ALERT-001',
        receivedQtyKg: 800
      });
      const alert = service.getAlerts().find((item) => item.alertType === 'SHORT_RECEIPT');
      expect(alert).toBeDefined();

      const resolved = service.resolveAuditAlert({
        alertId: alert!.alertId,
        resolvedBy: 'AUD-001',
        resolutionNote: 'Checked shortage and closed case'
      });

      expect(resolved.status).toBe('RESOLVED');
      expect(service.getAlerts().find((item) => item.alertId === alert!.alertId)?.status).toBe('RESOLVED');
    } finally {
      rmSync(dirname(statePath), { recursive: true, force: true });
    }
  });
});
