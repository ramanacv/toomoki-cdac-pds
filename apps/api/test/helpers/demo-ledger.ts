import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PdsLedgerFacade } from '../../src/modules/core/pds-ledger.facade.js';
import { FilePdsLedgerPort } from '../../src/infrastructure/ledger-port.js';

export type DemoLedgerFixture = {
  facade: PdsLedgerFacade;
  dir: string;
  cleanup: () => Promise<void>;
};

export const createDemoLedgerFixture = async (): Promise<DemoLedgerFixture> => {
  const dir = mkdtempSync(join(tmpdir(), 'pds-demo-'));
  const port = new FilePdsLedgerPort(join(dir, 'state.json'), join(dir, 'journal.ndjson'));
  const facade = new PdsLedgerFacade(port);
  await facade.onModuleInit();

  return {
    facade,
    dir,
    // Flush the async persist queue before removing the tmp dir so background
    // writes don't race with cleanup (ENOENT on mkdir). See T2.2 / T6.2.
    cleanup: async () => {
      await facade.flushPersist();
      rmSync(dir, { recursive: true, force: true });
    }
  };
};

export const createControllerWithFacade = async <T>(
  Controller: Type<T>,
  facade: PdsLedgerFacade
): Promise<T> => {
  const moduleRef = await Test.createTestingModule({
    controllers: [Controller],
    providers: [{ provide: PdsLedgerFacade, useValue: facade }]
  }).compile();

  return moduleRef.get(Controller);
};

export const moveLotToGodownB = (
  facade: PdsLedgerFacade,
  lotId = 'LOT-RICE-2026-001',
  quantityKg = 1000
): void => {
  const legs = [
    { transferId: 'TR-SETUP-1', fromOrg: 'PROC-001', toOrg: 'MLL-001' },
    { transferId: 'TR-SETUP-2', fromOrg: 'MLL-001', toOrg: 'GODOWN-S-001' },
    { transferId: 'TR-SETUP-3', fromOrg: 'GODOWN-S-001', toOrg: 'GODOWN-B-001' }
  ];

  for (const leg of legs) {
    facade.dispatchLot({
      ...leg,
      lotId,
      dispatchedQtyKg: quantityKg,
      vehicleNo: 'KA01SETUP01'
    });
    facade.receiveLot({ transferId: leg.transferId, receivedQtyKg: quantityKg });
  }
};

export const prepareFpsStock = (facade: PdsLedgerFacade, allocationId: string, quantityKg = 100): void => {
  moveLotToGodownB(facade);
  facade.allocateToFps({
    allocationId,
    fpsId: 'FPS-101',
    commodity: 'Rice',
    allocatedQtyKg: quantityKg,
    month: '2026-06',
    sourceGodownId: 'GODOWN-B-001'
  });
  facade.recordFpsReceipt({ allocationId, receivedQtyKg: quantityKg });
};
