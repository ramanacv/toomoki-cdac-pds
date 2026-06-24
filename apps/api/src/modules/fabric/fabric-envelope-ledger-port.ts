import { resolve } from 'node:path';
import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';
import { FilePdsLedgerPort, type PdsLedgerPort } from '../../infrastructure/ledger-port.js';
import { LocalFabricClient, toFabricTransactionEnvelope } from './fabric-client.js';

export class FabricEnvelopeLedgerPort implements PdsLedgerPort {
  private readonly filePort: FilePdsLedgerPort;
  private readonly fabricClient: LocalFabricClient;

  constructor(
    statePath = resolve(process.cwd(), '../../tmp/pds-state.json'),
    journalPath = resolve(process.cwd(), '../../tmp/pds-ledger.ndjson'),
    envelopePath = resolve(process.cwd(), '../../tmp/pds-fabric-envelope.ndjson')
  ) {
    this.filePort = new FilePdsLedgerPort(statePath, journalPath);
    this.fabricClient = new LocalFabricClient(envelopePath);
  }

  loadState(): PdsLedgerState | null {
    return this.filePort.loadState();
  }

  saveState(state: PdsLedgerState): void {
    this.filePort.saveState(state);
  }

  appendEvents(events: LedgerEvent[]): void {
    this.filePort.appendEvents(events);
    if (events.length > 0) {
      for (const event of events) {
        this.fabricClient.submit(toFabricTransactionEnvelope(event));
      }
    }
  }
}
