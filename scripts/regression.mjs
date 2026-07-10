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
 *   PDS_DEV_AUTH_TOKEN=dev-mvp-token npm run regression:fabric
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
    const response = await fetch(`${apiBase}/health`);
    if (!response.ok) {
      throw new Error(`health returned ${response.status}`);
    }
    const health = await response.json();
    if (health.ledgerMode !== 'fabric') {
      throw new Error(`ledgerMode=${health.ledgerMode ?? 'unknown'} (expected fabric)`);
    }
    return health;
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
    const token = process.env.PDS_DEV_AUTH_TOKEN ?? process.env.SMOKE_AUTH_TOKEN ?? '';
    if (!token) {
      throw new Error('Fabric regression requires PDS_DEV_AUTH_TOKEN or SMOKE_AUTH_TOKEN');
    }
    await probeFabricStack();
    step('smoke-fabric', () =>
      run('Fabric gateway smoke', 'npm', ['run', 'smoke:fabric'], { PDS_DEV_AUTH_TOKEN: token })
    );
    step('fabric-e2e', () =>
      run('Fabric API e2e (opt-in)', 'npm', ['test', '--workspace=apps/api', '--', 'test/e2e/fabric-api.e2e.spec.ts'], {
        PDS_E2E_FABRIC: 'true',
        PDS_DEV_AUTH_TOKEN: token
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
