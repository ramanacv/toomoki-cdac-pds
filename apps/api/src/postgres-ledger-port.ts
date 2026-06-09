import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';
import { FabricEnvelopeLedgerPort } from './fabric-envelope-ledger-port.js';
import { FilePdsLedgerPort } from './ledger-port.js';
import type { PdsLedgerPort } from './ledger-port.js';
import { PgPoolSnapshotAdapter } from './postgres-adapter.js';
import { PostgresPdsStateStore } from './postgres-state-store.js';

export class PostgresPdsLedgerPort implements PdsLedgerPort {
  private readonly stateStore: PostgresPdsStateStore;
  private readonly eventPort: PdsLedgerPort;

  constructor(adapter: PgPoolSnapshotAdapter, eventPort: PdsLedgerPort) {
    this.stateStore = new PostgresPdsStateStore(adapter);
    this.eventPort = eventPort;
  }

  loadState(): PdsLedgerState | null {
    return this.stateStore.load();
  }

  saveState(state: PdsLedgerState): void {
    this.stateStore.save(state);
  }

  appendEvents(events: LedgerEvent[]): void {
    this.eventPort.appendEvents(events);
  }
}

export const createPostgresLedgerPort = (
  adapter: PgPoolSnapshotAdapter,
  journalPath: string,
  envelopePath: string | null
): PostgresPdsLedgerPort => {
  const eventPort =
    envelopePath == null
      ? new FilePdsLedgerPort(journalPath, journalPath)
      : new FabricEnvelopeLedgerPort(journalPath, journalPath, envelopePath);

  return new PostgresPdsLedgerPort(adapter, eventPort);
};
