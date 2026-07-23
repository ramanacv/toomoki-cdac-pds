import { afterEach, describe, expect, it } from 'vitest';
import { AuthMode, AuthResult, type FPSAllocation } from '@pds/shared-types';
import { AllocationsController } from '../src/modules/allocations/allocations.controller.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { DashboardController } from '../src/modules/dashboard/dashboard.controller.js';
import { DistributionsController } from '../src/modules/distributions/distributions.controller.js';
import { StockController } from '../src/modules/stock/stock.controller.js';
import { TraceController } from '../src/modules/trace/trace.controller.js';
import {
  asFpsRequest,
  createControllerWithFacade,
  createDemoLedgerFixture,
  moveLotToIssuePoint,
  type DemoLedgerFixture
} from './helpers/demo-ledger.js';

describe('FPS identity-to-shop authorization', () => {
  let fixture: DemoLedgerFixture;

  afterEach(async () => { await fixture?.cleanup(); });

  it('isolates allocation, authentication, distribution, stock, dashboard, and trace reads across two shops', async () => {
    fixture = await createDemoLedgerFixture();
    moveLotToIssuePoint(fixture.facade, 200);
    await fixture.facade.allocateToFpsPersisted({
      allocationId: 'ALLOC-FPS-101',
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: 100,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    });
    await fixture.facade.allocateToFpsPersisted({
      allocationId: 'ALLOC-FPS-202',
      fpsId: 'FPS-202',
      commodity: 'Rice',
      allocatedQtyKg: 100,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    });
    await fixture.facade.recordFpsReceiptPersisted({ allocationId: 'ALLOC-FPS-101', receivedQtyKg: 100 });
    await fixture.facade.recordFpsReceiptPersisted({ allocationId: 'ALLOC-FPS-202', receivedQtyKg: 100 });

    const allocations = await createControllerWithFacade(AllocationsController, fixture.facade);
    const auth = await createControllerWithFacade(AuthController, fixture.facade);
    const distributions = await createControllerWithFacade(DistributionsController, fixture.facade);
    const stock = await createControllerWithFacade(StockController, fixture.facade);
    const dashboard = await createControllerWithFacade(DashboardController, fixture.facade);
    const trace = await createControllerWithFacade(TraceController, fixture.facade);
    const fps101 = asFpsRequest('FPS-101', 'operator-101');
    const fps202 = asFpsRequest('FPS-202', 'operator-202');

    const auth101 = await auth.authOtp({
      authTxnId: 'AUTH-FPS-101',
      beneficiaryRefHash: 'beneficiary-hash-101',
      rationCardHash: 'ration-card-hash-101',
      authResult: AuthResult.SUCCESS
    }, fps101);
    const auth202 = await auth.authOtp({
      authTxnId: 'AUTH-FPS-202',
      beneficiaryRefHash: 'beneficiary-hash-202',
      rationCardHash: 'ration-card-hash-202',
      authResult: AuthResult.SUCCESS
    }, fps202);
    await fixture.facade.createOrUpdateEntitlementPersisted({
      rationCardHash: 'ration-card-hash-101', commodity: 'Rice', month: '2026-06',
      monthlyEntitlementKg: 10, alreadyLiftedKg: 0, availableBalanceKg: 10, active: true
    });
    await fixture.facade.createOrUpdateEntitlementPersisted({
      rationCardHash: 'ration-card-hash-202', commodity: 'Rice', month: '2026-06',
      monthlyEntitlementKg: 10, alreadyLiftedKg: 0, availableBalanceKg: 10, active: true
    });
    await distributions.distribute({
      distributionId: 'DIST-FPS-101', rationCardHash: 'ration-card-hash-101',
      beneficiaryRefHash: 'beneficiary-hash-101', commodity: 'Rice', deliveredKg: 10,
      authMode: AuthMode.MOCK_OTP, authResult: AuthResult.SUCCESS,
      authTxnRefHash: auth101.authTxnRefHash, timestamp: '2026-06-15T10:00:00.000Z'
    }, fps101);
    await distributions.distribute({
      distributionId: 'DIST-FPS-202', rationCardHash: 'ration-card-hash-202',
      beneficiaryRefHash: 'beneficiary-hash-202', commodity: 'Rice', deliveredKg: 10,
      authMode: AuthMode.MOCK_OTP, authResult: AuthResult.SUCCESS,
      authTxnRefHash: auth202.authTxnRefHash, timestamp: '2026-06-15T10:01:00.000Z'
    }, fps202);

    expect((await allocations.allocations(fps101)).map((item: FPSAllocation) => item.allocationId)).toEqual(['ALLOC-FPS-101']);
    expect((await auth.authTransactions(fps101)).map((item) => item.authTxnId)).toEqual(['AUTH-FPS-101']);
    expect((await distributions.distributions(fps101)).map((item) => item.distributionId)).toEqual(['DIST-FPS-101']);
    expect((await stock.listStock(undefined, undefined, fps101)).every((item) => item.entityId === 'FPS-101')).toBe(true);
    expect((await dashboard.summary(fps101)).completedDistributions).toBe(1);
    await expect(allocations.allocation('ALLOC-FPS-202', fps101)).rejects.toMatchObject({ status: 404 });
    await expect(distributions.distribution('DIST-FPS-202', fps101)).rejects.toMatchObject({ status: 404 });
    await expect(trace.distributionTrace('DIST-FPS-202', fps101)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects missing, inactive/non-FPS, and mismatched compatibility assignments', async () => {
    fixture = await createDemoLedgerFixture();
    const auth = await createControllerWithFacade(AuthController, fixture.facade);
    const distributions = await createControllerWithFacade(DistributionsController, fixture.facade);
    await expect(auth.authOtp({
      authTxnId: 'AUTH-NO-SCOPE', beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'ration-card-hash', authResult: AuthResult.SUCCESS
    }, { headers: {}, user: { subject: 'no-scope', roles: ['fps'], claims: {} } })).rejects.toMatchObject({ status: 403 });
    await expect(auth.authOtp({
      authTxnId: 'AUTH-WRONG-TYPE', beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'ration-card-hash', authResult: AuthResult.SUCCESS
    }, asFpsRequest('ISSUE-001'))).rejects.toMatchObject({ status: 403 });
    await expect(distributions.distribute({
      distributionId: 'DIST-MISMATCH', fpsId: 'FPS-202', rationCardHash: 'ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash', commodity: 'Rice', deliveredKg: 1,
      authMode: AuthMode.MOCK_OTP, authResult: AuthResult.SUCCESS, authTxnRefHash: 'auth-ref'
    }, asFpsRequest('FPS-101'))).rejects.toMatchObject({ status: 403 });
  });
});
