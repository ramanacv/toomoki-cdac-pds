import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';
import type { ChainQueryPort } from '../../infrastructure/chain-query-port.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from '../../infrastructure/ledger-port.js';
import type { PgPoolSnapshotAdapter } from '../../infrastructure/postgres-adapter.js';
import { PostgresPdsLedgerPort } from '../../infrastructure/postgres-ledger-port.js';
import type { FabricRuntimeConfig } from '../config/fabric.config.js';
import { FabricGatewayClient } from './fabric-gateway.client.js';

export class FabricGatewayLedgerPort implements PdsLedgerPort, ChainQueryPort {
  private readonly postgresPort: PostgresPdsLedgerPort | FilePdsLedgerPort;
  private readonly gatewayClient: FabricGatewayClient;

  constructor(config: FabricRuntimeConfig, adapter?: PgPoolSnapshotAdapter) {
    this.gatewayClient = new FabricGatewayClient(config);
    this.postgresPort =
      adapter == null
        ? new FilePdsLedgerPort(config.statePath, config.journalPath)
        : new PostgresPdsLedgerPort(adapter, new FilePdsLedgerPort(config.journalPath, config.journalPath));
  }

  loadState(): PdsLedgerState | null {
    return this.postgresPort.loadState();
  }

  loadStateAsync(): Promise<PdsLedgerState | null> {
    if ('loadStateAsync' in this.postgresPort) {
      return this.postgresPort.loadStateAsync();
    }
    return Promise.resolve(this.postgresPort.loadState());
  }

  saveState(state: PdsLedgerState): void {
    this.postgresPort.saveState(state);
  }

  appendEvents(events: LedgerEvent[]): void {
    this.postgresPort.appendEvents(events);
    for (const event of events) {
      this.gatewayClient.submitLedgerEvent(event);
    }
  }

  getLotHistory(lotId: string): LedgerEvent[] {
    return this.gatewayClient.getLotHistory(lotId);
  }

  getDistributionHistory(distributionId: string): LedgerEvent[] {
    return this.gatewayClient.getDistributionHistory(distributionId);
  }

  verifyDatabaseHash(digest: string) {
    return this.gatewayClient.verifyDatabaseHash(digest);
  }
}
