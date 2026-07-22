#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform, release } from 'node:os';
import { resolve } from 'node:path';
import pg from 'pg';
import { getServiceAccessToken } from './iam/service-token.mjs';

if (process.env.PDS_BENCHMARK_ENABLED !== 'true') throw new Error('Refusing benchmark: set PDS_BENCHMARK_ENABLED=true');
if (process.env.PDS_LEDGER_MODE !== 'fabric') throw new Error('Refusing benchmark: PDS_LEDGER_MODE must be fabric');
if (process.env.PDS_PERSISTENCE_BACKEND !== 'postgres') throw new Error('Refusing benchmark: PDS_PERSISTENCE_BACKEND must be postgres');
if (process.env.PDS_BENCHMARK_ALLOW_RESET !== 'true') throw new Error('Refusing benchmark reset: set PDS_BENCHMARK_ALLOW_RESET=true separately');
if (!process.env.PDS_BENCHMARK_POSTGRES_DSN) throw new Error('Refusing benchmark setup: set PDS_BENCHMARK_POSTGRES_DSN explicitly');

const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const token = await getServiceAccessToken();
const runId = `BENCH-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${process.pid}`;
const month = new Date().toISOString().slice(0, 7);
const lifecycleConcurrency = Number(process.env.PDS_BENCHMARK_LIFECYCLE_CONCURRENCY ?? '2');
const rawPath = `/tmp/viksitpds-${runId}.json`;
const summaryPath = resolve(process.cwd(), 'docs/implementation/benchmark-results.md');
const measurements = [];
let expectedRequests = 0;
let successfulRequests = 0;

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.ceil((p / 100) * ordered.length) - 1)];
};

const request = async (path, { method = 'GET', body, operation = method === 'GET' ? 'read' : 'mutation', expected = true } = {}) => {
  const started = performance.now();
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `${runId}:${method}:${path}:${crypto.randomUUID()}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const durationMs = performance.now() - started;
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  measurements.push({ operation, method, path: path.replace(/[A-Z]+-[A-Z0-9-]+/g, ':id'), status: response.status, durationMs });
  if (expected) expectedRequests += 1;
  if (response.ok && expected) successfulRequests += 1;
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${typeof payload === 'string' ? payload : payload?.message ?? ''}`);
  return payload;
};

const runPool = async (count, concurrency, task) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < count) {
      const index = cursor++;
      await task(index);
    }
  }));
};

const health = await request('/health', { expected: false });
if (!health?.ok) throw new Error('API health check failed');
const network = await request('/admin/network', { expected: false });
if (network.ledgerMode !== 'fabric' || network.persistenceBackend !== 'postgres') {
  throw new Error(`Runtime mismatch: ledger=${network.ledgerMode}, persistence=${network.persistenceBackend}`);
}

const proofBaseline = await request('/admin/proofs/summary', { expected: false });
const outstandingStates = ['PENDING', 'SUBMITTING', 'FAILED', 'DEAD_LETTER'];
const baselineOutstanding = outstandingStates.reduce((total, state) => total + Number(proofBaseline.counts?.[state] ?? 0), 0);
if (baselineOutstanding > 0) {
  throw new Error(`Refusing benchmark: outbox baseline has ${baselineOutstanding} outstanding proof(s)`);
}
await request('/admin/reset', { method: 'POST', body: {}, expected: false });

const benchmarkRefs = (index) => {
  const prefix = `${runId}-${String(index + 1).padStart(2, '0')}`;
  return {
    prefix,
    cardHash: `benchmark-ration-card-hash-${prefix.toLowerCase()}`,
    beneficiaryHash: `benchmark-beneficiary-hash-${prefix.toLowerCase()}`
  };
};

const { Pool } = pg;
const setupPool = new Pool({ connectionString: process.env.PDS_BENCHMARK_POSTGRES_DSN, max: 1 });
const setupClient = await setupPool.connect();
try {
  await setupClient.query('BEGIN');
  await setupClient.query("DELETE FROM beneficiary_registry_mock WHERE beneficiary_ref_hash LIKE 'benchmark-beneficiary-hash-bench-%'");
  await setupClient.query("DELETE FROM ration_cards_mock WHERE ration_card_hash LIKE 'benchmark-ration-card-hash-bench-%'");
  for (let index = 0; index < 20; index += 1) {
    const { cardHash, beneficiaryHash } = benchmarkRefs(index);
    await setupClient.query(
      `INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
       VALUES ($1, 1, 'Controlled benchmark', 'ACTIVE')`,
      [cardHash]
    );
    await setupClient.query(
      `INSERT INTO beneficiary_registry_mock (beneficiary_ref_hash, name_masked, district, ration_card_hash, active)
       VALUES ($1, 'BENCHMARK-***', 'Controlled benchmark', $2, TRUE)`,
      [beneficiaryHash, cardHash]
    );
  }
  await setupClient.query('COMMIT');
} catch (error) {
  await setupClient.query('ROLLBACK');
  throw error;
} finally {
  setupClient.release();
  await setupPool.end();
}

