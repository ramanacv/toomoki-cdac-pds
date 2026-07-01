import { afterEach, describe, expect, it } from 'vitest';
import { TraceController } from '../src/modules/trace/trace.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('TraceModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: TraceController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('returns lot trace and verifies ledger digest', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(TraceController, fixture.facade);

    const trace = controller.lotTrace('LOT-RICE-2026-001');
    expect(trace.lot.lotId).toBe('LOT-RICE-2026-001');
    expect(trace.history.length).toBeGreaterThan(0);

    const verification = controller.verifyLedger({ digest: 'demo-digest' });
    expect(verification.match).toBe(false);
  });
});
