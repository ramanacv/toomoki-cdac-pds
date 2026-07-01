import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { LedgerEvent } from '@pds/shared-types';
import type { PdsLedgerState } from '@pds/pds-chaincode';

export interface PdsLedgerPort {
  loadState(): Promise<PdsLedgerState | null>;
  saveState(state: PdsLedgerState): Promise<void>;
  appendEvents(events: LedgerEvent[]): Promise<void>;
}

/**
 * Legacy alias retained while call sites migrate; equivalent to {@link PdsLedgerPort}.
 * @deprecated use {@link PdsLedgerPort} directly.
 */
export type AsyncPdsLedgerPort = PdsLedgerPort;

export const hasAsyncLedgerLoad = (_port: PdsLedgerPort): _port is PdsLedgerPort => true;

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

  async loadState(): Promise<PdsLedgerState | null> {
    try {
      const raw = await readFile(this.statePath, 'utf8');
      return JSON.parse(raw) as PdsLedgerState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveState(state: PdsLedgerState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  async appendEvents(events: LedgerEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await mkdir(dirname(this.journalPath), { recursive: true });
    await appendFile(this.journalPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
  }
}
