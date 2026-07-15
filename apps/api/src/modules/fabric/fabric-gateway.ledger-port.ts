import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';
import type { ChainQueryPort } from '../../infrastructure/chain-query-port.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from '../../infrastructure/ledger-port.js';
import type { PgPoolSnapshotAdapter } from '../../infrastructure/postgres-adapter.js';
import { PostgresPdsLedgerPort } from '../../infrastructure/postgres-ledger-port.js';
import type { FabricRuntimeConfig } from '../config/fabric.config.js';
import { FabricGatewayClient } from './fabric-gateway.client.js';

/** Default age after which a SUBMITTING claim is treated as orphaned (API crash/restart). */
export const DEFAULT_OUTBOX_STALE_SUBMITTING_MS = 60_000;

export const resolveOutboxStaleSubmittingMs = (): number => {
  const raw = process.env.PDS_OUTBOX_STALE_SUBMITTING_MS?.trim();
  if (!raw) {
    return DEFAULT_OUTBOX_STALE_SUBMITTING_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_OUTBOX_STALE_SUBMITTING_MS;
};

export class FabricGatewayLedgerPort implements PdsLedgerPort, ChainQueryPort {
  private readonly postgresPort: PostgresPdsLedgerPort | FilePdsLedgerPort;
  private readonly gatewayClient: FabricGatewayClient;
  private readonly adapter?: PgPoolSnapshotAdapter | undefined;
  private readonly staleSubmittingMs: number;

  constructor(config: FabricRuntimeConfig, adapter?: PgPoolSnapshotAdapter) {
    this.gatewayClient = new FabricGatewayClient(config);
    this.adapter = adapter;
    this.staleSubmittingMs = resolveOutboxStaleSubmittingMs();
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

  /** Stop the embedded poller (tests / graceful shutdown). */
  stopOutboxWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }

  private startOutboxWorker(): void {
    // Reclaim orphans from a prior process before the first poll tick.
    void this.reclaimStaleSubmittingClaims().catch((error: unknown) => {
      console.error('Fabric outbox worker failed to reclaim stale SUBMITTING rows:', error);
    });
    this.workerInterval = setInterval(() => {
      void this.processOutbox();
    }, 2000);
  }

  /**
   * After a crash/restart, rows can remain SUBMITTING forever because only
   * PENDING/FAILED are claimed. Age them back to PENDING without consuming a retry.
   */
  private async reclaimStaleSubmittingClaims(): Promise<number> {
    if (!this.adapter || typeof this.adapter.query !== 'function') {
      return 0;
    }
    const result = await this.adapter.query(
      `UPDATE ledger_outbox
       SET status = 'PENDING',
           submitting_at = NULL,
           next_attempt_at = NOW(),
           last_error = COALESCE(last_error, 'Reclaimed stale SUBMITTING claim after worker interruption'),
           updated_at = NOW()
       WHERE status = 'SUBMITTING'
         AND submitting_at IS NOT NULL
         AND submitting_at < NOW() - ($1 * INTERVAL '1 millisecond')
       RETURNING outbox_id`,
      [this.staleSubmittingMs]
    );
    const count = result.rowCount ?? result.rows.length;
    if (count > 0) {
      console.warn(`Fabric outbox worker reclaimed ${count} stale SUBMITTING row(s)`);
    }
    return count;
  }

  private async processOutbox(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      try {
        await this.reclaimStaleSubmittingClaims();
      } catch (reclaimError) {
        console.error('Fabric outbox worker failed to reclaim stale SUBMITTING rows:', reclaimError);
      }

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
