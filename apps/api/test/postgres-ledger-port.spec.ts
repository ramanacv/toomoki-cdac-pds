import { LedgerEvent } from '@pds/shared-types';
import { describe, expect, it } from 'vitest';
import { PostgresPdsLedgerPort } from '../src/infrastructure/postgres-ledger-port.js';
import { InMemoryPostgresSnapshotAdapter } from '../src/infrastructure/postgres-state-store.js';
import type { PdsLedgerPort } from '../src/infrastructure/ledger-port.js';

class RecordingEventPort implements PdsLedgerPort {
  readonly appended: LedgerEvent[] = [];
  async loadState() {
    return null;
  }
  async saveState() {}
  async appendEvents(events: LedgerEvent[]): Promise<void> {
    this.appended.push(...events);
  }
}

const emptyState = (): unknown => ({
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

describe('PostgresPdsLedgerPort (T6.2)', () => {
  it('delegates appendEvents to the injected event port', async () => {
    const adapter = new InMemoryPostgresSnapshotAdapter();
    const eventPort = new RecordingEventPort();
    const port = new PostgresPdsLedgerPort(adapter, eventPort);

    const events: LedgerEvent[] = [
      {
        ledgerTxId: 'TX-1',
        entityType: 'lot',
        entityId: 'LOT-001',
        eventType: 'CommodityLotCreated',
        payload: { lotId: 'LOT-001' },
        timestamp: '2026-06-25T10:00:00.000Z'
      }
    ];
    await port.appendEvents(events);
    expect(eventPort.appended).toEqual(events);
  });

  it('returns null when the snapshot is empty', async () => {
    const adapter = new InMemoryPostgresSnapshotAdapter(null);
    const port = new PostgresPdsLedgerPort(adapter, new RecordingEventPort());
    await expect(port.loadState()).resolves.toBeNull();
  });

  it('writes a snapshot write plan on saveState', async () => {
    const adapter = new InMemoryPostgresSnapshotAdapter();
    const port = new PostgresPdsLedgerPort(adapter, new RecordingEventPort());
    await port.saveState(emptyState() as never);
    expect(adapter.executed.length).toBeGreaterThan(0);
  });

  it('is fully async (loadState/saveState/appendEvents return promises)', async () => {
    const port = new PostgresPdsLedgerPort(new InMemoryPostgresSnapshotAdapter(), new RecordingEventPort());
    expect(port.loadState()).toBeInstanceOf(Promise);
    expect(await port.loadState()).toBeNull();
    const savePromise = port.saveState(emptyState() as never);
    expect(savePromise).toBeInstanceOf(Promise);
    await savePromise;
    const appendPromise = port.appendEvents([]);
    expect(appendPromise).toBeInstanceOf(Promise);
    await appendPromise;
  });
});
