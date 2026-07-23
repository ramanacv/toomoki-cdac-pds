#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getServiceAccessToken } from './iam/service-token.mjs';

const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const token = await getServiceAccessToken();
const runId = process.env.RUN_ID ?? `LIVE-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
const month = process.env.MONTH ?? new Date().toISOString().slice(0, 7);
const evidenceDir = process.env.EVIDENCE_DIR ?? '/tmp/pds-live-lifecycle';
const rationCardHash = process.env.RATION_CARD_HASH ?? 'demo-ration-card-hash';
const beneficiaryRefHash = process.env.BENEFICIARY_HASH ?? 'beneficiary-hash';
const proofTimeoutMs = Number(process.env.PROOF_TIMEOUT_MS ?? '120000');
const proofPollIntervalMs = Number(process.env.PROOF_POLL_INTERVAL_MS ?? '30000');

const allCommodities = [
  ['Rice', 5000],
  ['Wheat', 4000],
  ['Sugar', 2000],
  ['Kerosene', 500],
  ['Dal', 400],
  ['Cooking Oil', 300]
];
const commodities = process.env.ALL_COMMODITIES?.toLowerCase() === 'true' ? allCommodities : allCommodities.slice(0, 1);

const slug = (value) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const pathWithQuery = (path, query = {}) => {
  const url = new URL(path, apiBase);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
};

async function request(path, { method = 'GET', body, admin = false, role } = {}) {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const rateLimitDeadline = Date.now() + 65_000;
  while (true) {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    if (response.status === 429 && Date.now() < rateLimitDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (!response.ok) {
      const message = parsed?.message ?? text ?? response.statusText;
      throw new Error(`${method} ${path} failed: ${response.status} ${message}`);
    }
    return parsed;
  }
}

const get = (path, options) => request(path, options);
const post = (path, body, options) => request(path, { ...options, method: 'POST', body });

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

function actualQuantities(commodity, plannedQtyKg) {
  if (commodity !== 'Rice') {
    return {
      dispatch1Kg: plannedQtyKg,
      receive1Kg: plannedQtyKg,
      dispatch2Kg: plannedQtyKg,
      receive2Kg: plannedQtyKg,
      dispatch3Kg: plannedQtyKg,
      receive3Kg: plannedQtyKg,
      allocationKg: plannedQtyKg,
      fpsReceiptKg: plannedQtyKg,
      distributionKg: plannedQtyKg
    };
  }

  return {
    dispatch1Kg: 5000,
    receive1Kg: 4900,
    dispatch2Kg: 4800,
    receive2Kg: 4750,
    dispatch3Kg: 4600,
    receive3Kg: 4550,
    allocationKg: 4500,
    fpsReceiptKg: 4400,
    distributionKg: 4400
  };
}

const stockQuantity = (stock, entityId) => stock.find((item) => item.entityId === entityId)?.quantityKg ?? 0;

async function captureStock(commodity, step, expected) {
  const stock = await get(pathWithQuery('/stock', { commodity }));
  for (const [entityId, quantityKg] of Object.entries(expected)) {
    assertEqual(stockQuantity(stock, entityId), quantityKg, `${commodity} ${step} stock at ${entityId}`);
  }
  return {
    step,
    expected,
    actual: Object.fromEntries(Object.keys(expected).map((entityId) => [entityId, stockQuantity(stock, entityId)]))
  };
}

async function assertShortReceiptAlert(entityId, dispatchedQtyKg, receivedQtyKg) {
  const alerts = await get('/audit-alerts');
  const alert = alerts.find((item) => item.alertType === 'SHORT_RECEIPT' && item.entityId === entityId);
  if (!alert) {
    throw new Error(`Missing SHORT_RECEIPT alert for ${entityId}`);
  }
  assertEqual(alert.evidence?.dispatchedQtyKg ?? alert.evidence?.allocatedQtyKg, dispatchedQtyKg, `${entityId} alert sent quantity`);
  assertEqual(alert.evidence?.receivedQtyKg, receivedQtyKg, `${entityId} alert received quantity`);
  assertEqual(alert.evidence?.shortageQtyKg, dispatchedQtyKg - receivedQtyKg, `${entityId} alert shortage quantity`);
  return alert;
}

async function waitForCommittedProofs(events) {
  const deadline = Date.now() + proofTimeoutMs;
  let statuses = [];
  while (Date.now() < deadline) {
    statuses = await Promise.all(events.map((event) => get(`/ledger-proofs/${encodeURIComponent(event.ledgerTxId)}`)));
    const terminalFailure = statuses.find((proof) => proof.status === 'DEAD_LETTER');
    if (terminalFailure) {
      throw new Error(`Fabric proof ${terminalFailure.eventId} reached DEAD_LETTER: ${terminalFailure.rawWorkerError ?? terminalFailure.failureCategory ?? 'unknown error'}`);
    }
    if (statuses.every((proof) => proof.status === 'COMMITTED' && proof.fabricTxId)) {
      return statuses;
    }
    await new Promise((resolve) => setTimeout(resolve, proofPollIntervalMs));
  }
  const outstanding = statuses.filter((proof) => proof.status !== 'COMMITTED');
  throw new Error(`Timed out waiting for ${outstanding.length}/${events.length} Fabric proofs: ${JSON.stringify(outstanding)}`);
}

async function runCommodity(reset, commodity, qty, index) {
  const commoditySlug = slug(commodity);
  const lot = mustFindLot(reset, commodity);
  const quantities = actualQuantities(commodity, qty);
  const vehicle = `LIVE${String(index + 1).padStart(4, '0')}`;
  const stockChecks = [];
  const shortageAlerts = [];
  const ids = {
    procToFci: `TR-${runId}-${commoditySlug}-PROC-FCI`,
    fciToDepot: `TR-${runId}-${commoditySlug}-FCI-DEPOT`,
    depotToIssue: `TR-${runId}-${commoditySlug}-DEPOT-ISSUE`,
    allocation: `ALLOC-${runId}-${commoditySlug}-FPS`,
    auth: `AUTH-${runId}-${commoditySlug}`,
    distribution: `DIST-${runId}-${commoditySlug}-001`,
    ro: `RO-${runId}-${commoditySlug}`
  };

  const entitlement = await post(
    '/entitlements',
    {
      rationCardHash,
      commodity,
      month,
      monthlyEntitlementKg: quantities.distributionKg,
      alreadyLiftedKg: 0,
      availableBalanceKg: quantities.distributionKg,
      active: true
    },
    { role: 'department' }
  );

  const dispatch1 = await post(
    '/transfers',
    {
      transferId: ids.procToFci,
      lotId: lot.lotId,
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: quantities.dispatch1Kg,
      vehicleNo: vehicle,
      stage: 'I',
      transporterId: 'TRANS-001'
    },
    { role: 'procurement' }
  );
  stockChecks.push(await captureStock(commodity, 'after procurement dispatch', {
    'PROC-001': lot.quantityKg - quantities.dispatch1Kg,
    'FCI-001': 0
  }));
  const receive1 = await post(`/transfers/${ids.procToFci}/receive`, { receivedQtyKg: quantities.receive1Kg }, { role: 'godown' });
  stockChecks.push(await captureStock(commodity, 'after FCI receipt', {
    'PROC-001': lot.quantityKg - quantities.dispatch1Kg,
    'FCI-001': quantities.receive1Kg
  }));
  if (quantities.receive1Kg < quantities.dispatch1Kg) {
    shortageAlerts.push(await assertShortReceiptAlert(ids.procToFci, quantities.dispatch1Kg, quantities.receive1Kg));
  }

  const dispatch2 = await post(
    '/transfers',
    {
      transferId: ids.fciToDepot,
      lotId: lot.lotId,
      fromOrg: 'FCI-001',
      toOrg: 'GODOWN-S-001',
      dispatchedQtyKg: quantities.dispatch2Kg,
      vehicleNo: `${vehicle}B`,
      stage: 'I',
      transporterId: 'TRANS-001'
    },
    { role: 'godown' }
  );
  stockChecks.push(await captureStock(commodity, 'after FCI dispatch', {
    'FCI-001': quantities.receive1Kg - quantities.dispatch2Kg,
    'GODOWN-S-001': 0
  }));
  const receive2 = await post(`/transfers/${ids.fciToDepot}/receive`, { receivedQtyKg: quantities.receive2Kg }, { role: 'godown' });
  stockChecks.push(await captureStock(commodity, 'after state godown receipt', {
    'FCI-001': quantities.receive1Kg - quantities.dispatch2Kg,
    'GODOWN-S-001': quantities.receive2Kg
  }));
  if (quantities.receive2Kg < quantities.dispatch2Kg) {
    shortageAlerts.push(await assertShortReceiptAlert(ids.fciToDepot, quantities.dispatch2Kg, quantities.receive2Kg));
  }

  const approval = await post(
    `/transfers/${ids.depotToIssue}/authorize`,
    {
      authorizedBy: 'DSO-001',
      roRef: ids.ro,
      remarks: 'Live lifecycle reset run'
    },
    { role: 'department' }
  );
  assertEqual(approval.transferId, ids.depotToIssue, `${commodity} authorization transfer id`);
  assertEqual(approval.authorizedBy, 'DSO-001', `${commodity} authorization actor`);
  stockChecks.push(await captureStock(commodity, 'after stage-II authorization', {
    'GODOWN-S-001': quantities.receive2Kg,
    'ISSUE-001': 0
  }));

  const dispatch3 = await post(
    '/transfers',
    {
      transferId: ids.depotToIssue,
      lotId: lot.lotId,
      fromOrg: 'GODOWN-S-001',
      toOrg: 'ISSUE-001',
      dispatchedQtyKg: quantities.dispatch3Kg,
      vehicleNo: `${vehicle}C`,
      stage: 'II',
      roRef: ids.ro,
      authorizedBy: 'DSO-001',
      transporterId: 'TRANS-001'
    },
    { role: 'godown' }
  );
  assertEqual(dispatch3.approvalStatus, 'APPROVED', `${commodity} stage-II workflow approval`);
  assertEqual(dispatch3.authorizedBy, 'DSO-001', `${commodity} stage-II approved by`);
  stockChecks.push(await captureStock(commodity, 'after state godown dispatch', {
    'GODOWN-S-001': quantities.receive2Kg - quantities.dispatch3Kg,
    'ISSUE-001': 0
  }));
  const receive3 = await post(`/transfers/${ids.depotToIssue}/receive`, { receivedQtyKg: quantities.receive3Kg }, { role: 'godown' });
  stockChecks.push(await captureStock(commodity, 'after issue centre receipt', {
    'GODOWN-S-001': quantities.receive2Kg - quantities.dispatch3Kg,
    'ISSUE-001': quantities.receive3Kg
  }));
  if (quantities.receive3Kg < quantities.dispatch3Kg) {
    shortageAlerts.push(await assertShortReceiptAlert(ids.depotToIssue, quantities.dispatch3Kg, quantities.receive3Kg));
  }

  const allocation = await post(
    '/fps-allocations',
    {
      allocationId: ids.allocation,
      fpsId: 'FPS-101',
      commodity,
      allocatedQtyKg: quantities.allocationKg,
      month,
      sourceGodownId: 'ISSUE-001'
    },
    { role: 'godown' }
  );
  stockChecks.push(await captureStock(commodity, 'after FPS allocation approval', {
    'ISSUE-001': quantities.receive3Kg - quantities.allocationKg,
    'FPS-101': 0
  }));
  const fpsReceipt = await post(
    `/fps-allocations/${ids.allocation}/receipt`,
    { receivedQtyKg: quantities.fpsReceiptKg },
    { role: 'fps' }
  );
  stockChecks.push(await captureStock(commodity, 'after FPS receipt', {
    'ISSUE-001': quantities.receive3Kg - quantities.allocationKg,
    'FPS-101': quantities.fpsReceiptKg
  }));
  if (quantities.fpsReceiptKg < quantities.allocationKg) {
    shortageAlerts.push(await assertShortReceiptAlert(ids.allocation, quantities.allocationKg, quantities.fpsReceiptKg));
  }

  const auth = await post(
    '/auth/mock-otp',
    {
      authTxnId: ids.auth,
      beneficiaryRefHash,
      rationCardHash,
      authMode: 'MOCK_OTP',
      authResult: 'SUCCESS'
    },
    { role: 'fps' }
  );

  const distribution = await post(
    '/distributions',
    {
      distributionId: ids.distribution,
      rationCardHash,
      beneficiaryRefHash,
      commodity,
      deliveredKg: quantities.distributionKg,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      timestamp: `${month}-15T10:00:00.000Z`
    },
    { role: 'fps' }
  );

  const entitlementAfter = await get(pathWithQuery(`/entitlements/${rationCardHash}`, { commodity, month }));
  const stock = await get(pathWithQuery('/stock', { commodity }));

  assertEqual(receive1.status, quantities.receive1Kg < quantities.dispatch1Kg ? 'RECEIVED_WITH_SHORTAGE' : 'RECEIVED', `${commodity} procurement to FCI receipt`);
  assertEqual(receive2.status, quantities.receive2Kg < quantities.dispatch2Kg ? 'RECEIVED_WITH_SHORTAGE' : 'RECEIVED', `${commodity} FCI to godown receipt`);
  assertEqual(receive3.status, quantities.receive3Kg < quantities.dispatch3Kg ? 'RECEIVED_WITH_SHORTAGE' : 'RECEIVED', `${commodity} godown to issue receipt`);
  assertEqual(fpsReceipt.status, quantities.fpsReceiptKg < quantities.allocationKg ? 'RECEIVED_WITH_SHORTAGE' : 'RECEIVED', `${commodity} FPS receipt`);
  assertEqual(distribution.deliveredKg, quantities.distributionKg, `${commodity} beneficiary distribution`);
  assertEqual(entitlementAfter.availableBalanceKg, 0, `${commodity} entitlement balance`);
  stockChecks.push(await captureStock(commodity, 'after beneficiary distribution', {
    'ISSUE-001': quantities.receive3Kg - quantities.allocationKg,
    'FPS-101': quantities.fpsReceiptKg - quantities.distributionKg
  }));

  return {
    commodity,
    plannedQuantityKg: qty,
    actualQuantitiesKg: quantities,
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
      approval: approval.ledgerTxId,
      dispatch3: dispatch3.ledgerTxId,
      receive3: receive3.ledgerTxId,
      allocation: allocation.ledgerTxId,
      fpsReceipt: fpsReceipt.ledgerTxId,
      auth: auth.ledgerTxId,
      distribution: distribution.ledgerTxId
    },
    validation: {
      entitlementAfter,
      stockChecks,
      shortageAlerts,
      fpsStockAfterKg: stock.find((item) => item.entityId === 'FPS-101')?.quantityKg ?? 0,
      issueStockAfterKg: stock.find((item) => item.entityId === 'ISSUE-001')?.quantityKg ?? 0
    }
  };
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });

  const [health, network] = await Promise.all([get('/health'), get('/admin/network')]);
  if (!health.ok || network.ledgerMode !== 'fabric') {
    throw new Error(`Expected live fabric ledger mode, got ${JSON.stringify({ health, network })}`);
  }

  const reset = await post('/admin/reset', {}, { admin: true });
  const results = [];
  for (const [commodity, qty] of commodities) {
    results.push(await runCommodity(reset, commodity, qty, results.length));
  }

  const [summary, entitlements, distributions, transfers, allocations, stock, alerts, events] = await Promise.all([
    get('/dashboard/summary'),
    get('/entitlements'),
    get('/distributions'),
    get('/transfers'),
    get('/fps-allocations'),
    get('/stock'),
    get('/audit-alerts'),
    get('/ledger-events')
  ]);
  const proofStatuses = await waitForCommittedProofs(events);
  await Promise.all(results.map(async (result) => {
    const [lotTrace, distributionTrace] = await Promise.all([
      get(`/trace/lots/${result.lotId}`),
      get(`/trace/distributions/${result.ids.distribution}`)
    ]);
    result.validation.lotTraceCount = lotTrace.history?.length ?? 0;
    result.validation.distributionTraceCount = distributionTrace.history?.length ?? 0;
    if (result.validation.lotTraceCount === 0 || result.validation.distributionTraceCount === 0) {
      throw new Error(`Missing committed Fabric trace history for ${result.commodity}`);
    }
  }));
  const proofSummary = await get('/admin/proofs/summary');
  const runAlerts = alerts.filter((item) =>
    Object.values(results.flatMap((result) => [
      result.ids.procToFci,
      result.ids.fciToDepot,
      result.ids.depotToIssue,
      result.ids.allocation
    ])).includes(item.entityId)
  );
  assertEqual(runAlerts.length, 4, 'live lifecycle shortage alert count');
  assertEqual(proofStatuses.filter((proof) => proof.status === 'COMMITTED').length, events.length, 'committed Fabric proof count');

  const evidence = {
    runId,
    apiBase,
    month,
    network,
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
      openAlerts: alerts.filter((item) => item.status !== 'RESOLVED'),
      runAlerts,
      proofStatuses,
      proofSummary
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
