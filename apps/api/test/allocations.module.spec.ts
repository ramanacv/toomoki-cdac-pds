/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { AllocationsController } from '../src/modules/allocations/allocations.controller.js';
import { asFpsRequest, createControllerWithFacade, createDemoLedgerFixture, moveLotToBlockGodown, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('AllocationsModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: AllocationsController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('allocates stock to an FPS and records receipt', async () => {
    fixture = await createDemoLedgerFixture();
    moveLotToBlockGodown(fixture.facade);
    controller = await createControllerWithFacade(AllocationsController, fixture.facade);

    const allocation = await controller.allocate({
      allocationId: 'ALLOC-MOD-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 75,
      month: '2026-06',
      sourceGodownId: 'GODOWN-B-001',
      transporterId: 'TRANS-001',
      vehicleNo: 'KA01AB4401'
    });

    expect(allocation.allocationId).toBe('ALLOC-MOD-001');
    expect(allocation.transporterId).toBe('TRANS-001');
    expect(allocation.transporterName).toBe('Transport Contractor 01');
    expect(allocation.vehicleNo).toBe('KA01AB4401');
    expect(allocation.dispatchTimestamp).toBeTruthy();
    expect((await controller.allocations()).some((item: any) => item.allocationId === 'ALLOC-MOD-001')).toBe(true);
    
    const receipt = await controller.fpsReceipt('ALLOC-MOD-001', { receivedQtyKg: 75 }, asFpsRequest());
    expect(receipt.receivedQtyKg).toBe(75);
    expect(receipt.receiveTimestamp).toBeTruthy();
    expect((await controller.allocation('ALLOC-MOD-001')).status).toBe('RECEIVED');
  });

  it('raises a short-receipt alert when FPS receives less than allocated', async () => {
    fixture = await createDemoLedgerFixture();
    moveLotToBlockGodown(fixture.facade);
    controller = await createControllerWithFacade(AllocationsController, fixture.facade);

    await controller.allocate({
      allocationId: 'ALLOC-MOD-SHORT',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 75,
      month: '2026-06',
      sourceGodownId: 'GODOWN-B-001',
      transporterId: 'TRANS-001',
      vehicleNo: 'KA01AB4402'
    });

    const receipt = await controller.fpsReceipt('ALLOC-MOD-SHORT', { receivedQtyKg: 25 }, asFpsRequest());

    expect(receipt).toMatchObject({
      allocationId: 'ALLOC-MOD-SHORT',
      receivedQtyKg: 25,
      shortageQtyKg: 50,
      status: 'RECEIVED_WITH_SHORTAGE'
    });
    expect(
      fixture.facade.getAlerts().some(
        (alert: any) =>
          alert.alertType === 'SHORT_RECEIPT' &&
          alert.entityId === 'ALLOC-MOD-SHORT' &&
          alert.evidence.shortageQtyKg === 50
      )
    ).toBe(true);
  });
});
