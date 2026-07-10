#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const token = process.env.PDS_DEV_AUTH_TOKEN ?? process.env.PDS_DEV_TOKEN ?? 'dev-mvp-token';
const adminToken = process.env.PDS_ADMIN_TOKEN ?? 'admin-mvp-token';
const runId = process.env.RUN_ID ?? `LIVE-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
const month = process.env.MONTH ?? new Date().toISOString().slice(0, 7);
const evidenceDir = process.env.EVIDENCE_DIR ?? '/tmp/pds-live-lifecycle';
const rationCardHash = process.env.RATION_CARD_HASH ?? 'demo-ration-card-hash';
const beneficiaryRefHash = process.env.BENEFICIARY_HASH ?? 'beneficiary-hash';

const commodities = [
  ['Rice', 5000],
  ['Wheat', 4000],
  ['Sugar', 2000],
  ['Kerosene', 500],
  ['Dal', 400],
  ['Cooking Oil', 300]
];

const slug = (value) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const pathWithQuery = (path, query = {}) => {
  const url = new URL(path, apiBase);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
};

async function request(path, { method = 'GET', body, admin = false } = {}) {
  const headers = new Headers();
  if (admin) {
    headers.set('X-Admin-Token', adminToken);
  } else {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = parsed?.message ?? text ?? response.statusText;
    throw new Error(`${method} ${path} failed: ${response.status} ${message}`);
  }
  return parsed;
}

const get = (path) => request(path);
const post = (path, body, options) => request(path, { ...options, method: 'POST', body });

async function postSoft(path, body) {
  try {
    return { ok: true, body: await post(path, body) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function mustFindLot(reset, commodity) {
  const lot = reset.lots.find((item) => item.commodity === commodity);
  if (!lot) {
    throw new Error(`Reset did not return a lot for ${commodity}`);
  }
  return lot;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

async function runCommodity(reset, commodity, qty, index) {
  const commoditySlug = slug(commodity);
  const lot = mustFindLot(reset, commodity);
  const vehicle = `LIVE${String(index + 1).padStart(4, '0')}`;
  const ids = {
    procToFci: `TR-${runId}-${commoditySlug}-PROC-FCI`,
    fciToDepot: `TR-${runId}-${commoditySlug}-FCI-DEPOT`,
    depotToIssue: `TR-${runId}-${commoditySlug}-DEPOT-ISSUE`,
    allocation: `ALLOC-${runId}-${commoditySlug}-FPS`,
    auth: `AUTH-${runId}-${commoditySlug}`,
    distribution: `DIST-${runId}-${commoditySlug}-001`,
    ro: `RO-${runId}-${commoditySlug}`
  };

  const entitlement = await post('/entitlements', {
    rationCardHash,
    commodity,
    month,
    monthlyEntitlementKg: qty,
    alreadyLiftedKg: 0,
    availableBalanceKg: qty,
    active: true
  });

  const dispatch1 = await post('/transfers', {
    transferId: ids.procToFci,
    lotId: lot.lotId,
    fromOrg: 'PROC-001',
    toOrg: 'FCI-001',
    dispatchedQtyKg: qty,
    vehicleNo: vehicle,
    stage: 'I',
    transporterId: 'TRANS-001'
  });
  const receive1 = await post(`/transfers/${ids.procToFci}/receive`, { receivedQtyKg: qty });

  const dispatch2 = await post('/transfers', {
    transferId: ids.fciToDepot,
    lotId: lot.lotId,
    fromOrg: 'FCI-001',
    toOrg: 'GODOWN-S-001',
    dispatchedQtyKg: qty,
    vehicleNo: `${vehicle}B`,
    stage: 'I',
    transporterId: 'TRANS-001'
  });
  const receive2 = await post(`/transfers/${ids.fciToDepot}/receive`, { receivedQtyKg: qty });

  const approval = await postSoft(`/transfers/${ids.depotToIssue}/authorize`, {
    authorizedBy: 'DSO-001',
    roRef: ids.ro,
    remarks: 'Live lifecycle reset run'
  });

  const dispatch3 = await post('/transfers', {
    transferId: ids.depotToIssue,
    lotId: lot.lotId,
    fromOrg: 'GODOWN-S-001',
    toOrg: 'ISSUE-001',
    dispatchedQtyKg: qty,
    vehicleNo: `${vehicle}C`,
    stage: 'II',
    roRef: ids.ro,
    authorizedBy: 'DSO-001',
    transporterId: 'TRANS-001'
  });
  const receive3 = await post(`/transfers/${ids.depotToIssue}/receive`, { receivedQtyKg: qty });

  const allocation = await post('/fps-allocations', {
    allocationId: ids.allocation,
    fpsId: 'FPS-101',
    commodity,
    allocatedQtyKg: qty,
    month,
    sourceGodownId: 'ISSUE-001'
  });
  const fpsReceipt = await post(`/fps-allocations/${ids.allocation}/receipt`, { receivedQtyKg: qty });

  const auth = await post('/auth/mock-otp', {
    authTxnId: ids.auth,
    beneficiaryRefHash,
    rationCardHash,
    authMode: 'MOCK_OTP',
    authResult: 'SUCCESS'
  });

  const distribution = await post('/distributions', {
    distributionId: ids.distribution,
    fpsId: 'FPS-101',
    rationCardHash,
    beneficiaryRefHash,
    commodity,
    deliveredKg: qty,
    authMode: auth.authMode,
    authResult: auth.authResult,
    authTxnRefHash: auth.authTxnRefHash,
    dealerId: 'FPS-DEALER-101',
    timestamp: `${month}-15T10:00:00.000Z`
  });

  const entitlementAfter = await get(pathWithQuery(`/entitlements/${rationCardHash}`, { commodity, month }));
  const lotTrace = await get(`/trace/lots/${lot.lotId}`);
  const distributionTrace = await get(`/trace/distributions/${ids.distribution}`);
  const stock = await get(pathWithQuery('/stock', { commodity }));

  assertEqual(receive1.status, 'RECEIVED', `${commodity} procurement to FCI receipt`);
  assertEqual(receive2.status, 'RECEIVED', `${commodity} FCI to godown receipt`);
  assertEqual(receive3.status, 'RECEIVED', `${commodity} godown to issue receipt`);
  assertEqual(fpsReceipt.status, 'RECEIVED', `${commodity} FPS receipt`);
  assertEqual(distribution.deliveredKg, qty, `${commodity} beneficiary distribution`);
  assertEqual(entitlementAfter.availableBalanceKg, 0, `${commodity} entitlement balance`);

  return {
    commodity,
    quantityKg: qty,
    lotId: lot.lotId,
    ids,
    status: 'completed',
    approval,
    ledgerTxIds: {
      entitlement: entitlement.ledgerTxId,
      dispatch1: dispatch1.ledgerTxId,
      receive1: receive1.ledgerTxId,
      dispatch2: dispatch2.ledgerTxId,
      receive2: receive2.ledgerTxId,
      approval: approval.body?.ledgerTxId ?? null,
      dispatch3: dispatch3.ledgerTxId,
      receive3: receive3.ledgerTxId,
      allocation: allocation.ledgerTxId,
      fpsReceipt: fpsReceipt.ledgerTxId,
      auth: auth.ledgerTxId,
      distribution: distribution.ledgerTxId
    },
    validation: {
      entitlementAfter,
      lotTraceCount: lotTrace.history ? lotTrace.history.length : 0,
      distributionTraceCount: distributionTrace.history ? distributionTrace.history.length : 0,
      fpsStockAfterKg: stock.find((item) => item.entityId === 'FPS-101')?.quantityKg ?? 0,
      issueStockAfterKg: stock.find((item) => item.entityId === 'ISSUE-001')?.quantityKg ?? 0
    }
  };
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });

  const health = await get('/health');
  if (health.ledgerMode !== 'fabric') {
    throw new Error(`Expected fabric ledger mode, got ${JSON.stringify(health)}`);
  }

  const reset = await post('/admin/reset', {}, { admin: true });
  const results = [];
  for (const [commodity, qty] of commodities) {
    results.push(await runCommodity(reset, commodity, qty, results.length));
  }

  const [summary, entitlements, distributions, transfers, allocations, stock, alerts] = await Promise.all([
    get('/dashboard/summary'),
    get('/entitlements'),
    get('/distributions'),
    get('/transfers'),
    get('/fps-allocations'),
    get('/stock'),
    get('/audit-alerts')
  ]);

  const evidence = {
    runId,
    apiBase,
    month,
    rationCardHash,
    beneficiaryRefHash,
    reset,
    results,
    validation: {
      summary,
      entitlements: entitlements.filter((item) => item.rationCardHash === rationCardHash && item.month === month),
      distributions: distributions.filter((item) => item.distributionId.includes(runId)),
      transfers: transfers.filter((item) => item.transferId.includes(runId)),
      allocations: allocations.filter((item) => item.allocationId.includes(runId)),
      stock,
      openAlerts: alerts.filter((item) => item.status !== 'RESOLVED')
    }
  };

  const evidencePath = join(evidenceDir, `${runId}.json`);
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: true, runId, month, evidencePath, commodities: results.length }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