for (const concurrency of [1, 5, 10]) {
  await runPool(200, concurrency, async () => request('/dashboard/summary', { operation: `read-c${concurrency}` }));
}

const lifecycle = async (index) => {
  const { prefix, cardHash, beneficiaryHash } = benchmarkRefs(index);
  const lotId = `LOT-${prefix}`;
  const quantityKg = 25;
  const post = (path, body) => request(path, { method: 'POST', body });
  await post('/lots', { lotId, commodity: 'Rice', season: 'Benchmark', quantityKg, qualityGrade: 'A', source: 'Controlled benchmark', currentOwner: 'PROC-001', currentLocation: 'Benchmark yard' });
  await post('/entitlements', { rationCardHash: cardHash, commodity: 'Rice', month, monthlyEntitlementKg: quantityKg, alreadyLiftedKg: 0, availableBalanceKg: quantityKg, active: true });
  const transfers = [
    [`TR-${prefix}-1`, 'PROC-001', 'FCI-001', 'I'],
    [`TR-${prefix}-2`, 'FCI-001', 'GODOWN-S-001', 'I'],
    [`TR-${prefix}-3`, 'GODOWN-S-001', 'ISSUE-001', 'II']
  ];
  for (const [transferId, fromOrg, toOrg, stage] of transfers) {
    await post('/transfers', { transferId, lotId, fromOrg, toOrg, dispatchedQtyKg: quantityKg, vehicleNo: `BENCH${index}V`, stage, transporterId: 'TRANS-001', ...(stage === 'II' ? { roRef: `RO-${prefix}`, authorizedBy: 'DSO-001' } : {}) });
    await post(`/transfers/${transferId}/receive`, { receivedQtyKg: quantityKg });
  }
  const allocationId = `ALLOC-${prefix}`;
  await post('/fps-allocations', { allocationId, fpsId: 'FPS-101', commodity: 'Rice', allocatedQtyKg: quantityKg, month, sourceGodownId: 'ISSUE-001' });
  await post(`/fps-allocations/${allocationId}/receipt`, { receivedQtyKg: quantityKg });
  const auth = await post('/auth/mock-otp', { authTxnId: `AUTH-${prefix}`, beneficiaryRefHash: beneficiaryHash, rationCardHash: cardHash, authMode: 'MOCK_OTP', authResult: 'SUCCESS' });
  await post('/distributions', { distributionId: `DIST-${prefix}`, fpsId: 'FPS-101', rationCardHash: cardHash, beneficiaryRefHash: beneficiaryHash, commodity: 'Rice', deliveredKg: quantityKg, authMode: auth.authMode, authResult: auth.authResult, authTxnRefHash: auth.authTxnRefHash, dealerId: 'FPS-DEALER-101', timestamp: `${month}-15T10:00:00.000Z` });
};

await runPool(20, lifecycleConcurrency, lifecycle);

const allEvents = await request('/ledger-events', { expected: false });
const generatedEvents = allEvents.filter((event) => event.entityId?.includes(runId) || JSON.stringify(event.payload).includes(runId));
const proofStarted = performance.now();
let proofStatuses = [];
while (performance.now() - proofStarted < 60_000) {
  proofStatuses = await Promise.all(generatedEvents.map((event) => request(`/ledger-proofs/${encodeURIComponent(event.ledgerTxId)}`, { expected: false })));
  if (proofStatuses.every((proof) => proof.status === 'COMMITTED')) break;
  await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
}
const proofLatencies = proofStatuses.filter((proof) => proof.committedAt).map((proof) => new Date(proof.committedAt).getTime() - new Date(proof.createdAt).getTime());
const fabricTxIds = proofStatuses.map((proof) => proof.fabricTxId).filter(Boolean);
const finalProofSummary = await request('/admin/proofs/summary', { expected: false });

