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

describe('PdsRuntime', () => {
  it('persists event journal entries alongside state', () => {
    const port = createPort();
    try {
      const runtime = new PdsRuntime(true, port);
      runtime.registerStakeholder({
        stakeholderId: 'RUNTIME-001',
        stakeholderType: StakeholderType.DEPARTMENT,
        name: 'Runtime Department',
        district: 'Demo District',
        licenseNo: 'RUNTIME-LIC-001',
        status: StakeholderStatus.ACTIVE
      });

      const journal = readFileSync(port.journalPath, 'utf8');
      expect(journal).toContain('RegisterStakeholder');
    } finally {
      rmSync(dirname(port.statePath), { recursive: true, force: true });
    }
  });

  it('reloads persisted state into a fresh runtime instance', () => {
    const port = createPort();
    try {
      const first = new PdsRuntime(true, port);
      first.registerStakeholder({
        stakeholderId: 'RUNTIME-002',
        stakeholderType: StakeholderType.AUDITOR,
        name: 'Runtime Auditor',
        district: 'Demo District',
        licenseNo: 'RUNTIME-LIC-002',
        status: StakeholderStatus.ACTIVE
      });

      const second = new PdsRuntime(false, port);
      expect(second.listStakeholders().some((stakeholder) => stakeholder.stakeholderId === 'RUNTIME-002')).toBe(true);
    } finally {
      rmSync(dirname(port.statePath), { recursive: true, force: true });
    }
  });
});
