#!/usr/bin/env node
/**
 * Live beneficiary lifecycle + fraud-prevention exercise against a running API.
 *
 * Requires:
 *   - API healthy (PostgreSQL + optional eligibility-mock)
 *   - PDS_BENCHMARK_CLIENT_SECRET or PDS_E2E_ACCESS_TOKEN
 *   - Department-capable service token (pds-benchmark or equivalent)
 *
 * This is complementary to scripts/live-lifecycle.mjs (supply-chain stock path).
 * It focuses on registry state transitions, eligibility review, entitlement gate,
 * and proof-status visibility — the demo narrative for fraud prevention.
 */
import { getServiceAccessToken } from './iam/service-token.mjs';

const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const token = await getServiceAccessToken();
const runId = process.env.RUN_ID ?? `BEN-LIVE-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`;
const digest = 'a'.repeat(64);

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { message: text };
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${parsed?.message ?? text}`);
  }
  return parsed;
}

const post = (path, body) => request(path, { method: 'POST', body });
const get = (path) => request(path);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const subject = `beneficiary-live-${runId.toLowerCase()}-hash`;
const card = `ration-card-live-${runId.toLowerCase()}-hash`;

console.log(`==> Beneficiary live run ${runId}`);

const created = await post('/beneficiary-registry/v1/events', {
  eventId: `${runId}-CREATED`,
  beneficiaryRefHash: subject,
  rationCardHash: card,
  eventType: 'BENEFICIARY_CREATED',
  sourceSystem: 'VIKSITPDS_DEMO',
  occurredAt: new Date().toISOString(),
  effectiveAt: new Date().toISOString(),
  reasonCode: 'DEMO_REGISTRY_IMPORT',
  policyId: 'MH-PANEL-DEMO-2026-V1',
  evidenceDigest: digest,
  districtCode: 'MH-DEMO-01',
  householdSizeDelta: 5,
  schemaVersion: '1.0'
});
assert(created.disposition === 'NEW', 'create disposition');
assert(created.projection?.state === 'ACTIVE', 'create state ACTIVE');
assert(typeof created.proofEventId === 'string', 'create proofEventId');

const migrated = await post('/beneficiary-registry/v1/events', {
  eventId: `${runId}-MIGRATED`,
  beneficiaryRefHash: subject,
  rationCardHash: card,
  eventType: 'MIGRATION_RECORDED',
  sourceSystem: 'VIKSITPDS_DEMO',
  occurredAt: new Date().toISOString(),
  effectiveAt: new Date().toISOString(),
  reasonCode: 'ONORC_MIGRATION',
  policyId: 'MH-PANEL-DEMO-2026-V1',
  evidenceDigest: digest,
  districtCode: 'MH-DEMO-02',
  householdSizeDelta: 0,
  priorState: 'ACTIVE',
  schemaVersion: '1.0'
});
assert(migrated.projection?.districtCode === 'MH-DEMO-02', 'migration district');

const bifurcated = await post('/beneficiary-registry/v1/events', {
  eventId: `${runId}-BIFURCATED`,
  beneficiaryRefHash: subject,
  rationCardHash: card,
  eventType: 'HOUSEHOLD_BIFURCATED',
  sourceSystem: 'FIELD_VERIFICATION',
  occurredAt: new Date().toISOString(),
  effectiveAt: new Date().toISOString(),
  reasonCode: 'HOUSEHOLD_SPLIT',
  policyId: 'MH-PANEL-DEMO-2026-V1',
  evidenceDigest: digest,
  householdSizeDelta: -1,
  priorState: 'ACTIVE',
  schemaVersion: '1.0'
});
assert(bifurcated.projection?.householdSize === 4, 'bifurcation household size');

const registrySummary = await get('/beneficiary-registry/v1/summary');
assert(registrySummary.lifecycleEvents >= 3, 'registry summary has lifecycle events');

const eligibilitySummary = await get('/eligibility/v1/summary');
assert(eligibilitySummary.simulationOnly === true, 'eligibility remains simulationOnly');

const screened = await post('/eligibility/v1/screenings', {
  screeningRequestId: `${runId}-SCREEN-001`,
  demoBeneficiaryId: 'BEN-DEMO-003',
  checks: ['ECONOMIC']
});
assert(screened.entitlementPreserved === true, 'screening preserves entitlement');
assert(screened.case?.state === 'OPEN' || screened.screening?.status, 'screening opened review or returned status');

if (screened.case?.caseId) {
  const caseId = screened.case.caseId;
  const version = screened.case.version;
  const noticed = await post(`/eligibility/v1/cases/${caseId}/notice`, {
    idempotencyKey: `${runId}-NOTICE`,
    expectedVersion: version,
    outcomeCode: 'ISSUED',
    reasonCode: 'ECONOMIC_REVIEW'
  });
  assert(noticed.proofStatus === 'PENDING' || noticed.proofEventId, 'notice checkpoint proof pending');
  assert(noticed.entitlementBlocked === false, 'notice does not block entitlement');

  const gate = await post('/eligibility/v1/entitlement-gate', {
    demoBeneficiaryId: 'BEN-DEMO-003',
    requestedQtyKg: 1
  });
  assert(gate.allowed === true, 'gate open before authorized RCMS decision');
}

const analytics = await get('/ledger-proofs/analytics').catch(() => null);
if (analytics?.completeness) {
  console.log('completeness', JSON.stringify(analytics.completeness.byModule));
  assert(
    typeof analytics.completeness.missingProofCount === 'number',
    'completeness missingProofCount present'
  );
}

console.log(JSON.stringify({
  ok: true,
  runId,
  registry: {
    created: created.projection,
    migratedDistrict: migrated.projection?.districtCode,
    bifurcatedHousehold: bifurcated.projection?.householdSize,
    proofEventIds: [created.proofEventId, migrated.proofEventId, bifurcated.proofEventId]
  },
  eligibility: {
    screeningStatus: screened.screening?.status ?? screened.status,
    caseId: screened.case?.caseId ?? null,
    entitlementPreserved: screened.entitlementPreserved
  }
}, null, 2));
