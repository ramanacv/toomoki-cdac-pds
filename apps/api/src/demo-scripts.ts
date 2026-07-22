/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AlertType,
  AuthMode,
  AuthResult,
  type AuthTransaction,
  type AuditAlert,
  type DashboardSummary,
  type DistributionTransaction,
  type FPSAllocation,
  type MonthlyEntitlement,
  type Stakeholder
} from '@pds/shared-types';
import { demoQuantities } from '@pds/fixtures';
import { PdsRuntime } from './modules/core/pds-runtime.js';

export type DemoFlowResult = {
  summary: DashboardSummary;
  stakeholders: Stakeholder[];
  allocation: FPSAllocation;
  entitlement: MonthlyEntitlement;
  auth: AuthTransaction;
  distribution: DistributionTransaction;
  alerts: AuditAlert[];
};

export type DemoExceptionResult = {
  summary: DashboardSummary;
  shortReceiptAlert: AuditAlert;
  duplicateClaimAlert?: AuditAlert;
  alerts: AuditAlert[];
};

export type DemoSmokeResult = {
  happy: DemoFlowResult;
  exception: DemoExceptionResult;
};

const createStatePath = (prefix: string): string => join(mkdtempSync(join(tmpdir(), prefix)), 'state.json');

const createRuntime = async (seed: boolean, statePath: string): Promise<PdsRuntime> => {
  const service = new PdsRuntime(seed, statePath, { deferBootstrap: true });
  await service.bootstrapFromPersistenceAsync();
  return service;
};

export const runHappyPathDemo = async (): Promise<DemoFlowResult> => {
  const statePath = createStatePath('pds-demo-happy-');
  const service = await createRuntime(true, statePath);

  try {
    service.addStockForTest('ISSUE-001', 'Rice', demoQuantities.fpsAllocationKg);
    service.allocateToFps({
      allocationId: 'ALLOC-DEMO-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: demoQuantities.fpsAllocationKg,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    });
    service.recordFpsReceipt({
      allocationId: 'ALLOC-DEMO-001',
      receivedQtyKg: demoQuantities.fpsReceiptKg
    });
    const auth = service.simulateAuthentication({
      authTxnId: 'AUTH-DEMO-001',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS
    });
    const distribution = service.recordDistribution({
      distributionId: 'DIST-DEMO-001',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: demoQuantities.citizenDistributionKg,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      dealerId: 'FPS-DEALER-101',
      timestamp: '2026-06-09T10:10:00.000Z'
    });
    await service.flushPersist();

    return {
      summary: service.getDashboardSummary(),
      stakeholders: service.listStakeholders(),
      allocation: service.getAllocation('ALLOC-DEMO-001'),
      entitlement: service.getEntitlement('demo-ration-card-hash', 'Rice', '2026-06'),
      auth,
      distribution,
      alerts: service.getAlerts()
    };
  } finally {
    rmSync(dirname(statePath), { recursive: true, force: true });
  }
};

export const runExceptionDemo = async (): Promise<DemoExceptionResult> => {
  const statePath = createStatePath('pds-demo-exception-');
  const service = await createRuntime(true, statePath);

  try {
    service.dispatchLot({
      transferId: 'TR-EXC-001',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: demoQuantities.shortReceiptDispatchKg,
      vehicleNo: 'KA01AB3001'
    });
    const transfer = service.receiveLot({
      transferId: 'TR-EXC-001',
      receivedQtyKg: demoQuantities.shortReceiptReceivedKg
    });
    const shortReceiptAlert =
      service.getAlerts().find((item: any) => item.alertType === AlertType.SHORT_RECEIPT) ??
      service.raiseAuditFlag({
        alertType: AlertType.SHORT_RECEIPT,
        entityId: transfer.transferId,
        message: 'Fallback shortage alert',
        evidence: {
          dispatchedQtyKg: demoQuantities.shortReceiptDispatchKg,
          receivedQtyKg: demoQuantities.shortReceiptReceivedKg,
          shortageQtyKg: demoQuantities.shortReceiptDispatchKg - demoQuantities.shortReceiptReceivedKg
        }
      });

    service.addStockForTest('ISSUE-001', 'Rice', demoQuantities.fpsAllocationKg);
    service.allocateToFps({
      allocationId: 'ALLOC-EXC-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: demoQuantities.fpsAllocationKg,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    });
    service.recordFpsReceipt({
      allocationId: 'ALLOC-EXC-001',
      receivedQtyKg: demoQuantities.fpsReceiptKg
    });
    const auth = service.simulateAuthentication({
      authTxnId: 'AUTH-EXC-001',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS
    });
    service.recordDistribution({
      distributionId: 'DIST-EXC-001',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: demoQuantities.citizenDistributionKg,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      dealerId: 'FPS-DEALER-101',
      timestamp: '2026-06-09T10:20:00.000Z'
    });

    let duplicateClaimAlert: AuditAlert | undefined;
    try {
      service.recordDistribution({
        distributionId: 'DIST-EXC-002',
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: demoQuantities.citizenDistributionKg,
        authMode: auth.authMode,
        authResult: auth.authResult,
        authTxnRefHash: auth.authTxnRefHash,
        dealerId: 'FPS-DEALER-101',
        timestamp: '2026-06-09T10:25:00.000Z'
      });
    } catch {
      duplicateClaimAlert = service
        .getAlerts()
        .find((item: any) => item.alertType === AlertType.DUPLICATE_CLAIM && item.entityId === 'demo-ration-card-hash');
    }

    await service.flushPersist();

    return {
      summary: service.getDashboardSummary(),
      shortReceiptAlert,
      ...(duplicateClaimAlert ? { duplicateClaimAlert } : {}),
      alerts: service.getAlerts()
    };
  } finally {
    rmSync(dirname(statePath), { recursive: true, force: true });
  }
};

export const runDemoSmoke = async (): Promise<DemoSmokeResult> => ({
  happy: await runHappyPathDemo(),
  exception: await runExceptionDemo()
});

export const toPrettyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
