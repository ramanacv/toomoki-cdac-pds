import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { FilePdsLedgerPort } from '../src/ledger-port.js';
import { PdsRuntime } from '../src/pds-runtime.js';

const createPort = (): FilePdsLedgerPort => {
  const tempDir = mkdtempSync(join(tmpdir(), 'pds-runtime-'));
  return new FilePdsLedgerPort(join(tempDir, 'state.json'), join(tempDir, 'journal.ndjson'));
};

const bootRuntime = async (seed: boolean, port: FilePdsLedgerPort): Promise<PdsRuntime> => {
  const runtime = new PdsRuntime(seed, port, { deferBootstrap: true });
  await runtime.bootstrapFromPersistenceAsync();
  return runtime;
};

describe('PdsRuntime', () => {
  it('persists event journal entries alongside state', async () => {
    const port = createPort();
    try {
      const runtime = await bootRuntime(true, port);
      runtime.registerStakeholder({
        stakeholderId: 'RUNTIME-001',
        stakeholderType: StakeholderType.DEPARTMENT,
        name: 'Runtime Department',
        district: 'Demo District',
        licenseNo: 'RUNTIME-LIC-001',
        status: StakeholderStatus.ACTIVE
      });
      await runtime.flushPersist();

      const journal = readFileSync(port.journalPath, 'utf8');
      expect(journal).toContain('RegisterStakeholder');
    } finally {
      rmSync(dirname(port.statePath), { recursive: true, force: true });
    }
  });

  it('reloads persisted state into a fresh runtime instance', async () => {
    const port = createPort();
    try {
      const first = await bootRuntime(true, port);
      first.registerStakeholder({
        stakeholderId: 'RUNTIME-002',
        stakeholderType: StakeholderType.AUDITOR,
        name: 'Runtime Auditor',
        district: 'Demo District',
        licenseNo: 'RUNTIME-LIC-002',
        status: StakeholderStatus.ACTIVE
      });
      await first.flushPersist();

      const second = await bootRuntime(false, port);
      expect(second.listStakeholders().some((stakeholder) => stakeholder.stakeholderId === 'RUNTIME-002')).toBe(true);
    } finally {
      rmSync(dirname(port.statePath), { recursive: true, force: true });
    }
  });
});
