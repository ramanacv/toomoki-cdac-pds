import { afterEach, describe, expect, it } from 'vitest';
import { StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { PdsLedgerFacade } from '../src/modules/core/pds-ledger.facade.js';
import { createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('PdsLedgerFacade', () => {
  let fixture: DemoLedgerFixture;

  afterEach(async () => { await fixture?.cleanup(); });

  it('bootstraps seeded demo state on module init', async () => {
    fixture = await createDemoLedgerFixture();

    expect(fixture.facade).toBeInstanceOf(PdsLedgerFacade);
    expect(fixture.facade.listLots().length).toBeGreaterThan(0);
    expect(fixture.facade.getDashboardSummary().activeLots).toBeGreaterThan(0);
  });

  it('persists mutations through the injected port', async () => {
    fixture = await createDemoLedgerFixture();
    const before = fixture.facade.listStakeholders().length;

    fixture.facade.registerStakeholder({
      stakeholderId: 'FACADE-001',
      stakeholderType: StakeholderType.DEPARTMENT,
      name: 'Facade Department',
      district: 'Demo',
      licenseNo: 'LIC-FACADE-001',
      status: StakeholderStatus.ACTIVE
    });

    expect(fixture.facade.listStakeholders().length).toBe(before + 1);
  });
});
