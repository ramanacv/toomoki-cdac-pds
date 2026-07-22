import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('controlled benchmark safety gates', () => {
  it('refuses to run without the explicit benchmark flag before making network requests', () => {
    const result = spawnSync(process.execPath, ['scripts/benchmark-competition.mjs'], {
      cwd: resolve(process.cwd(), '../..'),
      env: { ...process.env, PDS_BENCHMARK_ENABLED: 'false' },
      encoding: 'utf8'
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PDS_BENCHMARK_ENABLED=true');
  });
});
