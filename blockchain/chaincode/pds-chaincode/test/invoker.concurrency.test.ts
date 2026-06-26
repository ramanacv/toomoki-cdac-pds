import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { PdsChaincodeInvoker } from '../src/invoker.js';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

/**
 * Spawn a child node process that performs one CreateMonthlyEntitlement submit
 * against the shared world-state file. The synchronous file lock (T1.6) must
 * serialize these read-modify-writes so no updates are lost.
 */
const spawnWriter = (statePath: string, rationCardHash: string): Promise<void> => {
  const script = `
    import { PdsChaincodeInvoker } from '${repoRoot}/blockchain/chaincode/pds-chaincode/dist/src/invoker.js';
    const invoker = new PdsChaincodeInvoker(${JSON.stringify(statePath)});
    invoker.submit('CreateMonthlyEntitlement', {
      rationCardHash: ${JSON.stringify(rationCardHash)},
      commodity: 'Rice',
      month: '2026-06',
      monthlyEntitlementKg: 25,
      alreadyLiftedKg: 0,
      availableBalanceKg: 25,
      active: true
    });
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`writer exited ${code}: ${stderr}`));
      }
    });
  });
};

describe('PdsChaincodeInvoker concurrency (T1.6)', () => {
  it('serializes concurrent writes so no entitlements are lost', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pds-invoker-conc-'));
    const statePath = join(dir, 'world-state.json');

    // Seed with a single stakeholder-free state by recording one entitlement directly
    // so the file exists; each writer then reads-modifies-writes the same file.
    const seed = new PdsChaincodeInvoker(statePath);
    seed.submit('CreateMonthlyEntitlement', {
      rationCardHash: 'seed-ration-card-hash',
      commodity: 'Rice',
      month: '2026-06',
      monthlyEntitlementKg: 25,
      alreadyLiftedKg: 0,
      availableBalanceKg: 25,
      active: true
    });

    const writerCount = 8;
    const hashes = Array.from({ length: writerCount }, (_, i) => `conc-ration-card-hash-${i}`);
    // Launch all writers concurrently.
    await Promise.all(hashes.map((hash) => spawnWriter(statePath, hash)));

    try {
      const invoker = new PdsChaincodeInvoker(statePath);
      const stock = invoker.evaluate('GetCurrentStock') as Array<[string, number]>;
      // Verify every writer's entitlement persisted by reading the state file directly.
      const raw = JSON.parse(readFileSync(statePath, 'utf8'));
      const rationCardHashes = (raw.state?.entitlements ?? []).map((e: { rationCardHash: string }) => e.rationCardHash);
      for (const hash of hashes) {
        expect(rationCardHashes).toContain(hash);
      }
      // Sanity: the seed entitlement survived too.
      expect(rationCardHashes).toContain('seed-ration-card-hash');
      expect(rationCardHashes).toHaveLength(writerCount + 1);
      expect(stock).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
