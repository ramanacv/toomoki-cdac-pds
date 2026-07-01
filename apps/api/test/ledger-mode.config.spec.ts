import { afterEach, describe, expect, it } from 'vitest';
import { resolveLegacyBackendMode, resolveLedgerMode } from '../src/modules/config/ledger-mode.config.js';

afterEach(() => {
  delete process.env.PDS_LEDGER_MODE;
  delete process.env.PDS_LEDGER_BACKEND;
});

describe('resolveLegacyBackendMode', () => {
  it('defaults to local-file', () => {
    delete process.env.PDS_LEDGER_BACKEND;
    expect(resolveLegacyBackendMode()).toBe('local-file');
  });

  it('accepts supported backend values', () => {
    process.env.PDS_LEDGER_BACKEND = 'fabric-envelope';
    expect(resolveLegacyBackendMode()).toBe('fabric-envelope');
  });

  it('rejects unsupported backend values', () => {
    process.env.PDS_LEDGER_BACKEND = 'unknown-backend';
    expect(() => resolveLegacyBackendMode()).toThrow(/Unsupported PDS_LEDGER_BACKEND/);
  });
});

describe('resolveLedgerMode explicit values', () => {
  it('honors explicit demo and fabric modes', () => {
    process.env.PDS_LEDGER_MODE = 'fabric';
    expect(resolveLedgerMode()).toBe('fabric');

    process.env.PDS_LEDGER_MODE = 'demo';
    expect(resolveLedgerMode()).toBe('demo');
  });
});
