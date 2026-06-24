import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';
import type { ChainQueryPort } from './chain-query-port.js';
import { FabricChaincodeClient } from '../modules/fabric/fabric-chaincode-client.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from './ledger-port.js';
import { PostgresPdsLedgerPort } from './postgres-ledger-port.js';
import type { PgPoolSnapshotAdapter } from './postgres-adapter.js';

export class PostgresChaincodeLedgerPort implements PdsLedgerPort, ChainQueryPort {
  private readonly postgresPort: PostgresPdsLedgerPort;
  private readonly chaincodeClient: FabricChaincodeClient;

  constructor(adapter: PgPoolSnapshotAdapter, journalPath: string, chaincodeStatePath: string) {
    this.postgresPort = new PostgresPdsLedgerPort(adapter, new FilePdsLedgerPort(journalPath, journalPath));
    this.chaincodeClient = new FabricChaincodeClient(chaincodeStatePath);
  }

  loadState(): PdsLedgerState | null {
    return this.postgresPort.loadState();
  }

  loadStateAsync(): Promise<PdsLedgerState | null> {
    return this.postgresPort.loadStateAsync();
  }

  saveState(state: PdsLedgerState): void {
    this.postgresPort.saveState(state);
  }

  appendEvents(events: LedgerEvent[]): void {
    this.postgresPort.appendEvents(events);
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
