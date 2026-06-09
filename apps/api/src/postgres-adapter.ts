import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import {
  hydratePdsState,
  mapAlertRow,
  mapAllocationRow,
  mapAuthTransactionRow,
  mapDistributionRow,
  mapEntitlementRow,
  mapEventRow,
  mapLotRow,
  mapStakeholderRow,
  mapTransferRow,
  type PostgresTableRows,
  type SqlStatement
} from './postgres-snapshot.js';
import type { PostgresSnapshotAdapter } from './postgres-state-store.js';

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
};

const mapRows = <T>(rows: QueryResultRow[], mapper: (row: QueryResultRow) => T): T[] => rows.map(mapper);

export class PgPoolSnapshotAdapter implements PostgresSnapshotAdapter {
  constructor(private readonly pool: Pool) {}

  readSnapshotRows(): Promise<PostgresTableRows | null> {
    return readSnapshotRowsFromClient(this.pool);
  }

  async writeStatements(statements: SqlStatement[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      for (const statement of statements) {
        await executeStatement(client, statement);
      }
    } finally {
      client.release();
    }
  }
}

export const createPgPool = (connectionString: string): Pool =>
  new Pool({
    connectionString,
    max: 5
  });

export const readSnapshotRowsFromClient = async (client: Pool | PoolClient): Promise<PostgresTableRows | null> => {
  const stakeholders = await client.query('SELECT * FROM stakeholders ORDER BY stakeholder_id');
  if (stakeholders.rows.length === 0) {
    return null;
  }

  const [lots, transfers, allocations, entitlements, authTransactions, distributions, alerts, events, stockPositions] =
    await Promise.all([
      client.query('SELECT * FROM commodity_lots ORDER BY lot_id'),
      client.query('SELECT * FROM transfer_orders ORDER BY dispatch_timestamp'),
      client.query('SELECT * FROM fps_allocations ORDER BY created_at'),
      client.query('SELECT * FROM monthly_entitlements ORDER BY ration_card_hash, commodity, month'),
      client.query('SELECT * FROM auth_transactions ORDER BY timestamp'),
      client.query('SELECT * FROM distribution_transactions ORDER BY timestamp'),
      client.query('SELECT * FROM audit_alerts ORDER BY created_at'),
      client.query('SELECT * FROM ledger_events ORDER BY timestamp'),
      client.query('SELECT stakeholder_id, commodity, quantity_kg FROM stock_positions ORDER BY stakeholder_id, commodity')
    ]);

  return hydratePdsState({
    stakeholders: mapRows(stakeholders.rows, mapStakeholderRow),
    lots: mapRows(lots.rows, mapLotRow),
    transfers: mapRows(transfers.rows, (row) => mapTransferRow(row, toIsoString)),
    allocations: mapRows(allocations.rows, mapAllocationRow),
    entitlements: mapRows(entitlements.rows, mapEntitlementRow),
    authTransactions: mapRows(authTransactions.rows, (row) => mapAuthTransactionRow(row, toIsoString)),
    distributions: mapRows(distributions.rows, (row) => mapDistributionRow(row, toIsoString)),
    alerts: mapRows(alerts.rows, (row) => mapAlertRow(row, toIsoString)),
    events: mapRows(events.rows, (row) => mapEventRow(row, toIsoString)),
    stock: stockPositions.rows.map((row) => [`${row.stakeholder_id}:${row.commodity}`, Number(row.quantity_kg)] as const)
  });
};

const executeStatement = async (client: PoolClient, statement: SqlStatement): Promise<void> => {
  if (statement.text === 'BEGIN' || statement.text === 'COMMIT') {
    await client.query(statement.text);
    return;
  }

  await client.query(statement.text, statement.values);
};
