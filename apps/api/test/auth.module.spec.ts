import { afterEach, describe, expect, it } from 'vitest';
import { AuthMode, AuthResult } from '@pds/shared-types';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { createControllerWithFacade, createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

describe('AuthModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: AuthController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('records mock OTP and supervisor exception auth transactions', async () => {
    fixture = await createDemoLedgerFixture();
    controller = await createControllerWithFacade(AuthController, fixture.facade);

    const otp = controller.authOtp({
      authTxnId: 'AUTH-MOD-001',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authResult: AuthResult.SUCCESS
    });

    expect(otp.authMode).toBe(AuthMode.MOCK_OTP);
    expect(controller.authTransaction('AUTH-MOD-001').authTxnId).toBe('AUTH-MOD-001');

    const biometric = controller.authBiometric({
      authTxnId: 'AUTH-MOD-002',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authResult: AuthResult.SUCCESS
    });
    expect(biometric.authMode).toBe(AuthMode.SIMULATED_BIOMETRIC);

    const exception = controller.authException({
      authTxnId: 'AUTH-MOD-003',
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authResult: AuthResult.SUCCESS,
      approvedBy: 'SUP-001'
    });
    expect(exception.authMode).toBe(AuthMode.SUPERVISOR_EXCEPTION);
    expect(controller.authTransactions().length).toBeGreaterThanOrEqual(3);
  });
});
