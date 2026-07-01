import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { LedgerEvent } from '@pds/shared-types';
import { FilePdsLedgerPort } from '../src/infrastructure/ledger-port.js';

const emptyState = () => ({
  stakeholders: [],
  lots: [],
  transfers: [],
  allocations: [],
  entitlements: [],
  authTransactions: [],
  distributions: [],
  alerts: [],
  events: [],
  stock: []
});

const sampleEvent = (): LedgerEvent => ({
  ledgerTxId: 'TX-FILE-1',
  entityType: 'lot',
  entityId: 'LOT-FILE-1',
  eventType: 'CreateCommodityLot',
  payload: { lotId: 'LOT-FILE-1' },
  timestamp: '2026-06-25T10:00:00.000Z'
});

describe('FilePdsLedgerPort (T2.1 / T2.2)', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('keeps statePath and journalPath distinct and writes both files', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-file-port-'));
    const statePath = join(dir, 'state.json');
    const journalPath = join(dir, 'journal.ndjson');
    expect(statePath).not.toBe(journalPath);

    const port = new FilePdsLedgerPort(statePath, journalPath);
    expect(port.statePath).toBe(statePath);
    expect(port.journalPath).toBe(journalPath);
    expect(port.statePath).not.toBe(port.journalPath);

    await port.saveState(emptyState() as never);
    await port.appendEvents([sampleEvent()]);

    expect(existsSync(port.statePath)).toBe(true);
    expect(existsSync(port.journalPath)).toBe(true);

    // The state file must not contain the journal event line, and the journal
    // must not contain the full-state JSON — proving the two paths don't collide.
    const stateRaw = readFileSync(port.statePath, 'utf8');
    const journalRaw = readFileSync(port.journalPath, 'utf8');
    expect(stateRaw).toContain('"stakeholders"');
    expect(stateRaw).not.toContain('"TX-FILE-1"');
    expect(journalRaw).toContain('TX-FILE-1');
    expect(journalRaw).not.toContain('"stakeholders"');
  });

  it('round-trips state through loadState after a save', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-file-port-'));
    const port = new FilePdsLedgerPort(join(dir, 'state.json'), join(dir, 'journal.ndjson'));

    await expect(port.loadState()).resolves.toBeNull();

    const state = emptyState();
    state.lots = [
      {
        lotId: 'LOT-RT',
        commodity: 'Rice',
        season: 'Kharif',
        quantityKg: 10,
        qualityGrade: 'A',
        source: 's',
        currentOwner: 'PROC-001',
        currentLocation: 'yard',
        status: 'CREATED'
      } as never
    ];
    await port.saveState(state as never);
    const loaded = await port.loadState();
    expect(loaded?.lots).toHaveLength(1);
    expect(loaded?.lots[0]?.lotId).toBe('LOT-RT');
  });

  it('loadState/saveState/appendEvents are async (return Promises) (T2.2)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-file-port-'));
    const port = new FilePdsLedgerPort(join(dir, 'state.json'), join(dir, 'journal.ndjson'));
    expect(port.loadState()).toBeInstanceOf(Promise);
    expect(port.saveState(emptyState() as never)).toBeInstanceOf(Promise);
    expect(port.appendEvents([sampleEvent()])).toBeInstanceOf(Promise);
    await port.saveState(emptyState() as never);
    await port.appendEvents([sampleEvent()]);
  });

  it('appendEvents is a no-op for an empty event list (no journal file created)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-file-port-'));
    const journalPath = join(dir, 'journal.ndjson');
    const port = new FilePdsLedgerPort(join(dir, 'state.json'), journalPath);
    await port.appendEvents([]);
    expect(existsSync(journalPath)).toBe(false);
  });
});
