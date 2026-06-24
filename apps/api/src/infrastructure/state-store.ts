import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { PdsLedgerState } from '@pds/pds-chaincode';

export interface PdsStateStore {
  load(): PdsLedgerState | null;
  save(state: PdsLedgerState): void;
}

export class FilePdsStateStore implements PdsStateStore {
  readonly path: string;

  constructor(path = resolve(process.cwd(), '../../tmp/pds-state.json')) {
    this.path = path;
  }

  load(): PdsLedgerState | null {
    try {
      const raw = readFileSync(this.path, 'utf8');
      return JSON.parse(raw) as PdsLedgerState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  save(state: PdsLedgerState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }
}
