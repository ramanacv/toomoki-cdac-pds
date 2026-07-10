import { afterEach, describe, expect, it } from 'vitest';
import { StockController } from '../src/modules/stock/stock.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('StockModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: StockController;

  afterEach(async () => {
    await fixture?.cleanup();
  });

  it('returns seeded stock positions', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(StockController, fixture.facade);

    const positions = controller.listStock();
    expect(positions.length).toBeGreaterThan(0);
    expect(positions[0]?.entityId).toBeDefined();
    expect(positions[0]?.commodity).toBeDefined();
    expect(positions[0]?.quantityKg).toBeGreaterThan(0);
  });

  it('filters stock by org and commodity', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(StockController, fixture.facade);

    const all = controller.listStock();
    const sample = all[0]!;
    const filtered = controller.listStock(sample.entityId, sample.commodity);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toEqual(sample);
  });
});
