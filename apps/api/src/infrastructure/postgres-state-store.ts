import type { PdsLedgerState } from '@pds/pds-chaincode';
import { buildSnapshotWritePlan, hydratePdsState, type PostgresTableRows, type SqlStatement } from './postgres-snapshot.js';
import type { PdsStateStore } from './state-store.js';

export interface PostgresSnapshotAdapter {
  readSnapshotRows(): PostgresTableRows | null | Promise<PostgresTableRows | null>;
  writeStatements(statements: SqlStatement[]): void | Promise<void>;
}

export class PostgresPdsStateStore implements PdsStateStore {
  constructor(private readonly adapter: PostgresSnapshotAdapter) {}

  async load(): Promise<PdsLedgerState | null> {
    const snapshot = await this.adapter.readSnapshotRows();
    return snapshot ? hydratePdsState(snapshot) : null;
  }

  async save(state: PdsLedgerState): Promise<void> {
    await this.adapter.writeStatements(buildSnapshotWritePlan(state));
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
