import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthMode, AuthResult } from '@pds/shared-types';
import { demoQuantities } from '@pds/fixtures';

const fabricE2eEnabled = process.env.PDS_E2E_FABRIC === 'true';
const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const AUTH_TOKEN = process.env.PDS_DEV_AUTH_TOKEN ?? process.env.SMOKE_AUTH_TOKEN ?? '';
const ADMIN_TOKEN = process.env.PDS_ADMIN_TOKEN ?? 'admin-mvp-token';

const roleToken = (role: string): string => (AUTH_TOKEN ? `${AUTH_TOKEN}:${role}` : '');

const authed = (role?: string) => {
  const token = role ? roleToken(role) : AUTH_TOKEN;
  const withAuth = <T extends { set: (k: string, v: string) => T }>(req: T): T =>
    token ? req.set('Authorization', `Bearer ${token}`) : req;
  return {
    get: (path: string) => withAuth(request(API_BASE).get(path)),
    post: (path: string) => withAuth(request(API_BASE).post(path))
  };
};

const expectSuccess = (status: number): void => {
  expect([200, 201]).toContain(status);
};

describe.skipIf(!fabricE2eEnabled)('Fabric API e2e', () => {
  beforeAll(async () => {
    // Restore fixture lots/stock so transfer + allocation paths are deterministic
    // after prior live-lifecycle runs.
    await request(API_BASE)
      .post('/admin/reset')
      .set('X-Admin-Token', ADMIN_TOKEN)
      .send({})
      .expect((response) => {
        expect([200, 201]).toContain(response.status);
      });
  });

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
        await authed('department').post('/stakeholders').send({
          stakeholderId: smokeId,
          stakeholderType: 'DISTRICT_SUPPLY_OFFICE',
          name: 'Fabric E2E',
          district: 'Demo',
          licenseNo: smokeId,
          status: 'ACTIVE'
        })
      ).status
    );

    const lots = await authed('department').get('/lots').expect(200);
    const riceLot = (lots.body as Array<{ lotId: string; commodity: string }>).find(
      (lot) => lot.commodity === 'Rice'
    );
    expect(riceLot?.lotId).toBeTruthy();

    expectSuccess(
      (
        await authed('procurement').post('/transfers').send({
          transferId: `${smokeId}-TR`,
          lotId: riceLot!.lotId,
          fromOrg: 'PROC-001',
          toOrg: 'FCI-001',
          dispatchedQtyKg: 10,
          vehicleNo: 'KA01FAB001'
        })
      ).status
    );

    expectSuccess((await authed('godown').post(`/transfers/${smokeId}-TR/receive`).send({ receivedQtyKg: 10 })).status);

    const trace = await authed('department').get(`/trace/lots/${riceLot!.lotId}`).expect(200);
    expect(trace.body.verificationSource).toBe('chaincode');
  });

  it('runs allocation, distribution, and records ledger tx id', async () => {
    const prefix = `FAB-DIST-${Date.now()}`;
    const qty = demoQuantities.fpsAllocationKg;

    const lots = await authed('department').get('/lots').expect(200);
    const riceLot = (lots.body as Array<{ lotId: string; commodity: string }>).find(
      (lot) => lot.commodity === 'Rice'
    );
    expect(riceLot?.lotId).toBeTruthy();

    // Reset leaves stock at PROC only — move a slice to ISSUE before FPS allocation.
    const move = async (transferId: string, fromOrg: string, toOrg: string, role: string) => {
      expectSuccess(
        (
          await authed(role).post('/transfers').send({
            transferId,
            lotId: riceLot!.lotId,
            fromOrg,
            toOrg,
            dispatchedQtyKg: qty,
            vehicleNo: `KA${prefix.slice(-6)}`,
            transporterId: 'TRANS-001'
          })
        ).status
      );
      expectSuccess((await authed('godown').post(`/transfers/${transferId}/receive`).send({ receivedQtyKg: qty })).status);
    };

    await move(`${prefix}-TR1`, 'PROC-001', 'FCI-001', 'procurement');
    await move(`${prefix}-TR2`, 'FCI-001', 'GODOWN-S-001', 'godown');
    await move(`${prefix}-TR3`, 'GODOWN-S-001', 'ISSUE-001', 'godown');

    expectSuccess(
      (
        await authed('godown').post('/fps-allocations').send({
          allocationId: `${prefix}-ALLOC`,
          fpsId: 'FPS-101',
          commodity: 'Rice',
          allocatedQtyKg: qty,
          month: '2026-06',
          sourceGodownId: 'ISSUE-001'
        })
      ).status
    );

    expectSuccess(
      (await authed('fps').post(`/fps-allocations/${prefix}-ALLOC/receipt`).send({ receivedQtyKg: demoQuantities.fpsReceiptKg }))
        .status
    );

    expectSuccess(
      (
        await authed('department').post('/entitlements').send({
          rationCardHash: 'demo-ration-card-hash',
          commodity: 'Rice',
          month: '2026-06',
          monthlyEntitlementKg: qty,
          alreadyLiftedKg: 0,
          availableBalanceKg: qty,
          active: true
        })
      ).status
    );

    const auth = await authed('fps')
      .post('/auth/mock-otp')
      .send({
        authTxnId: `${prefix}-AUTH`,
        beneficiaryRefHash: 'beneficiary-hash',
        rationCardHash: 'demo-ration-card-hash',
        authResult: AuthResult.SUCCESS
      });
    expectSuccess(auth.status);

    const distribution = await authed('fps').post('/distributions').send({
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
