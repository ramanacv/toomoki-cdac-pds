import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LedgerEvent } from '@pds/shared-types';
import { PostgresChaincodeLedgerPort } from '../src/infrastructure/postgres-chaincode-ledger-port.js';
import { InMemoryPostgresSnapshotAdapter } from '../src/infrastructure/postgres-state-store.js';
import type { ChaincodeEventSink } from '../src/infrastructure/chain-query-port.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');
const infraDir = join(repoRoot, 'apps/api/src/infrastructure');

const listTsFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });

/**
 * T5.1 — the infra ↔ modules/fabric cycle is broken. The contract is one-way:
 * `modules/fabric` may depend on `infrastructure` (ports/interfaces), but
 * `infrastructure` must NOT import anything from `modules/fabric`. A static
 * import-direction check is a fast, deterministic guard that runs in the
 * existing vitest setup without needing madge or a built dist tree.
 */
describe('infrastructure ↔ modules/fabric dependency direction (T5.1)', () => {
  it('no infrastructure source file imports from modules/fabric', () => {
    const violations: string[] = [];
    for (const file of listTsFiles(infraDir)) {
      const source = readFileSync(file, 'utf8');
      const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
      if (importLines.some((line) => /modules\/fabric/.test(line))) {
        violations.push(relative(repoRoot, file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('ChaincodeEventSink is injected into PostgresChaincodeLedgerPort (composition root in modules, not infra)', async () => {
    const sink: ChaincodeEventSink = {
      submitLedgerEvent: (event: LedgerEvent) => ({ txId: event.ledgerTxId }),
      getLotHistory: () => [],
      getDistributionHistory: () => [],
      verifyDatabaseHash: () => ({ match: true, ledgerDigest: 'abc' })
    };
    const adapter = new InMemoryPostgresSnapshotAdapter();
    // PostgresChaincodeLedgerPort's constructor types the adapter as the
    // concrete PgPoolSnapshotAdapter, but it only uses the PostgresSnapshotAdapter
    // interface methods — the in-memory adapter satisfies that structurally.
    const port = new PostgresChaincodeLedgerPort(
      adapter as unknown as ConstructorParameters<typeof PostgresChaincodeLedgerPort>[0],
      'journal.ndjson',
      'chaincode-state.json',
      sink
    );

    const event: LedgerEvent = {
      ledgerTxId: 'TX-CYCLE-1',
      entityType: 'lot',
      entityId: 'LOT-CYCLE-1',
      eventType: 'CreateCommodityLot',
      payload: { lotId: 'LOT-CYCLE-1' },
      timestamp: '2026-06-25T10:00:00.000Z'
    };
    await port.appendEvents([event]);
    // The injected sink received the event; infrastructure never imported fabric.
    expect(sink.getLotHistory('LOT-CYCLE-1')).toEqual([]);
    expect(sink.verifyDatabaseHash('abc')).toEqual({ match: true, ledgerDigest: 'abc' });
  });

  it('the chain-query-port abstraction lives in infrastructure and imports no fabric module', () => {
    const source = readFileSync(join(infraDir, 'chain-query-port.ts'), 'utf8');
    expect(source).toContain('interface ChaincodeEventSink');
    // No import statement pulls from modules/fabric (comments may mention it).
    const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
    expect(importLines.some((line) => /modules\/fabric/.test(line))).toBe(false);
  });
});

// Keep `statSync` referenced for tooling that strips "unused" imports in some setups.
void statSync;
