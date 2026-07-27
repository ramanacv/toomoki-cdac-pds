#!/usr/bin/env node
/**
 * FPS beneficiary authentication success + failure lifecycle against a running API
 * wired to epos-auth-mock.
 *
 * Requires:
 *   - API healthy (PostgreSQL; Fabric optional)
 *   - epos-auth-mock healthy on PDS_EPOS_AUTH_SERVICE_URL
 *   - API configured with PDS_EPOS_AUTH_SERVICE_URL + PDS_EPOS_AUTH_SERVICE_TOKEN
 *   - PDS_BENCHMARK_CLIENT_SECRET or PDS_E2E_ACCESS_TOKEN (fps-scoped service account)
 *   - FPS-101 stock available for the optional distribution cases (post live-lifecycle)
 *
 * Complementary to:
 *   - scripts/live-lifecycle.mjs (supply-chain + one happy-path OTP)
 *   - scripts/live-beneficiary-lifecycle.mjs (registry / eligibility fraud narrative)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getServiceAccessToken } from './iam/service-token.mjs';

const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const eposBase = (process.env.EPOS_AUTH_BASE ?? process.env.PDS_EPOS_AUTH_SERVICE_URL ?? 'http://127.0.0.1:3011')
  .replace('http://epos-auth-mock:3011', 'http://127.0.0.1:3011')
  .replace(/\/$/, '');
const eposToken = process.env.PDS_EPOS_AUTH_SERVICE_TOKEN ?? '';
const token = await getServiceAccessToken();
const runId = process.env.RUN_ID ?? `FPS-AUTH-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
const evidenceDir = process.env.EVIDENCE_DIR ?? '/tmp/pds-live-fps-auth';
const month = process.env.MONTH ?? new Date().toISOString().slice(0, 7);
const fpsId = 'FPS-101';
const commodity = 'Rice';
const distributionKg = Number(process.env.DISTRIBUTION_KG ?? '1');

const beneficiaryRefHash = process.env.BENEFICIARY_HASH ?? 'beneficiary-hash';
const rationCardHash = process.env.RATION_CARD_HASH ?? 'demo-ration-card-hash';

const cases = [];
const record = (id, detail) => {
  cases.push({ id, ...detail });
  const mark = detail.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${id}${detail.note ? ` — ${detail.note}` : ''}`);
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestRaw(path, { method = 'GET', body, base = apiBase, bearer = token } = {}) {
  const headers = new Headers();
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { message: text };
  }
  return { status: response.status, ok: response.ok, body: parsed, text };
}

async function request(path, options = {}) {
  const response = await requestRaw(path, options);
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed: ${response.status} ${response.body?.message ?? response.text}`
    );
  }
  return response.body;
}

const post = (path, body) => request(path, { method: 'POST', body });
const get = (path) => request(path);

async function expectStatus(path, { method = 'POST', body, status, name }) {
  const response = await requestRaw(path, { method, body });
  assert(
    response.status === status,
    `${name}: expected HTTP ${status}, got ${response.status} (${response.body?.message ?? response.text})`
  );
  return response;
}

async function eposAuthenticate(body) {
  assert(eposToken, 'PDS_EPOS_AUTH_SERVICE_TOKEN is required to probe epos-auth-mock directly');
  return requestRaw('/v1/authenticate', {
    method: 'POST',
    body: { ...body, schemaVersion: '1.0' },
    base: eposBase,
    bearer: eposToken
  });
}

function txnId(suffix) {
  return `${runId}-${suffix}`;
}

function authBody({ authTxnId, aadhaarRefHash, authResult = 'SUCCESS', approvedBy }) {
  return {
    authTxnId,
    beneficiaryRefHash,
    rationCardHash,
    aadhaarRefHash,
    authResult,
    ...(approvedBy ? { approvedBy } : {})
  };
}

console.log(`==> FPS auth lifecycle ${runId}`);
console.log(`api=${apiBase} epos=${eposBase}`);

// --- Preconditions ---
const health = await get('/health');
assert(health.ok === true, 'API /health must be ok');

const eposHealth = await requestRaw('/health', { base: eposBase, bearer: '' });
assert(eposHealth.ok === true, `epos-auth-mock /health failed: ${eposHealth.status}`);
assert(eposHealth.body?.simulationOnly === true, 'epos-auth-mock must advertise simulationOnly');
record('epos-mock-health', { ok: true, note: `port probe ${eposBase}` });

// Confirm API is wired to the mock (not local client-driven simulation).
const probeTxn = txnId('WIRE-PROBE');
const wired = await post('/auth/mock-otp', authBody({
  authTxnId: probeTxn,
  aadhaarRefHash: 'aadhaar-demo-fail-hash',
  // Client claims SUCCESS — mock must override to FAILURE when wired.
  authResult: 'SUCCESS'
}));
assert(wired.authResult === 'FAILURE', 'API must prefer epos-auth-mock outcome over client authResult');
assert(wired.fpsId === fpsId, 'auth must bind to FPS-101');
record('api-wired-to-epos-mock', {
  ok: true,
  note: 'client SUCCESS overridden to FAILURE via aadhaar-demo-fail-hash',
  authTxnId: wired.authTxnId,
  authResult: wired.authResult
});

// --- Direct mock reason-code matrix ---
const mockMatrix = [
  ['aadhaar-demo-001-hash', 'SUCCESS', 'AADHAAR_AUTH_SUCCESS'],
  ['aadhaar-demo-fail-hash', 'FAILURE', 'AADHAAR_AUTH_FAILED'],
  ['aadhaar-demo-suspended-hash', 'FAILURE', 'AADHAAR_SUSPENDED_REF'],
  ['aadhaar-demo-mismatch-hash', 'FAILURE', 'AADHAAR_DEMOGRAPHIC_MISMATCH']
];
for (const [aadhaarRefHash, authResult, reasonCode] of mockMatrix) {
  const suffix = aadhaarRefHash.replace(/[^a-z0-9]+/gi, '-').toUpperCase();
  const response = await eposAuthenticate({
    authTxnId: txnId(`MOCK-${suffix}`),
    aadhaarRefHash,
    beneficiaryRefHash,
    rationCardHash,
    fpsRef: fpsId,
    authMode: 'MOCK_OTP'
  });
  assert(response.ok, `mock ${aadhaarRefHash} HTTP ${response.status}`);
  assert(response.body.authResult === authResult, `mock ${aadhaarRefHash} authResult`);
  assert(response.body.reasonCode === reasonCode, `mock ${aadhaarRefHash} reasonCode`);
  assert(response.body.simulationOnly === true, `mock ${aadhaarRefHash} simulationOnly`);
  record(`mock-reason-${reasonCode}`, { ok: true, aadhaarRefHash, authResult, reasonCode });
}

// --- API mode matrix ---
const otpSuccess = await post('/auth/mock-otp', authBody({
  authTxnId: txnId('OTP-OK'),
  aadhaarRefHash: 'aadhaar-demo-001-hash',
  authResult: 'FAILURE' // ignored when mock wired
}));
assert(otpSuccess.authResult === 'SUCCESS', 'OTP success authResult');
assert(otpSuccess.authMode === 'MOCK_OTP', 'OTP success authMode');
assert(otpSuccess.authTxnRefHash, 'OTP success authTxnRefHash');
record('api-otp-success', { ok: true, authTxnId: otpSuccess.authTxnId, authTxnRefHash: otpSuccess.authTxnRefHash });

const bioSuccess = await post('/auth/simulated-biometric', authBody({
  authTxnId: txnId('BIO-OK'),
  aadhaarRefHash: 'aadhaar-demo-001-hash',
  authResult: 'SUCCESS'
}));
assert(bioSuccess.authResult === 'SUCCESS', 'biometric success authResult');
assert(bioSuccess.authMode === 'SIMULATED_BIOMETRIC', 'biometric authMode');
record('api-biometric-success', { ok: true, authTxnId: bioSuccess.authTxnId });

const failCases = [
  { suffix: 'OTP-FAIL', aadhaarRefHash: 'aadhaar-demo-fail-hash' },
  { suffix: 'OTP-SUSPENDED', aadhaarRefHash: 'aadhaar-demo-suspended-hash' },
  { suffix: 'OTP-MISMATCH', aadhaarRefHash: 'aadhaar-demo-mismatch-hash' },
  // Unknown aadhaar so the mock falls through to ration-card scenario keys.
  {
    suffix: 'RATION-FAIL',
    aadhaarRefHash: 'aadhaar-unknown-demo-hash',
    rationCardHash: 'demo-ration-card-fail-hash'
  }
];
const failedAuths = [];
for (const failCase of failCases) {
  const body = authBody({
    authTxnId: txnId(failCase.suffix),
    aadhaarRefHash: failCase.aadhaarRefHash,
    authResult: 'SUCCESS'
  });
  if (failCase.rationCardHash) body.rationCardHash = failCase.rationCardHash;
  const auth = await post('/auth/mock-otp', body);
  assert(auth.authResult === 'FAILURE', `${failCase.suffix} expected FAILURE`);
  failedAuths.push(auth);
  record(`api-auth-failure-${failCase.suffix.toLowerCase()}`, {
    ok: true,
    authTxnId: auth.authTxnId,
    authTxnRefHash: auth.authTxnRefHash
  });
}

// List visibility (fps-scoped)
const listed = await get('/auth/transactions');
assert(Array.isArray(listed), 'auth transactions list');
for (const auth of [otpSuccess, bioSuccess, ...failedAuths]) {
  assert(
    listed.some((item) => item.authTxnId === auth.authTxnId && item.authResult === auth.authResult),
    `listed auth ${auth.authTxnId}`
  );
}
record('api-auth-transactions-list', { ok: true, count: listed.length });

// --- Privacy rejection ---
const rawAadhaar = await expectStatus('/auth/mock-otp', {
  status: 400,
  name: 'raw Aadhaar rejected',
  body: {
    authTxnId: txnId('RAW-AADHAAR'),
    beneficiaryRefHash: '123412341234',
    rationCardHash,
    aadhaarRefHash: '123412341234',
    authResult: 'SUCCESS'
  }
});
record('api-reject-raw-aadhaar', { ok: true, status: rawAadhaar.status });

// --- Conflicting authTxnId reuse through API (mock 409 -> API 400) ---
const conflictId = txnId('CONFLICT');
await post('/auth/mock-otp', authBody({
  authTxnId: conflictId,
  aadhaarRefHash: 'aadhaar-demo-001-hash'
}));
const conflict = await expectStatus('/auth/mock-otp', {
  status: 400,
  name: 'conflicting authTxnId',
  body: authBody({
    authTxnId: conflictId,
    aadhaarRefHash: 'aadhaar-demo-fail-hash'
  })
});
record('api-auth-txn-conflict', { ok: true, status: conflict.status });

// Identical replay conflicts at the ledger (authTxnId unique), even when the mock is idempotent.
const replay = await requestRaw('/auth/mock-otp', {
  method: 'POST',
  body: authBody({
    authTxnId: otpSuccess.authTxnId,
    aadhaarRefHash: 'aadhaar-demo-001-hash',
    authResult: 'FAILURE'
  })
});
assert(replay.status === 409, `identical authTxnId replay expected 409, got ${replay.status}`);
record('api-auth-txn-duplicate', { ok: true, status: replay.status });

// --- Distribution gates ---
const stock = await get('/stock');
const riceStock = (Array.isArray(stock) ? stock : []).find(
  (row) => row.commodity === commodity && row.entityId === fpsId
);
const stockKg = Number(riceStock?.quantityKg ?? 0);

await post('/entitlements', {
  rationCardHash,
  commodity,
  month,
  monthlyEntitlementKg: 25,
  alreadyLiftedKg: 0,
  availableBalanceKg: 25,
  active: true
});

// FAILURE distribution is rejected before stock is consumed — always exercise it.
const failedAuth = failedAuths[0];
const blocked = await expectStatus('/distributions', {
  status: 400,
  name: 'distribution after auth FAILURE',
  body: {
    distributionId: txnId('DIST-FAIL'),
    rationCardHash,
    beneficiaryRefHash,
    commodity,
    deliveredKg: distributionKg,
    authMode: 'MOCK_OTP',
    authResult: 'FAILURE',
    authTxnRefHash: failedAuth.authTxnRefHash,
    timestamp: `${month}-15T12:00:00.000Z`
  }
});
assert(
  /failed authentication/i.test(blocked.body?.message ?? blocked.text),
  'failure distribution message'
);
record('distribution-blocked-after-auth-failure', {
  ok: true,
  status: blocked.status,
  message: blocked.body?.message ?? blocked.text
});

// Two successful lifts follow (supervisor exception + OTP success).
const requiredStockKg = distributionKg * 2;
assert(
  stockKg >= requiredStockKg,
  `FPS-101 ${commodity} stock ${stockKg}kg < ${requiredStockKg}kg required for exception+success distributions (run live-lifecycle first)`
);

const exceptionAuth = await post(
  '/auth/supervisor-exception',
  authBody({
    authTxnId: txnId('SUPERVISOR'),
    aadhaarRefHash: 'aadhaar-demo-fail-hash',
    authResult: 'FAILURE',
    approvedBy: 'SUPERVISOR-101'
  })
);
assert(exceptionAuth.authResult === 'EXCEPTION_APPROVED', 'supervisor exception authResult');
assert(exceptionAuth.authMode === 'SUPERVISOR_EXCEPTION', 'supervisor exception authMode');
record('api-supervisor-exception', {
  ok: true,
  authTxnId: exceptionAuth.authTxnId,
  authTxnRefHash: exceptionAuth.authTxnRefHash
});

const distributed = await post('/distributions', {
  distributionId: txnId('DIST-EXCEPTION'),
  rationCardHash,
  beneficiaryRefHash,
  commodity,
  deliveredKg: distributionKg,
  authMode: 'SUPERVISOR_EXCEPTION',
  authResult: 'EXCEPTION_APPROVED',
  authTxnRefHash: exceptionAuth.authTxnRefHash,
  approvedBy: 'SUPERVISOR-101',
  exceptionReason: 'Biometric authentication failed; supervisor override for demo',
  timestamp: `${month}-15T12:05:00.000Z`
});
assert(distributed.deliveredKg === distributionKg, 'exception distribution quantity');
assert(distributed.fpsId === fpsId, 'exception distribution fps');

const alerts = await get('/audit-alerts');
const exceptionAlert = (Array.isArray(alerts) ? alerts : []).find(
  (alert) =>
    alert.alertType === 'UNAUTHORIZED_TRANSACTION' &&
    (alert.entityId === distributed.distributionId || alert.entityId === txnId('DIST-EXCEPTION'))
);
assert(exceptionAlert, 'supervisor-exception distribution raises UNAUTHORIZED_TRANSACTION alert');
record('distribution-after-supervisor-exception', {
  ok: true,
  distributionId: distributed.distributionId,
  alertId: exceptionAlert.alertId,
  deliveredKg: distributed.deliveredKg
});

// Happy-path OTP distribution using the earlier success auth ref.
await post('/entitlements', {
  rationCardHash,
  commodity,
  month,
  monthlyEntitlementKg: 25,
  alreadyLiftedKg: 0,
  availableBalanceKg: 25,
  active: true
});
const happy = await post('/distributions', {
  distributionId: txnId('DIST-OK'),
  rationCardHash,
  beneficiaryRefHash,
  commodity,
  deliveredKg: distributionKg,
  authMode: 'MOCK_OTP',
  authResult: 'SUCCESS',
  authTxnRefHash: otpSuccess.authTxnRefHash,
  timestamp: `${month}-15T12:10:00.000Z`
});
assert(happy.deliveredKg === distributionKg, 'success distribution quantity');
record('distribution-after-otp-success', {
  ok: true,
  distributionId: happy.distributionId,
  deliveredKg: happy.deliveredKg
});

const failed = cases.filter((item) => !item.ok);
assert(failed.length === 0, `FPS auth lifecycle failures: ${failed.map((item) => item.id).join(', ')}`);

const summary = {
  ok: true,
  runId,
  month,
  apiBase,
  eposBase,
  fpsId,
  stockKg,
  requiredStockKg,
  distributionBlocked: true,
  // Auth-focused script: operational gates only. Outbox/Fabric proof completion
  // remains covered by scripts/live-lifecycle.mjs.
  proofCompletionGate: 'deferred-to-live-lifecycle',
  cases
};

await mkdir(evidenceDir, { recursive: true });
const evidencePath = join(evidenceDir, `${runId}.json`);
await writeFile(evidencePath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ ...summary, evidencePath, caseCount: cases.length }, null, 2));
