import { FabricChaincodeLedgerPort } from './fabric-chaincode-ledger-port.js';
import { FabricEnvelopeLedgerPort } from './fabric-envelope-ledger-port.js';
import { loadFabricRuntimeConfig } from './fabric-config.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from './ledger-port.js';
import { loadPersistenceRuntimeConfig } from './persistence-config.js';
import { createPgPool, PgPoolSnapshotAdapter } from './postgres-adapter.js';
import { PostgresChaincodeLedgerPort } from './postgres-chaincode-ledger-port.js';
import { createPostgresLedgerPort } from './postgres-ledger-port.js';

const usesChaincodeRuntime = (mode: string): boolean => mode === 'chaincode-runtime' || mode === 'fabric-gateway';

export const createLedgerPortFromEnv = (): PdsLedgerPort => {
  const persistence = loadPersistenceRuntimeConfig();
  const config = loadFabricRuntimeConfig();

  if (persistence.backend === 'postgres') {
    const pool = createPgPool(persistence.postgresDsn);
    const adapter = new PgPoolSnapshotAdapter(pool);

    if (usesChaincodeRuntime(config.mode)) {
      return new PostgresChaincodeLedgerPort(adapter, config.journalPath, config.chaincodeStatePath);
    }

    const envelopePath = config.mode === 'fabric-envelope' ? config.envelopePath : null;
    return createPostgresLedgerPort(adapter, config.journalPath, envelopePath);
  }

  if (usesChaincodeRuntime(config.mode)) {
    return new FabricChaincodeLedgerPort(config.statePath, config.journalPath, config.chaincodeStatePath);
  }

  if (config.mode === 'fabric-envelope') {
    return new FabricEnvelopeLedgerPort(config.statePath, config.journalPath, config.envelopePath);
  }

  return new FilePdsLedgerPort(config.statePath, config.journalPath);
};
