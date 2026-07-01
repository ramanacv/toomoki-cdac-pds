import { FabricChaincodeLedgerPort } from '../fabric/fabric-chaincode-ledger-port.js';
import { FabricChaincodeClient } from '../fabric/fabric-chaincode-client.js';
import { FabricEnvelopeLedgerPort } from '../fabric/fabric-envelope-ledger-port.js';
import { FabricGatewayLedgerPort } from '../fabric/fabric-gateway.ledger-port.js';
import { loadFabricRuntimeConfig } from '../config/fabric.config.js';
import { usesDemoChaincodeRuntime } from '../config/ledger-mode.config.js';
import { loadPersistenceRuntimeConfig } from '../config/persistence.config.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from '../../infrastructure/ledger-port.js';
import { createPgPool, PgPoolSnapshotAdapter } from '../../infrastructure/postgres-adapter.js';
import { PostgresChaincodeLedgerPort } from '../../infrastructure/postgres-chaincode-ledger-port.js';
import { PostgresPdsLedgerPort } from '../../infrastructure/postgres-ledger-port.js';
import type { ChainQueryPort } from '../../infrastructure/chain-query-port.js';

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
      // Inject the chaincode client here so infrastructure has no fabric import (T5.1).
      const chaincodeClient = new FabricChaincodeClient(config.chaincodeStatePath);
      return new PostgresChaincodeLedgerPort(
        adapter,
        config.journalPath,
        config.chaincodeStatePath,
        chaincodeClient
      );
    }

    // Compose the event port here (composition root) so infrastructure stays
    // free of any modules/fabric dependency (T5.1).
    const eventPort: PdsLedgerPort =
      config.mode === 'fabric-envelope'
        ? new FabricEnvelopeLedgerPort(config.statePath, config.journalPath, config.envelopePath)
        : new FilePdsLedgerPort(config.statePath, config.journalPath);
    return new PostgresPdsLedgerPort(adapter, eventPort);
  }

  if (usesDemoChaincodeRuntime(config.ledgerMode, config.mode)) {
    return new FabricChaincodeLedgerPort(config.statePath, config.journalPath, config.chaincodeStatePath);
  }

  if (config.mode === 'fabric-envelope') {
    return new FabricEnvelopeLedgerPort(config.statePath, config.journalPath, config.envelopePath);
  }

  return new FilePdsLedgerPort(config.statePath, config.journalPath);
};

/** Narrowed type retained for callers that also need chain query access. */
export type { ChainQueryPort };
