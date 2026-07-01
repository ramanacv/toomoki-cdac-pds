import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';
import { FilePdsLedgerPort } from './ledger-port.js';
import type { PdsLedgerPort } from './ledger-port.js';
import type { PgPoolSnapshotAdapter } from './postgres-adapter.js';
import { PostgresPdsStateStore, type PostgresSnapshotAdapter } from './postgres-state-store.js';

export class PostgresPdsLedgerPort implements PdsLedgerPort {
  private readonly stateStore: PostgresPdsStateStore;
  private readonly eventPort: PdsLedgerPort;

  constructor(adapter: PostgresSnapshotAdapter, eventPort: PdsLedgerPort) {
    this.stateStore = new PostgresPdsStateStore(adapter);
    this.eventPort = eventPort;
  }

  async loadState(): Promise<PdsLedgerState | null> {
    return this.stateStore.load();
  }

  async saveState(state: PdsLedgerState): Promise<void> {
    await this.stateStore.save(state);
  }

  async appendEvents(events: LedgerEvent[]): Promise<void> {
    await this.eventPort.appendEvents(events);
  }
}

/**
 * Composes a {@link PostgresPdsLedgerPort} with a file-backed event port.
 * Fabric-envelope wiring is intentionally NOT done here to keep
 * `infrastructure` free of any `modules/fabric` dependency (T5.1); the
 * composition root (`modules/ledger/ledger-port-factory.ts`) injects a
 * fabric event port directly when needed.
 */
export const createPostgresLedgerPort = (
  adapter: PgPoolSnapshotAdapter,
  journalPath: string,
  statePath: string
): PostgresPdsLedgerPort => {
  const eventPort = new FilePdsLedgerPort(statePath, journalPath);
  return new PostgresPdsLedgerPort(adapter, eventPort);
};
