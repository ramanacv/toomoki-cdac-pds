import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { PdsLedgerState } from '@pds/pds-chaincode';

export interface PdsStateStore {
  load(): Promise<PdsLedgerState | null>;
  save(state: PdsLedgerState): Promise<void>;
}

export class FilePdsStateStore implements PdsStateStore {
  readonly path: string;

  constructor(path = resolve(process.cwd(), '../../tmp/pds-state.json')) {
    this.path = path;
  }

  async load(): Promise<PdsLedgerState | null> {
    try {
      const raw = await readFile(this.path, 'utf8');
      return JSON.parse(raw) as PdsLedgerState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async save(state: PdsLedgerState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }
}
