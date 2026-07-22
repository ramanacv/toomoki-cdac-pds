/* eslint-disable @typescript-eslint/no-explicit-any */
import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { LedgerEvent } from '@pds/shared-types';
import { StakeholderStatus, StakeholderType } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';
import { FilePdsLedgerPort } from '../src/ledger-port.js';
import type { PdsLedgerPort } from '../src/ledger-port.js';
import { PdsRuntime } from '../src/pds-runtime.js';

const createPort = (): FilePdsLedgerPort => {
  const tempDir = mkdtempSync(join(tmpdir(), 'pds-runtime-'));
  return new FilePdsLedgerPort(join(tempDir, 'state.json'), join(tempDir, 'journal.ndjson'));
};

const bootRuntime = async (seed: boolean, port: PdsLedgerPort): Promise<PdsRuntime> => {
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
        stakeholderType: StakeholderType.DISTRICT_SUPPLY_OFFICE,
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
      expect(second.listStakeholders().some((stakeholder: any) => stakeholder.stakeholderId === 'RUNTIME-002')).toBe(true);
    } finally {
      rmSync(dirname(port.statePath), { recursive: true, force: true });
    }
  });

  it('persists reset as one ordered reset-plus-lots event batch', async () => {
    class CapturingPort implements PdsLedgerPort {
      state: PdsLedgerState | null = null;
      appended: LedgerEvent[][] = [];

      async loadState() {
        return this.state;
      }

      async saveState(state: PdsLedgerState) {
        this.state = state;
      }

      async appendEvents(events: LedgerEvent[]) {
        this.appended.push(events);
      }
    }

    const port = new CapturingPort();
    const runtime = await bootRuntime(true, port);
    port.appended = [];

    const result = await runtime.resetTransactionalDataPersisted();

    expect(result.lots.length).toBeGreaterThan(0);
    expect(port.appended).toHaveLength(1);
    const eventTypes = port.appended[0]?.map((event) => event.eventType) ?? [];
    const resetIndex = eventTypes.indexOf('ResetTransactionalData');
    expect(eventTypes[0]).toBe('RegisterStakeholder');
    expect(resetIndex).toBeGreaterThan(0);
    expect(eventTypes.slice(resetIndex)).toEqual([
      'ResetTransactionalData',
      ...result.lots.map(() => 'CreateCommodityLot')
    ]);
    expect(port.appended[0]?.slice(resetIndex + 1).map((event) => event.entityId)).toEqual(
      result.lots.map((lot: any) => lot.lotId)
    );
  });

  it('surfaces async persistence failures from persisted mutators', async () => {
    class FailingPort implements PdsLedgerPort {
      state: PdsLedgerState | null = null;
      fail = false;

      async loadState() {
        return this.state;
      }

      async saveState(state: PdsLedgerState) {
        this.state = state;
      }

      async appendEvents() {
        if (this.fail) {
          throw new Error('fabric endorsement failed');
        }
      }
    }

    const port = new FailingPort();
    const runtime = await bootRuntime(true, port);
    port.fail = true;

    await expect(
      runtime.createCommodityLotPersisted({
        lotId: 'LOT-RUNTIME-FAIL-001',
        commodity: 'Rice',
        season: 'Test',
        quantityKg: 1,
        qualityGrade: 'A',
        source: 'Test',
        currentOwner: 'PROC-001',
        currentLocation: 'Procurement Yard'
      })
    ).rejects.toThrow(/fabric endorsement failed/);
  });
});
