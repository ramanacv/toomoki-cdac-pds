import { FabricEnvelopeLedgerPort } from './fabric-envelope-ledger-port.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from './ledger-port.js';
import { loadFabricRuntimeConfig } from './fabric-config.js';

export const createLedgerPortFromEnv = (): PdsLedgerPort => {
  const config = loadFabricRuntimeConfig();

  if (config.mode === 'fabric-envelope') {
    return new FabricEnvelopeLedgerPort(config.statePath, config.journalPath, config.envelopePath);
  }

  return new FilePdsLedgerPort(config.statePath, config.journalPath);
};
