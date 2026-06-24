import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLedgerPortFromEnv } from '../src/modules/ledger/ledger-port-factory.js';
import { FabricChaincodeLedgerPort } from '../src/modules/fabric/fabric-chaincode-ledger-port.js';
import { FabricGatewayLedgerPort } from '../src/modules/fabric/fabric-gateway.ledger-port.js';
import { FabricEnvelopeLedgerPort } from '../src/modules/fabric/fabric-envelope-ledger-port.js';
import { FilePdsLedgerPort } from '../src/infrastructure/ledger-port.js';
import { resolveLedgerMode } from '../src/modules/config/ledger-mode.config.js';

afterEach(() => {
  delete process.env.PDS_LEDGER_MODE;
  delete process.env.PDS_LEDGER_BACKEND;
  delete process.env.PDS_PERSISTENCE_BACKEND;
  delete process.env.PDS_STATE_PATH;
  delete process.env.PDS_LEDGER_JOURNAL_PATH;
  vi.unstubAllEnvs();
});

describe('resolveLedgerMode', () => {
  it('defaults to demo', () => {
    delete process.env.PDS_LEDGER_MODE;
    delete process.env.PDS_LEDGER_BACKEND;
    expect(resolveLedgerMode()).toBe('demo');
  });

  it('maps deprecated fabric-gateway backend to fabric mode', () => {
    process.env.PDS_LEDGER_BACKEND = 'fabric-gateway';
    expect(resolveLedgerMode()).toBe('fabric');
  });

  it('maps deprecated chaincode-runtime backend to demo mode', () => {
    process.env.PDS_LEDGER_BACKEND = 'chaincode-runtime';
    expect(resolveLedgerMode()).toBe('demo');
  });
});

describe('ledger port factory modes', () => {
  it('defaults to local file mode', () => {
    const port = createLedgerPortFromEnv();
    expect(port).toBeInstanceOf(FilePdsLedgerPort);
  });

  it('can create the fabric envelope adapter mode', () => {
    process.env.PDS_LEDGER_BACKEND = 'fabric-envelope';
    const port = createLedgerPortFromEnv();
    expect(port).toBeInstanceOf(FabricEnvelopeLedgerPort);
  });

  it('uses chaincode runtime in demo mode', () => {
    process.env.PDS_LEDGER_MODE = 'demo';
    process.env.PDS_LEDGER_BACKEND = 'chaincode-runtime';
    const port = createLedgerPortFromEnv();
    expect(port).toBeInstanceOf(FabricChaincodeLedgerPort);
  });

  it('selects fabric gateway port in fabric mode', () => {
    process.env.PDS_LEDGER_MODE = 'fabric';
    const port = createLedgerPortFromEnv();
    expect(port).toBeInstanceOf(FabricGatewayLedgerPort);
  });

  it('does not alias fabric-gateway backend to chaincode runtime', () => {
    process.env.PDS_LEDGER_BACKEND = 'fabric-gateway';
    const port = createLedgerPortFromEnv();
    expect(port).toBeInstanceOf(FabricGatewayLedgerPort);
    expect(port).not.toBeInstanceOf(FabricChaincodeLedgerPort);
  });
});
