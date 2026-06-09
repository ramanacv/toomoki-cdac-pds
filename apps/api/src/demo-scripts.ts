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
import { PdsService } from './pds.service.js';

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
  alert: AuditAlert;
  alerts: AuditAlert[];
};

export type DemoSmokeResult = {
  happy: DemoFlowResult;
  exception: DemoExceptionResult;
};

const createStatePath = (prefix: string): string => join(mkdtempSync(join(tmpdir(), prefix)), 'state.json');

export const runHappyPathDemo = (): DemoFlowResult => {
  const statePath = createStatePath('pds-demo-happy-');
  const service = new PdsService(true, statePath);

  try {
    service.dispatchLot({
      transferId: 'TR-DEMO-001',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB2001'
    });
    service.receiveLot({
      transferId: 'TR-DEMO-001',
      receivedQtyKg: 1000
    });
    service.dispatchLot({
      transferId: 'TR-DEMO-002',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'MLL-001',
      toOrg: 'GODOWN-S-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB2002'
    });
    service.receiveLot({
      transferId: 'TR-DEMO-002',
      receivedQtyKg: 1000
    });
    service.dispatchLot({
      transferId: 'TR-DEMO-003',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'GODOWN-S-001',
      toOrg: 'GODOWN-B-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB2003'
    });
    service.receiveLot({
      transferId: 'TR-DEMO-003',
      receivedQtyKg: 1000
    });
    service.allocateToFps({
      allocationId: 'ALLOC-DEMO-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 100,
      month: '2026-06',
      sourceGodownId: 'GODOWN-B-001'
    });
    service.recordFpsReceipt({
      allocationId: 'ALLOC-DEMO-001',
      receivedQtyKg: 100
    });
    const auth = service.simulateAuthentication({
      authTxnId: 'AUTH-DEMO-001',
      beneficiaryRefHash: 'demo-beneficiary-ref-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS
    });
    const distribution = service.recordDistribution({
      distributionId: 'DIST-DEMO-001',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'demo-beneficiary-ref-hash',
      commodity: 'Rice',
      deliveredKg: 25,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      dealerId: 'FPS-DEALER-101'
    });

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

export const runExceptionDemo = (): DemoExceptionResult => {
  const statePath = createStatePath('pds-demo-exception-');
  const service = new PdsService(true, statePath);

  try {
    service.dispatchLot({
      transferId: 'TR-EXC-001',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01AB3001'
    });
    const transfer = service.receiveLot({
      transferId: 'TR-EXC-001',
      receivedQtyKg: 800
    });
    const alert = service.getAlerts().find((item) => item.alertType === AlertType.SHORT_RECEIPT) ?? service.raiseAuditFlag({
      alertType: AlertType.SHORT_RECEIPT,
      entityId: transfer.transferId,
      message: 'Fallback shortage alert',
      evidence: { dispatchedQtyKg: 1000, receivedQtyKg: 800, shortageQtyKg: 200 }
    });

    return {
      summary: service.getDashboardSummary(),
      alert,
      alerts: service.getAlerts()
    };
  } finally {
    rmSync(dirname(statePath), { recursive: true, force: true });
  }
};

export const runDemoSmoke = (): DemoSmokeResult => ({
  happy: runHappyPathDemo(),
  exception: runExceptionDemo()
});

export const toPrettyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
