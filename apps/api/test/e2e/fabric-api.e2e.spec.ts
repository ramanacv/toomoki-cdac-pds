import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthMode, AuthResult } from '@pds/shared-types';
import { demoQuantities } from '@pds/fixtures';

const fabricE2eEnabled = process.env.PDS_E2E_FABRIC === 'true';
const API_BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000';
let authToken = process.env.PDS_E2E_ACCESS_TOKEN ?? '';

const acquireToken = async (): Promise<string> => {
  if (authToken) return authToken;
  const secret = process.env.PDS_BENCHMARK_CLIENT_SECRET;
  if (!secret) throw new Error('Set PDS_BENCHMARK_CLIENT_SECRET for live Fabric e2e');
  const response = await fetch(process.env.PDS_OIDC_TOKEN_URL ?? 'http://127.0.0.1:8080/realms/viksitpds/protocol/openid-connect/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: 'pds-benchmark', client_secret: secret })
  });
  const body = await response.json() as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error(`OIDC token request failed: ${response.status}`);
  return body.access_token;
};

const authed = (_role?: string) => {
  const withAuth = <T extends { set: (k: string, v: string) => T }>(req: T): T =>
    authToken ? req.set('Authorization', `Bearer ${authToken}`) : req;
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
    authToken = await acquireToken();
    // Restore fixture lots/stock so transfer + allocation paths are deterministic
    // after prior live-lifecycle runs.
    await request(API_BASE)
      .post('/admin/reset')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect((response) => {
        expect([200, 201]).toContain(response.status);
      });
  });

  it('requires a short-lived Keycloak service token when hitting a live fabric stack', () => {
    expect(authToken.length).toBeGreaterThan(0);
  });

  it('serves minimal health and authenticated Fabric network state', async () => {
    const health = await request(API_BASE).get('/health').expect(200);
    expect(health.body).toEqual({ ok: true });
    const network = await authed('platform-admin').get('/admin/network').expect(200);
    expect(network.body.ledgerMode).toBe('fabric');
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
