import type { PdsLedgerState } from '@pds/pds-chaincode';
import { buildSnapshotWritePlan, hydratePdsState, type PostgresTableRows, type SqlStatement } from './postgres-snapshot.js';
import { runSync } from './sync-await.js';
import type { PdsStateStore } from './state-store.js';

export interface PostgresSnapshotAdapter {
  readSnapshotRows(): PostgresTableRows | null | Promise<PostgresTableRows | null>;
  writeStatements(statements: SqlStatement[]): void | Promise<void>;
}

export class PostgresPdsStateStore implements PdsStateStore {
  constructor(private readonly adapter: PostgresSnapshotAdapter) {}

  load(): PdsLedgerState | null {
    const rows = this.adapter.readSnapshotRows();
    const snapshot = rows instanceof Promise ? runSync(rows) : rows;
    return snapshot ? hydratePdsState(snapshot) : null;
  }

  save(state: PdsLedgerState): void {
    const writeResult = this.adapter.writeStatements(buildSnapshotWritePlan(state));
    if (writeResult instanceof Promise) {
      runSync(writeResult);
    }
  }
}

export class InMemoryPostgresSnapshotAdapter implements PostgresSnapshotAdapter {
  private rows: PostgresTableRows | null;
  readonly executed: SqlStatement[] = [];

  constructor(rows: PostgresTableRows | null = null) {
    this.rows = rows;
  }

  readSnapshotRows(): PostgresTableRows | null {
    return this.rows;
  }

  writeStatements(statements: SqlStatement[]): void {
    this.executed.push(...statements);
  }

  seed(rows: PostgresTableRows): void {
    this.rows = rows;
  }
}
