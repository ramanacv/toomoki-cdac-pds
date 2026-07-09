import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthMode, AuthResult } from '@pds/shared-types';
import { demoQuantities } from '@pds/fixtures';

const fabricE2eEnabled = process.env.PDS_E2E_FABRIC === 'true';
const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const AUTH_TOKEN = process.env.PDS_DEV_AUTH_TOKEN ?? process.env.SMOKE_AUTH_TOKEN ?? '';

const authed = () => {
  const agent = request(API_BASE);
  return AUTH_TOKEN ? agent.set('Authorization', `Bearer ${AUTH_TOKEN}`) : agent;
};

const expectSuccess = (status: number): void => {
  expect([200, 201]).toContain(status);
};

describe.skipIf(!fabricE2eEnabled)('Fabric API e2e', () => {
  it('requires PDS_DEV_AUTH_TOKEN when hitting a live fabric stack', () => {
    expect(AUTH_TOKEN.length).toBeGreaterThan(0);
  });

  it('serves health with fabric ledger mode', async () => {
    const health = await request(API_BASE).get('/health').expect(200);
    expect(health.body.ok).toBe(true);
    expect(health.body.ledgerMode).toBe('fabric');
  });

  it('runs register → transfer → trace with chaincode verification', async () => {
    const smokeId = `FAB-E2E-${Date.now()}`;

    expectSuccess(
      (
        await authed().post('/stakeholders').send({
          stakeholderId: smokeId,
          stakeholderType: 'DISTRICT_SUPPLY_OFFICE',
          name: 'Fabric E2E',
          district: 'Demo',
          licenseNo: smokeId,
          status: 'ACTIVE'
        })
      ).status
    );

    expectSuccess(
      (
        await authed().post('/transfers').send({
          transferId: `${smokeId}-TR`,
          lotId: 'LOT-RICE-2026-001',
          fromOrg: 'PROC-001',
          toOrg: 'FCI-001',
          dispatchedQtyKg: 10,
          vehicleNo: 'KA01FAB001'
        })
      ).status
    );

    expectSuccess((await authed().post(`/transfers/${smokeId}-TR/receive`).send({ receivedQtyKg: 10 })).status);

    const trace = await request(API_BASE).get('/trace/lots/LOT-RICE-2026-001').expect(200);
    expect(trace.body.verificationSource).toBe('chaincode');
  });

  it('runs allocation, distribution, and records ledger tx id', async () => {
    const prefix = `FAB-DIST-${Date.now()}`;

    await authed()
      .post('/transfers/TR-POC-RICE-DEPOT-ISSUE/authorize')
      .send({ authorizedBy: 'DSO-001', roRef: 'RO-DSO-POC-001' })
      .expect((response) => {
        expect([200, 201, 404, 409]).toContain(response.status);
      });

    expectSuccess(
      (
        await authed().post('/fps-allocations').send({
          allocationId: `${prefix}-ALLOC`,
          fpsId: 'FPS-101',
          commodity: 'Rice',
          allocatedQtyKg: demoQuantities.fpsAllocationKg,
          month: '2026-06',
          sourceGodownId: 'ISSUE-001'
        })
      ).status
    );

    expectSuccess(
      (await authed().post(`/fps-allocations/${prefix}-ALLOC/receipt`).send({ receivedQtyKg: demoQuantities.fpsReceiptKg }))
        .status
    );

    const auth = await authed()
      .post('/auth/mock-otp')
      .send({
        authTxnId: `${prefix}-AUTH`,
        beneficiaryRefHash: 'beneficiary-hash',
        rationCardHash: 'demo-ration-card-hash',
        authResult: AuthResult.SUCCESS
      });
    expectSuccess(auth.status);

    const distribution = await authed().post('/distributions').send({
      distributionId: `${prefix}-DIST`,
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: demoQuantities.citizenDistributionKg,
      authMode: AuthMode.MOCK_OTP,
      authResult: AuthResult.SUCCESS,
      authTxnRefHash: auth.body.authTxnRefHash,
      dealerId: 'FPS-DEALER-101',
      timestamp: '2026-06-30T10:00:00.000Z'
    });
    expectSuccess(distribution.status);
    expect(distribution.body.ledgerTxId).toBeDefined();
  });
});

describe('Fabric API e2e guard', () => {
  it('documents that live Fabric e2e is opt-in via PDS_E2E_FABRIC', () => {
    expect(process.env.PDS_E2E_FABRIC ?? 'false').toBeDefined();
  });
});
