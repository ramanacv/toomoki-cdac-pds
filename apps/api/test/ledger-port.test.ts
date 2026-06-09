import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLedgerPortFromEnv } from '../src/ledger-port-factory.js';
import { FabricEnvelopeLedgerPort } from '../src/fabric-envelope-ledger-port.js';
import { FilePdsLedgerPort } from '../src/ledger-port.js';

afterEach(() => {
  delete process.env.PDS_LEDGER_BACKEND;
  delete process.env.PDS_STATE_PATH;
  delete process.env.PDS_LEDGER_JOURNAL_PATH;
  vi.unstubAllEnvs();
});

describe('ledger port factory', () => {
  it('defaults to local file mode', () => {
    const port = createLedgerPortFromEnv();
    expect(port).toBeInstanceOf(FilePdsLedgerPort);
  });

  it('can create the fabric envelope adapter mode', () => {
    process.env.PDS_LEDGER_BACKEND = 'fabric-envelope';
    const port = createLedgerPortFromEnv();
    expect(port).toBeInstanceOf(FabricEnvelopeLedgerPort);
  });
});
