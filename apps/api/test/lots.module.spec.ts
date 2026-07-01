import { afterEach, describe, expect, it } from 'vitest';
import { LotsController } from '../src/modules/lots/lots.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('LotsModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: LotsController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('lists seeded lots and creates a new lot', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(LotsController, fixture.facade);

    const initialCount = controller.lots().length;
    const created = controller.createLot({
      lotId: 'LOT-TEST-001',
      commodity: 'Wheat',
      season: 'Rabi 2026',
      quantityKg: 500,
      qualityGrade: 'A',
      source: 'Test Source',
      currentOwner: 'PROC-001',
      currentLocation: 'Test Yard'
    });

    expect(created.lotId).toBe('LOT-TEST-001');
    expect(controller.lots().length).toBe(initialCount + 1);
    expect(controller.lot('LOT-TEST-001').commodity).toBe('Wheat');
    expect(controller.lotHistory('LOT-TEST-001').length).toBeGreaterThan(0);
  });

  it('transforms a parent lot into a child lot and links provenance history', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(LotsController, fixture.facade);

    fixture.facade.dispatchLot({
      transferId: 'TR-LOT-TRANSFORM-SETUP',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 1000,
      vehicleNo: 'KA01LOT0001'
    });
    fixture.facade.receiveLot({ transferId: 'TR-LOT-TRANSFORM-SETUP', receivedQtyKg: 1000 });

    const child = controller.transformLot({
      parentLotId: 'LOT-RICE-2026-001',
      childLotId: 'LOT-RICE-2026-MILLED',
      transformedBy: 'MLL-001',
      commodity: 'Rice',
      quantityKg: 850,
      qualityGrade: 'A',
      source: 'Miller 01'
    });

    expect(child.transformedFromLotId).toBe('LOT-RICE-2026-001');
    expect(controller.lot('LOT-RICE-2026-MILLED').currentOwner).toBe('MLL-001');
    expect(controller.lotHistory('LOT-RICE-2026-MILLED').some((event) => event.eventType === 'TransformLot')).toBe(true);
    expect(controller.lotHistory('LOT-RICE-2026-001').some((event) => event.entityId === 'LOT-RICE-2026-MILLED')).toBe(true);
  });
});
