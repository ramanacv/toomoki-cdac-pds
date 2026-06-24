import { FabricChaincodeLedgerPort } from '../fabric/fabric-chaincode-ledger-port.js';
import { FabricEnvelopeLedgerPort } from '../fabric/fabric-envelope-ledger-port.js';
import { FabricGatewayLedgerPort } from '../fabric/fabric-gateway.ledger-port.js';
import { loadFabricRuntimeConfig } from '../config/fabric.config.js';
import { usesDemoChaincodeRuntime } from '../config/ledger-mode.config.js';
import { loadPersistenceRuntimeConfig } from '../config/persistence.config.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from '../../infrastructure/ledger-port.js';
import { createPgPool, PgPoolSnapshotAdapter } from '../../infrastructure/postgres-adapter.js';
import { PostgresChaincodeLedgerPort } from '../../infrastructure/postgres-chaincode-ledger-port.js';
import { createPostgresLedgerPort } from '../../infrastructure/postgres-ledger-port.js';

export const createLedgerPortFromEnv = (): PdsLedgerPort => {
  const persistence = loadPersistenceRuntimeConfig();
  const config = loadFabricRuntimeConfig();

  if (config.ledgerMode === 'fabric') {
    if (persistence.backend === 'postgres') {
      const pool = createPgPool(persistence.postgresDsn);
      const adapter = new PgPoolSnapshotAdapter(pool);
      return new FabricGatewayLedgerPort(config, adapter);
    }
    return new FabricGatewayLedgerPort(config);
  }

  if (persistence.backend === 'postgres') {
    const pool = createPgPool(persistence.postgresDsn);
    const adapter = new PgPoolSnapshotAdapter(pool);

    if (usesDemoChaincodeRuntime(config.ledgerMode, config.mode)) {
      return new PostgresChaincodeLedgerPort(adapter, config.journalPath, config.chaincodeStatePath);
    }

    const envelopePath = config.mode === 'fabric-envelope' ? config.envelopePath : null;
    return createPostgresLedgerPort(adapter, config.journalPath, envelopePath);
  }

  if (usesDemoChaincodeRuntime(config.ledgerMode, config.mode)) {
    return new FabricChaincodeLedgerPort(config.statePath, config.journalPath, config.chaincodeStatePath);
  }

  if (config.mode === 'fabric-envelope') {
    return new FabricEnvelopeLedgerPort(config.statePath, config.journalPath, config.envelopePath);
  }

  return new FilePdsLedgerPort(config.statePath, config.journalPath);
};
