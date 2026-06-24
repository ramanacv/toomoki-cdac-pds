import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';

export interface PdsLedgerPort {
  loadState(): PdsLedgerState | null;
  saveState(state: PdsLedgerState): void;
  appendEvents(events: LedgerEvent[]): void;
}

export interface AsyncPdsLedgerPort extends PdsLedgerPort {
  loadStateAsync(): Promise<PdsLedgerState | null>;
}

export const hasAsyncLedgerLoad = (port: PdsLedgerPort): port is AsyncPdsLedgerPort =>
  typeof (port as AsyncPdsLedgerPort).loadStateAsync === 'function';

export class FilePdsLedgerPort implements PdsLedgerPort {
  readonly statePath: string;
  readonly journalPath: string;

  constructor(
    statePath = resolve(process.cwd(), '../../tmp/pds-state.json'),
    journalPath = resolve(process.cwd(), '../../tmp/pds-ledger.ndjson')
  ) {
    this.statePath = statePath;
    this.journalPath = journalPath;
  }

  loadState(): PdsLedgerState | null {
    try {
      const raw = readFileSync(this.statePath, 'utf8');
      return JSON.parse(raw) as PdsLedgerState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  saveState(state: PdsLedgerState): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  appendEvents(events: LedgerEvent[]): void {
    if (events.length === 0) {
      return;
    }
    mkdirSync(dirname(this.journalPath), { recursive: true });
    appendFileSync(this.journalPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
  }
}
