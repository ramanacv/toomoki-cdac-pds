/* eslint-disable @typescript-eslint/no-explicit-any */
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

    const transfer = await controller.dispatch({
      transferId: 'TR-MOD-001',
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'FCI-001',
      toOrg: 'GODOWN-S-001',
      dispatchedQtyKg: 250,
      vehicleNo: 'KA01TR0001',
      transporterId: 'TRANS-001'
    });

    expect(transfer.status).toBe(TransferStatus.DISPATCHED);
    expect(transfer.transporterId).toBe('TRANS-001');
    expect(transfer.transporterName).toBe('Transport Contractor 01');
    expect(controller.transfers().some((item: any) => item.transferId === 'TR-MOD-001')).toBe(true);

    const received = await controller.receive('TR-MOD-001', { receivedQtyKg: 250 });
    expect(received.status).toBe(TransferStatus.RECEIVED);
    expect(controller.transfer('TR-MOD-001').receivedQtyKg).toBe(250);
  });

  it('authorizes and dispatches a Stage-II movement with RO-lite evidence', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(TransfersController, fixture.facade);

    const approval = await controller.authorize('TR-MOD-STAGE-II', {
      authorizedBy: 'DSO-001',
      roRef: 'RO-DSO-MOD-001',
      remarks: 'POC approval'
    });

    expect(approval.ledgerTxId).toMatch(/^TX-/);
    expect(controller.ledgerEvents().some((event: any) => event.eventType === 'AuthorizeMovement')).toBe(true);
    fixture.facade.addStockForTest('GODOWN-S-001', 'Wheat', 250);

    const transfer = await controller.dispatch({
      transferId: 'TR-MOD-STAGE-II',
      lotId: 'LOT-WHEAT-2026-001',
      fromOrg: 'GODOWN-S-001',
      toOrg: 'GODOWN-B-001',
      dispatchedQtyKg: 250,
      vehicleNo: 'KA01TR0002',
      stage: 'II',
      roRef: 'RO-DSO-MOD-001',
      transporterId: 'TRANS-001'
    });

    expect(transfer.stage).toBe('II');
    expect(transfer.authorizedBy).toBe('DSO-001');
    expect(transfer.approvalStatus).toBe('APPROVED');
    expect(transfer.transporterId).toBe('TRANS-001');
    expect(transfer.transporterName).toBe('Transport Contractor 01');
  });

  it('rejects dispatch without an active transporter', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(TransfersController, fixture.facade);

    await expect(
      controller.dispatch({
        transferId: 'TR-MOD-NO-TRANS',
        lotId: 'LOT-WHEAT-2026-001',
        fromOrg: 'FCI-001',
        toOrg: 'GODOWN-S-001',
        dispatchedQtyKg: 50,
        vehicleNo: 'KA01TR0009',
        stage: 'I',
        transporterId: 'FCI-001'
      })
    ).rejects.toThrow(/not a TRANSPORTER/);
  });

  it('rejects Stage-II dispatch without RO-lite authorization', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(TransfersController, fixture.facade);
    fixture.facade.addStockForTest('GODOWN-S-001', 'Wheat', 250);

    await expect(
      controller.dispatch({
        transferId: 'TR-MOD-STAGE-II-BLOCK',
        lotId: 'LOT-WHEAT-2026-001',
        fromOrg: 'GODOWN-S-001',
        toOrg: 'GODOWN-B-001',
        dispatchedQtyKg: 250,
        vehicleNo: 'KA01TR0003',
        stage: 'II',
        transporterId: 'TRANS-001'
      })
    ).rejects.toThrow(/Stage-II dispatch requires/);
  });
});
