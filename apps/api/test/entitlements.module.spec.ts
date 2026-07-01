import { afterEach, describe, expect, it } from 'vitest';
import { EntitlementsController } from '../src/modules/entitlements/entitlements.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('EntitlementsModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: EntitlementsController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('lists entitlements and validates requested quantity', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(EntitlementsController, fixture.facade);

    const entitlements = controller.entitlementList();
    expect(entitlements.length).toBeGreaterThan(0);

    const entitlement = controller.entitlements('demo-ration-card-hash', 'Rice', '2026-06');
    expect(entitlement.rationCardHash).toBe('demo-ration-card-hash');

    const validation = controller.validate({
      rationCardHash: 'demo-ration-card-hash',
      commodity: 'Rice',
      month: '2026-06',
      requestedQtyKg: 5
    });
    expect(validation.rationCardHash).toBe('demo-ration-card-hash');
    expect(validation.availableBalanceKg).toBeGreaterThan(0);
  });
});
