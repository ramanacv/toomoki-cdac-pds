import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PdsLedgerFacade } from '../../src/modules/core/pds-ledger.facade.js';
import { FilePdsLedgerPort } from '../../src/infrastructure/ledger-port.js';
import type { AuthenticatedRequest } from '../../src/modules/auth/identity-provider.js';

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

export const moveLotToBlockGodown = (
  facade: PdsLedgerFacade,
  quantityKg = 1000
): void => {
  facade.addStockForTest('GODOWN-B-001', 'Rice', quantityKg);
};

export const prepareFpsStock = (facade: PdsLedgerFacade, allocationId: string, quantityKg = 100): void => {
  moveLotToBlockGodown(facade);
  facade.allocateToFps({
    allocationId,
    fpsId: 'FPS-101',
    commodity: 'Rice',
    allocatedQtyKg: quantityKg,
    month: '2026-06',
    sourceGodownId: 'GODOWN-B-001',
    transporterId: 'TRANS-001',
    vehicleNo: 'KA01AB9999'
  });
  facade.recordFpsReceipt({ allocationId, receivedQtyKg: quantityKg });
};

export const asFpsRequest = (
  stakeholderId = 'FPS-101',
  subject = 'demo-fps'
): AuthenticatedRequest => ({
  headers: {},
  user: {
    subject,
    stakeholderId,
    roles: ['fps'],
    claims: { sub: subject, pds_stakeholder_id: stakeholderId }
  }
});
