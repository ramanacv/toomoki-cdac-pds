import { resolve } from 'node:path';
import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';
import type { ChainQueryPort } from './chain-query-port.js';
import { FabricChaincodeClient } from './fabric-chaincode-client.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from './ledger-port.js';

export class FabricChaincodeLedgerPort implements PdsLedgerPort, ChainQueryPort {
  private readonly filePort: FilePdsLedgerPort;
  private readonly chaincodeClient: FabricChaincodeClient;

  constructor(
    statePath = resolve(process.cwd(), '../../tmp/pds-state.json'),
    journalPath = resolve(process.cwd(), '../../tmp/pds-ledger.ndjson'),
    chaincodeStatePath = resolve(process.cwd(), '../../tmp/chaincode-world-state.json')
  ) {
    this.filePort = new FilePdsLedgerPort(statePath, journalPath);
    this.chaincodeClient = new FabricChaincodeClient(chaincodeStatePath);
  }

  loadState(): PdsLedgerState | null {
    return this.filePort.loadState();
  }

  saveState(state: PdsLedgerState): void {
    this.filePort.saveState(state);
  }

  appendEvents(events: LedgerEvent[]): void {
    this.filePort.appendEvents(events);
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
