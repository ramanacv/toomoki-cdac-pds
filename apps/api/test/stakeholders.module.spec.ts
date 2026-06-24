import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { PdsLedgerFacade } from '../src/modules/core/pds-ledger.facade.js';
import { StakeholdersController } from '../src/modules/stakeholders/stakeholders.controller.js';
import { FilePdsLedgerPort } from '../src/infrastructure/ledger-port.js';

describe('StakeholdersModule', () => {
  let controller: StakeholdersController;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-stakeholders-'));
    const port = new FilePdsLedgerPort(join(dir, 'state.json'), join(dir, 'journal.ndjson'));
    const facade = new PdsLedgerFacade(port);
    await facade.onModuleInit();

    const moduleRef = await Test.createTestingModule({
      controllers: [StakeholdersController],
      providers: [{ provide: PdsLedgerFacade, useValue: facade }]
    }).compile();

    controller = moduleRef.get(StakeholdersController);
  });

  it('lists and registers stakeholders', () => {
    const initialCount = controller.stakeholders().length;
    controller.registerStakeholder({
      stakeholderId: 'NEST-001',
      stakeholderType: StakeholderType.DEPARTMENT,
      name: 'Nest Test',
      district: 'Demo',
      licenseNo: 'LIC-NEST-001',
      status: StakeholderStatus.ACTIVE
    });

    expect(controller.stakeholders().length).toBe(initialCount + 1);
    rmSync(dir, { recursive: true, force: true });
  });
});
