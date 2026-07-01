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
        : new PostgresPdsLedgerPort(adapter, new FilePdsLedgerPort(config.statePath, config.journalPath));
  }

  async loadState(): Promise<PdsLedgerState | null> {
    return this.postgresPort.loadState();
  }

  async saveState(state: PdsLedgerState): Promise<void> {
    await this.postgresPort.saveState(state);
  }

  /**
   * Dual-write (T2.3): Postgres is the primary/Queryable store of record for the
   * demo and API path; Fabric is the immutable append-only ledger. We await the
   * Fabric submit so a commit/ordering failure is surfaced to the caller rather
   * than reported as success. On partial failure (Postgres ok, Fabric fails) the
   * Postgres write has already committed — callers must treat the thrown error as
   * "Fabric not yet in sync" and reconcile via RecordLedgerProof replay. We write
   * Postgres first so the Queryable state is never ahead of what callers see on
   * success.
   */
  async appendEvents(events: LedgerEvent[]): Promise<void> {
    await this.postgresPort.appendEvents(events);
    for (const event of events) {
      await this.gatewayClient.submitLedgerEventAsync(event);
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
