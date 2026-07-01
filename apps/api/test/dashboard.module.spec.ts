import { afterEach, describe, expect, it } from 'vitest';
import { DashboardController } from '../src/modules/dashboard/dashboard.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('DashboardModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: DashboardController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('returns a seeded dashboard summary', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(DashboardController, fixture.facade);

    const summary = controller.summary();
    expect(summary.activeLots).toBeGreaterThan(0);
    expect(summary.trackedStockKg).toBeGreaterThan(0);
    expect(summary.openAlerts).toBeGreaterThanOrEqual(0);
  });
});
