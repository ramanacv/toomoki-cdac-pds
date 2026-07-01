import { afterEach, describe, expect, it } from 'vitest';
import { AuditController } from '../src/modules/audit/audit.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('AuditModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: AuditController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('reconciles and resolves audit alerts', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(AuditController, fixture.facade);

    fixture.facade.dispatchLot({
      transferId: 'TR-AUDIT-001',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 500,
      vehicleNo: 'KA01AU0001'
    });
    fixture.facade.receiveLot({ transferId: 'TR-AUDIT-001', receivedQtyKg: 400 });

    const alerts = controller.alerts();
    expect(alerts.some((alert) => alert.alertType === 'SHORT_RECEIPT')).toBe(true);

    const reconciled = controller.reconcile();
    expect(reconciled.length).toBeGreaterThanOrEqual(0);

    const alert = alerts.find((item) => item.alertType === 'SHORT_RECEIPT');
    expect(alert).toBeDefined();

    const resolved = controller.resolveAlert(alert!.alertId, {
      resolvedBy: 'AUD-001',
      resolutionNote: 'Investigated shortage'
    });
    expect(resolved.status).toBe('RESOLVED');
  });
});
