#!/usr/bin/env node
/**
 * POC → MVP regression gates (demo mode by default).
 *
 * Usage:
 *   npm run regression
 *   npm run regression:fabric   # also runs fabric smoke + opt-in API e2e
 *
 * Fabric profile requires a live stack:
 *   docker compose --profile fabric up -d
 *   PDS_BENCHMARK_CLIENT_SECRET=... npm run regression:fabric
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fabric = process.argv.includes('--fabric') || process.env.PDS_E2E_FABRIC === 'true';

const run = (label, command, args, env = {}) => {
  process.stdout.write(`\n▶ ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? 'unknown'})`);
  }
};

const probeFabricStack = async () => {
  const apiBase = process.env.API_BASE ?? 'http://127.0.0.1:3000';
  try {
    const healthResponse = await fetch(`${apiBase}/health`);
    if (!healthResponse.ok) {
      throw new Error(`health returned ${healthResponse.status}`);
    }
    const health = await healthResponse.json();
    if (!health.ok) {
      throw new Error('health.ok is not true');
    }

    // /health is intentionally minimal; ledger mode lives on /admin/network.
    const { getServiceAccessToken } = await import('./iam/service-token.mjs');
    const token = await getServiceAccessToken();
    const networkResponse = await fetch(`${apiBase}/admin/network`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!networkResponse.ok) {
      throw new Error(`/admin/network returned ${networkResponse.status}`);
    }
    const network = await networkResponse.json();
    if (network.ledgerMode !== 'fabric') {
      throw new Error(`ledgerMode=${network.ledgerMode ?? 'unknown'} (expected fabric)`);
    }
    return { health, network };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Fabric stack not ready at ${apiBase} (${detail}). Start with: docker compose --profile fabric up -d`
    );
  }
};

const main = async () => {
  const started = Date.now();
  const passed = [];

  const step = (id, fn) => {
    fn();
    passed.push(id);
  };

  console.log('ViksitPDS regression gates');
  console.log(fabric ? 'Mode: demo + fabric (live stack)' : 'Mode: demo (default)');

  step('build', () => run('Build workspaces', 'npm', ['run', 'build']));
  step('test-all', () => run('All workspace tests', 'npm', ['test']));
  step('test-web', () => run('Web workflow + panel tests', 'npm', ['run', 'test', '--workspace=apps/web']));
  step('smoke', () => run('In-process demo smoke (happy + exception)', 'node', ['scripts/smoke.mjs']));
  step('demo-happy', () => run('Happy-path demo script', 'node', ['scripts/demo/happy-path.mjs']));
  step('demo-exception', () => run('Exception-path demo script', 'node', ['scripts/demo/exception-path.mjs']));

  if (fabric) {
    if (!process.env.PDS_BENCHMARK_CLIENT_SECRET && !process.env.PDS_E2E_ACCESS_TOKEN) {
      throw new Error('Fabric regression requires PDS_BENCHMARK_CLIENT_SECRET or a short-lived PDS_E2E_ACCESS_TOKEN');
    }
    await probeFabricStack();
    step('smoke-fabric', () =>
      run('Fabric gateway smoke', 'npm', ['run', 'smoke:fabric'])
    );
    step('fabric-e2e', () =>
      run('Fabric API e2e (opt-in)', 'npm', ['run', 'test:fabric', '--workspace=@pds/api'], {
        PDS_E2E_FABRIC: 'true'
      })
    );
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n✓ Regression gates passed (${passed.length} automated checks, ${seconds}s)`);
  console.log('\nManual gate (not automated):');
  console.log('  • Web workbench in demo mode: VITE_DATA_SOURCE=api, default ledger, full role replay');
  if (!fabric) {
    console.log('\nOptional fabric profile: npm run regression:fabric (live stack required)');
  }
};

main().catch((error) => {
  console.error(`\n✗ Regression failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
