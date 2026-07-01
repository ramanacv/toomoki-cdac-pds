import { afterEach, describe, expect, it } from 'vitest';
import { AllocationsController } from '../src/modules/allocations/allocations.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, moveLotToGodownB, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('AllocationsModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: AllocationsController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('allocates stock to an FPS and records receipt', async () => {
    fixture = await createDemoLedgerFixture();
    moveLotToGodownB(fixture.facade);
    controller = await createControllerWithFacade(AllocationsController, fixture.facade);

    const allocation = controller.allocate({
      allocationId: 'ALLOC-MOD-001',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 75,
      month: '2026-06',
      sourceGodownId: 'GODOWN-B-001'
    });

    expect(allocation.allocationId).toBe('ALLOC-MOD-001');
    expect(controller.allocations().some((item) => item.allocationId === 'ALLOC-MOD-001')).toBe(true);

    const receipt = controller.fpsReceipt('ALLOC-MOD-001', { receivedQtyKg: 75 });
    expect(receipt.receivedQtyKg).toBe(75);
    expect(controller.allocation('ALLOC-MOD-001').status).toBe('RECEIVED');
  });
});