const durationFor = (prefix) => measurements.filter((item) => item.operation.startsWith(prefix)).map((item) => item.durationMs);
const reads = durationFor('read');
const mutations = measurements.filter((item) => item.operation === 'mutation').map((item) => item.durationMs);
const result = {
  runId,
  environment: { platform: platform(), release: release(), cpuCount: cpus().length, memoryGiB: Number((totalmem() / 2 ** 30).toFixed(1)), node: process.version, channel: network.fabric?.channel, chaincode: network.fabric?.chaincode, mspId: network.fabric?.mspId, apiReadRateLimitPerMinute: Number(process.env.PDS_BENCHMARK_API_READ_LIMIT_PER_MINUTE ?? '120'), apiMutationRateLimitPerMinute: Number(process.env.PDS_BENCHMARK_API_MUTATION_LIMIT_PER_MINUTE ?? '30') },
  workload: { authenticatedReads: 600, readConcurrency: [1, 5, 10], lifecycleSequences: 20, lifecycleConcurrency },
  operational: { expectedRequests, successfulRequests, successRatePct: Number(((successfulRequests / expectedRequests) * 100).toFixed(2)), readMs: { p50: percentile(reads, 50), p95: percentile(reads, 95), p99: percentile(reads, 99) }, mutationMs: { p50: percentile(mutations, 50), p95: percentile(mutations, 95), p99: percentile(mutations, 99) } },
  proofs: { generated: generatedEvents.length, committed: proofStatuses.filter((proof) => proof.status === 'COMMITTED').length, uniqueFabricTxIds: new Set(fabricTxIds).size, commitLatencyMs: { p50: percentile(proofLatencies, 50), p95: percentile(proofLatencies, 95), p99: percentile(proofLatencies, 99) }, baseline: proofBaseline.counts, final: finalProofSummary.counts },
  targets: { requestSuccess: successfulRequests === expectedRequests, proofsCommittedWithin60s: proofStatuses.length === generatedEvents.length && proofStatuses.every((proof) => proof.status === 'COMMITTED'), uniqueFabricTxIds: fabricTxIds.length === generatedEvents.length && new Set(fabricTxIds).size === fabricTxIds.length, noOutstandingProofs: outstandingStates.every((state) => finalProofSummary.counts[state] === 0), readP95Below250ms: percentile(reads, 95) < 250, mutationP95Below500ms: percentile(mutations, 95) < 500, proofP95Below5s: generatedEvents.length > 0 && proofLatencies.length === generatedEvents.length && percentile(proofLatencies, 95) < 5000 },
  limitations: [
    'Controlled local benchmark; not evidence of multi-replica, wide-area, failover, crash-atomicity or production capacity.',
    ...(lifecycleConcurrency === 1 ? ['Lifecycle mutations were serialized because the current snapshot persistence is not concurrent-mutation safe.'] : [])
  ]
};

await mkdir('/tmp', { recursive: true });
await writeFile(rawPath, `${JSON.stringify({ ...result, measurements, proofStatuses }, null, 2)}\n`, { mode: 0o600 });
const proofP95 = proofLatencies.length === generatedEvents.length && generatedEvents.length > 0 ? `${result.proofs.commitLatencyMs.p95.toFixed(1)} ms` : 'not available (incomplete proof commits)';
const markdown = `# Controlled Competition Benchmark\n\nLast run: ${new Date().toISOString()}\n\n- Run ID: ${result.runId}.\n- Environment: ${result.environment.cpuCount} CPUs, ${result.environment.memoryGiB} GiB RAM, Node ${result.environment.node}.\n- Setup: 20 opaque benchmark-only ration-card and beneficiary references were provisioned directly in PostgreSQL outside timed requests.\n- Workload: 600 authenticated reads (concurrency 1, 5, 10) and 20 controlled lifecycle sequences (concurrency ${result.workload.lifecycleConcurrency}).\n- API benchmark rate limits: ${result.environment.apiReadRateLimitPerMinute} reads/minute and ${result.environment.apiMutationRateLimitPerMinute} mutations/minute; secure defaults remain 120 and 30.\n- Operational success: ${result.operational.successRatePct}%; read p95 ${result.operational.readMs.p95.toFixed(1)} ms; mutation p95 ${result.operational.mutationMs.p95.toFixed(1)} ms.\n- Proofs: ${result.proofs.committed}/${result.proofs.generated} committed; proof p95 ${proofP95}; ${result.proofs.uniqueFabricTxIds} unique Fabric transaction IDs.\n- Baseline outbox: ${Object.entries(result.proofs.baseline).map(([state, count]) => `${state}=${count}`).join(', ')}.\n- Final outbox: ${Object.entries(result.proofs.final).map(([state, count]) => `${state}=${count}`).join(', ')}.\n\n## Acceptance targets\n\n${Object.entries(result.targets).map(([target, passed]) => `- ${passed ? 'PASS' : 'MISS'} — ${target}`).join('\n')}\n\n## Limitations\n\n${result.limitations.map((item) => `- ${item}`).join('\n')}\n`;
await writeFile(summaryPath, markdown, 'utf8');
console.log(JSON.stringify({ summaryPath, rawPath, targets: result.targets }, null, 2));
if (Object.values(result.targets).some((passed) => !passed)) process.exitCode = 1;
