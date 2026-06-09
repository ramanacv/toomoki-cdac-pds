import type { PdsLedgerState } from '@pds/pds-chaincode';
import { buildSnapshotWritePlan, hydratePdsState, type PostgresTableRows, type SqlStatement } from './postgres-snapshot.js';
import type { PdsStateStore } from './state-store.js';

export interface PostgresSnapshotAdapter {
  readSnapshotRows(): PostgresTableRows | null;
  execute(statement: SqlStatement): void;
}

export class PostgresPdsStateStore implements PdsStateStore {
  constructor(private readonly adapter: PostgresSnapshotAdapter) {}

  load(): PdsLedgerState | null {
    const rows = this.adapter.readSnapshotRows();
    return rows ? hydratePdsState(rows) : null;
  }

  save(state: PdsLedgerState): void {
    for (const statement of buildSnapshotWritePlan(state)) {
      this.adapter.execute(statement);
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

  execute(statement: SqlStatement): void {
    this.executed.push(statement);
  }

  seed(rows: PostgresTableRows): void {
    this.rows = rows;
  }
}
