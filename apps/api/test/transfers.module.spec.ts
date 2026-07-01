import { afterEach, describe, expect, it } from 'vitest';
import { TransferStatus } from '@pds/shared-types';
import { TransfersController } from '../src/modules/transfers/transfers.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('TransfersModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: TransfersController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('dispatches and receives a lot transfer', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(TransfersController, fixture.facade);

    const transfer = controller.dispatch({
      transferId: 'TR-MOD-001',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 250,
      vehicleNo: 'KA01TR0001'
    });

    expect(transfer.status).toBe(TransferStatus.DISPATCHED);
    expect(controller.transfers().some((item) => item.transferId === 'TR-MOD-001')).toBe(true);

    const received = controller.receive('TR-MOD-001', { receivedQtyKg: 250 });
    expect(received.status).toBe(TransferStatus.RECEIVED);
    expect(controller.transfer('TR-MOD-001').receivedQtyKg).toBe(250);
  });

  it('authorizes and dispatches a Stage-II movement with RO-lite evidence', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(TransfersController, fixture.facade);

    const approval = controller.authorize('TR-MOD-STAGE-II', {
      authorizedBy: 'DSO-001',
      roRef: 'RO-DSO-MOD-001',
      remarks: 'POC approval'
    });

    expect(approval.ledgerTxId).toMatch(/^TX-/);
    expect(controller.ledgerEvents().some((event) => event.eventType === 'AuthorizeMovement')).toBe(true);

    const transfer = controller.dispatch({
      transferId: 'TR-MOD-STAGE-II',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'MLL-001',
      dispatchedQtyKg: 250,
      vehicleNo: 'KA01TR0002',
      stage: 'II',
      roRef: 'RO-DSO-MOD-001',
      transporterId: 'TRANS-001'
    });

    expect(transfer.stage).toBe('II');
    expect(transfer.authorizedBy).toBe('DSO-001');
    expect(transfer.approvalStatus).toBe('APPROVED');
  });

  it('rejects Stage-II dispatch without RO-lite authorization', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(TransfersController, fixture.facade);

    expect(() =>
      controller.dispatch({
        transferId: 'TR-MOD-STAGE-II-BLOCK',
        lotId: 'LOT-RICE-2026-001',
        fromOrg: 'PROC-001',
        toOrg: 'MLL-001',
        dispatchedQtyKg: 250,
        vehicleNo: 'KA01TR0003',
        stage: 'II'
      })
    ).toThrow(/Stage-II dispatch requires/);
  });
});
