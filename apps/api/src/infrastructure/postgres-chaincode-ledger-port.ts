import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';
import type { ChaincodeEventSink } from './chain-query-port.js';
import type { ChainQueryPort } from './chain-query-port.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from './ledger-port.js';
import { PostgresPdsLedgerPort } from './postgres-ledger-port.js';
import type { PgPoolSnapshotAdapter } from './postgres-adapter.js';

export class PostgresChaincodeLedgerPort implements PdsLedgerPort, ChainQueryPort {
  private readonly postgresPort: PostgresPdsLedgerPort;
  private readonly chaincodeClient: ChaincodeEventSink;

  constructor(adapter: PgPoolSnapshotAdapter, journalPath: string, chaincodeStatePath: string, chaincodeClient: ChaincodeEventSink) {
    this.postgresPort = new PostgresPdsLedgerPort(adapter, new FilePdsLedgerPort(chaincodeStatePath, journalPath));
    this.chaincodeClient = chaincodeClient;
  }

  async loadState(): Promise<PdsLedgerState | null> {
    return this.postgresPort.loadState();
  }

  async saveState(state: PdsLedgerState): Promise<void> {
    await this.postgresPort.saveState(state);
  }

  async appendEvents(events: LedgerEvent[]): Promise<void> {
    await this.postgresPort.appendEvents(events);
    for (const event of events) {
      this.chaincodeClient.submitLedgerEvent(event);
    }
  }

  getLotHistory(lotId: string): LedgerEvent[] {
    return this.chaincodeClient.getLotHistory(lotId);
  }

  getDistributionHistory(distributionId: string): LedgerEvent[] {
    return this.chaincodeClient.getDistributionHistory(distributionId);
  }

  verifyDatabaseHash(digest: string) {
    return this.chaincodeClient.verifyDatabaseHash(digest);
  }
}
