import { afterEach, describe, expect, it } from 'vitest';
import { LotsController } from '../src/modules/lots/lots.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';
import { demoQuantities } from '@pds/fixtures';

describe('LotsModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: LotsController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('lists seeded lots and creates a new lot', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(LotsController, fixture.facade);

    const initialCount = controller.lots().length;
    const created = await controller.createLot({
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

  it('keeps rice in the canonical PDS flow without a processing transform', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(LotsController, fixture.facade);

    const setupLegs = [
      ['TR-LOT-CANONICAL-PROC-FCI', 'PROC-001', 'FCI-001'],
      ['TR-LOT-CANONICAL-FCI-DEPOT', 'FCI-001', 'GODOWN-S-001'],
      ['TR-LOT-CANONICAL-DEPOT-ISSUE', 'GODOWN-S-001', 'ISSUE-001']
    ] as const;
    for (const [transferId, fromOrg, toOrg] of setupLegs) {
      fixture.facade.dispatchLot({
        transferId,
        lotId: 'LOT-RICE-2026-001',
        fromOrg,
        toOrg,
        dispatchedQtyKg: demoQuantities.stageOneTransferKg,
        vehicleNo: 'KA01LOT0001'
      });
      fixture.facade.receiveLot({ transferId, receivedQtyKg: demoQuantities.stageOneTransferKg });
    }

    const lot = controller.lot('LOT-RICE-2026-001');
    expect(lot.currentOwner).toBe('ISSUE-001');
    expect(controller.lotHistory('LOT-RICE-2026-001').some((event) => event.eventType === 'TransformLot')).toBe(false);
  });
});
