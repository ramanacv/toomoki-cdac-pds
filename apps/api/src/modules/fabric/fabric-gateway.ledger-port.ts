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
  private readonly adapter?: PgPoolSnapshotAdapter | undefined;

  constructor(config: FabricRuntimeConfig, adapter?: PgPoolSnapshotAdapter) {
    this.gatewayClient = new FabricGatewayClient(config);
    this.adapter = adapter;
    this.postgresPort =
      adapter == null
        ? new FilePdsLedgerPort(config.statePath, config.journalPath)
        : new PostgresPdsLedgerPort(adapter, new FilePdsLedgerPort(config.statePath, config.journalPath));
    if (this.adapter && typeof this.adapter.query === 'function') {
      this.startOutboxWorker();
    }
  }

  getPool() {
    if (this.adapter) {
      return this.adapter.pool;
    }
    return null;
  }

  async loadState(): Promise<PdsLedgerState | null> {
    return this.postgresPort.loadState();
  }

  async saveState(state: PdsLedgerState): Promise<void> {
    await this.postgresPort.saveState(state);
  }

  /**
   * Dual-write outbox implementation (T2.3): Postgres is the primary store.
   * Instead of submitting synchronously to Fabric (which risks consistency drift
   * if Fabric timeouts), we write the event payload to `ledger_outbox` in Postgres.
   * A background worker polls the outbox and submits events asynchronously.
   * If running without a Postgres adapter (file fallback mode), we submit directly.
   */
  async appendEvents(events: LedgerEvent[]): Promise<void> {
    await this.postgresPort.appendEvents(events);
    if (this.adapter && typeof this.adapter.query === 'function') {
      for (const event of events) {
        await this.adapter.query(
          "INSERT INTO ledger_outbox (event_id, operation_id, idempotency_key, schema_version, event_payload, status) VALUES ($1, $1, $1, 1, $2::jsonb, 'PENDING') ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING",
          [event.ledgerTxId, JSON.stringify(event)]
        );
      }
    } else {
      for (const event of events) {
        await this.gatewayClient.submitLedgerEventAsync(event);
      }
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

  private startOutboxWorker(): void {
    this.workerInterval = setInterval(() => {
      void this.processOutbox();
    }, 2000);
  }

  private async processOutbox(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pendingResult = await this.adapter!.query!(
        `WITH ready AS (
           SELECT outbox_id FROM ledger_outbox
           WHERE status IN ('PENDING', 'FAILED') AND next_attempt_at <= NOW() AND retry_count < 5
           ORDER BY next_attempt_at, outbox_id FOR UPDATE SKIP LOCKED LIMIT 10
         )
         UPDATE ledger_outbox o SET status = 'SUBMITTING', submitting_at = NOW(), updated_at = NOW()
         FROM ready WHERE o.outbox_id = ready.outbox_id
         RETURNING o.outbox_id, o.event_payload`
      );

      for (const row of pendingResult.rows) {
        const outboxId = row.outbox_id;
        const event = row.event_payload as LedgerEvent;

        try {
          const submission = await this.gatewayClient.submitLedgerEventAsync(event);
          await this.adapter!.query!(
            "UPDATE ledger_outbox SET status = 'COMMITTED', fabric_tx_id = $1, committed_at = NOW(), updated_at = NOW() WHERE outbox_id = $2",
            [submission.txId, outboxId]
          );
        } catch (error: unknown) {
          console.error(`Fabric outbox worker failed to process event ${event.ledgerTxId}:`, error);
          await this.adapter!.query!(
            `UPDATE ledger_outbox SET
               status = CASE WHEN retry_count + 1 >= 5 THEN 'DEAD_LETTER' ELSE 'FAILED' END,
               retry_count = retry_count + 1, last_error = $1,
               next_attempt_at = NOW() + (INTERVAL '1 second' * LEAST(300, POWER(2, retry_count))),
               dead_lettered_at = CASE WHEN retry_count + 1 >= 5 THEN NOW() ELSE NULL END,
               updated_at = NOW() WHERE outbox_id = $2`,
            [error instanceof Error ? error.message : String(error), outboxId]
          );
        }
      }
    } catch (dbError) {
      console.error('Fabric outbox worker database query failed:', dbError);
    } finally {
      this.isProcessing = false;
    }
  }

  private workerInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
}
