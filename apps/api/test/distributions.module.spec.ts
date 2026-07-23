/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { AlertType, AuthMode, AuthResult } from '@pds/shared-types';
import { DistributionsController } from '../src/modules/distributions/distributions.controller.js';
import { asFpsRequest, createControllerWithFacade, createDemoLedgerFixture, prepareFpsStock, type DemoLedgerFixture } from './helpers/demo-ledger.js';
import { removeEligibilityGate, setEligibilityGate } from '../src/modules/eligibility/eligibility-gate.js';

describe('DistributionsModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: DistributionsController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('records a distribution after auth', async () => {
    fixture = await createDemoLedgerFixture();
    prepareFpsStock(fixture.facade, 'ALLOC-DIST-SETUP', 100);
    controller = await createControllerWithFacade(DistributionsController, fixture.facade);

    const auth = fixture.facade.simulateAuthentication({
      authTxnId: 'AUTH-DIST-001',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS
    });

    const distribution = await controller.distribute({
      distributionId: 'DIST-MOD-001',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: 10,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      timestamp: '2026-06-09T10:10:00.000Z'
    }, asFpsRequest());

    expect(distribution.distributionId).toBe('DIST-MOD-001');
    expect((await controller.distributions()).some((item: any) => item.distributionId === 'DIST-MOD-001')).toBe(true);
    expect((await controller.distribution('DIST-MOD-001')).deliveredKg).toBe(10);
  });

  it('raises an audit alert when a duplicate or over-entitlement distribution is blocked', async () => {
    fixture = await createDemoLedgerFixture();
    prepareFpsStock(fixture.facade, 'ALLOC-DIST-DUP', 100);
    controller = await createControllerWithFacade(DistributionsController, fixture.facade);

    await controller.distribute({
      distributionId: 'DIST-MOD-DUP-001',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: 25,
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS,
      authTxnRefHash: 'auth-ref-dup-1',
      timestamp: '2026-06-09T10:10:00.000Z'
    }, asFpsRequest());

    await expect(
      controller.distribute({
        distributionId: 'DIST-MOD-DUP-002',
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: 1,
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS,
        authTxnRefHash: 'auth-ref-dup-2',
        timestamp: '2026-06-09T10:11:00.000Z'
      }, asFpsRequest())
    ).rejects.toThrow(/exceeds balance/);

    expect(fixture.facade.getAlerts().some((alert: any) => alert.alertType === AlertType.DUPLICATE_CLAIM)).toBe(true);
  });

  it('records supervisor-exception distribution and exposes an auditor alert', async () => {
    fixture = await createDemoLedgerFixture();
    prepareFpsStock(fixture.facade, 'ALLOC-DIST-EXCEPTION', 100);
    fixture.facade.createOrUpdateEntitlement({
      rationCardHash: 'exception-ration-card-hash',
      commodity: 'Rice',
      month: '2026-06',
      monthlyEntitlementKg: 10,
      alreadyLiftedKg: 0,
      availableBalanceKg: 10,
      active: true
    });
    controller = await createControllerWithFacade(DistributionsController, fixture.facade);

    const distribution = await controller.distribute({
      distributionId: 'DIST-MOD-EXCEPTION',
      fpsId: 'FPS-101',
      rationCardHash: 'exception-ration-card-hash',
      beneficiaryRefHash: 'exception-beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: 10,
      authMode: AuthMode.SUPERVISOR_EXCEPTION,
      authResult: AuthResult.EXCEPTION_APPROVED,
      authTxnRefHash: 'auth-ref-exception',
      approvedBy: 'SUPERVISOR-101',
      exceptionReason: 'Biometric failure',
      timestamp: '2026-06-09T10:10:00.000Z'
    }, asFpsRequest());

    expect(distribution.distributionId).toBe('DIST-MOD-EXCEPTION');
    expect(
      fixture.facade
        .getAlerts()
        .some((alert: any) => alert.alertType === AlertType.UNAUTHORIZED_TRANSACTION && alert.entityId === 'DIST-MOD-EXCEPTION')
    ).toBe(true);
  });

  it('blocks the actual distribution path only while an effective eligibility decision is active', async () => {
    fixture = await createDemoLedgerFixture();
    prepareFpsStock(fixture.facade, 'ALLOC-DIST-ELIGIBILITY', 100);
    controller = await createControllerWithFacade(DistributionsController, fixture.facade);
    setEligibilityGate('demo-ration-card-hash', {
      blocked: true, rcmsStatus: 'CANCELLED', caseId: 'ELIG-CASE-DISTRIBUTION'
    });
    try {
      await expect(controller.distribute({
        distributionId: 'DIST-ELIGIBILITY-BLOCKED',
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: 1,
        authMode: AuthMode.MOCK_OTP,
        authResult: AuthResult.SUCCESS,
        authTxnRefHash: 'auth-ref-eligibility',
        timestamp: '2026-06-09T10:10:00.000Z'
      }, asFpsRequest())).rejects.toThrow(/effective RCMS eligibility decision/);
    } finally {
      removeEligibilityGate('demo-ration-card-hash');
    }
    await expect(controller.distribute({
      distributionId: 'DIST-ELIGIBILITY-RESTORED',
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: 1,
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS,
      authTxnRefHash: 'auth-ref-eligibility-restored',
      timestamp: '2026-06-09T10:11:00.000Z'
    }, asFpsRequest())).resolves.toMatchObject({ distributionId: 'DIST-ELIGIBILITY-RESTORED' });
  });
});
