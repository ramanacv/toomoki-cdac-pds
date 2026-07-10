import { afterEach, describe, expect, it } from 'vitest';
import { AllocationsController } from '../src/modules/allocations/allocations.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, moveLotToIssuePoint, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('AllocationsModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: AllocationsController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('allocates stock to an FPS and records receipt', async () => {
    fixture = await createDemoLedgerFixture();
    moveLotToIssuePoint(fixture.facade);
    controller = await createControllerWithFacade(AllocationsController, fixture.facade);

    const allocation = await controller.allocate({
      allocationId: 'ALLOC-MOD-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 75,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    });

    expect(allocation.allocationId).toBe('ALLOC-MOD-001');
    expect(controller.allocations().some((item) => item.allocationId === 'ALLOC-MOD-001')).toBe(true);

    const receipt = await controller.fpsReceipt('ALLOC-MOD-001', { receivedQtyKg: 75 });
    expect(receipt.receivedQtyKg).toBe(75);
    expect(controller.allocation('ALLOC-MOD-001').status).toBe('RECEIVED');
  });

  it('raises a short-receipt alert when FPS receives less than allocated', async () => {
    fixture = await createDemoLedgerFixture();
    moveLotToIssuePoint(fixture.facade);
    controller = await createControllerWithFacade(AllocationsController, fixture.facade);

    await controller.allocate({
      allocationId: 'ALLOC-MOD-SHORT',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 75,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    });

    const receipt = await controller.fpsReceipt('ALLOC-MOD-SHORT', { receivedQtyKg: 25 });

    expect(receipt).toMatchObject({
      allocationId: 'ALLOC-MOD-SHORT',
      receivedQtyKg: 25,
      shortageQtyKg: 50,
      status: 'RECEIVED_WITH_SHORTAGE'
    });
    expect(
      fixture.facade.getAlerts().some(
        (alert) =>
          alert.alertType === 'SHORT_RECEIPT' &&
          alert.entityId === 'ALLOC-MOD-SHORT' &&
          alert.evidence.shortageQtyKg === 50
      )
    ).toBe(true);
  });
});
