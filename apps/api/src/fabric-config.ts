import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultFabricContractManifest } from './fabric-contract.js';

export type FabricBackendMode = 'local-file' | 'fabric-envelope';

export type FabricRuntimeConfig = {
  mode: FabricBackendMode;
  clientOrg: string;
  statePath: string;
  journalPath: string;
  envelopePath: string;
  contractPath: string;
  connectionProfilePath: string;
  network: string;
  channel: string;
  chaincode: string;
};

type FabricOrgManifest = {
  name: string;
  role: string;
};

export const loadFabricRuntimeConfig = (): FabricRuntimeConfig => {
  const mode = (process.env.PDS_LEDGER_BACKEND ?? 'local-file').toLowerCase() as FabricBackendMode;
  const clientOrg = process.env.PDS_FABRIC_CLIENT_ORG ?? 'FoodAndCivilSupplies';
  const statePath = process.env.PDS_STATE_PATH ?? resolve(process.cwd(), '../../tmp/pds-state.json');
  const journalPath = process.env.PDS_LEDGER_JOURNAL_PATH ?? resolve(process.cwd(), '../../tmp/pds-ledger.ndjson');
  const envelopePath = process.env.PDS_FABRIC_ENVELOPE_PATH ?? resolve(process.cwd(), '../../tmp/pds-fabric-envelope.ndjson');
  const contractPath = resolve(process.cwd(), '../../blockchain/fabric-network/fabric-contract.json');
  const connectionProfilePath = resolve(process.cwd(), `../../blockchain/fabric-network/connection-profiles/${clientOrgToProfileFile(clientOrg)}`);
  const contract = defaultFabricContractManifest();
  const contractFromFile = JSON.parse(readFileSync(contractPath, 'utf8')) as {
    network: string;
    channel: string;
    chaincode: string;
    operations: unknown[];
  };
  const networkManifest = JSON.parse(readFileSync(resolve(process.cwd(), '../../blockchain/fabric-network/network-manifest.json'), 'utf8')) as {
    organizations: FabricOrgManifest[];
  };

  if (!networkManifest.organizations.some((organization) => organization.name === clientOrg)) {
    throw new Error(`Unknown Fabric client organization: ${clientOrg}`);
  }

  if (!['local-file', 'fabric-envelope'].includes(mode)) {
    throw new Error(`Unsupported PDS_LEDGER_BACKEND mode: ${mode}`);
  }

  if (
    contractFromFile.network !== contract.network ||
    contractFromFile.channel !== contract.channel ||
    contractFromFile.chaincode !== contract.chaincode ||
    contractFromFile.operations.length !== contract.operations.length
  ) {
    throw new Error(`Fabric contract at ${contractPath} does not match the expected manifest`);
  }

  return {
    mode,
    clientOrg,
    statePath,
    journalPath,
    envelopePath,
    contractPath,
    connectionProfilePath,
    network: contract.network,
    channel: contract.channel,
    chaincode: contract.chaincode
  };
};

const clientOrgToProfileFile = (clientOrg: string): string => {
  const mapping: Record<string, string> = {
    FoodAndCivilSupplies: 'food-department.json',
    ProcurementMiller: 'procurement-miller.json',
    GodownWarehouse: 'godown-warehouse.json',
    FairPriceShop: 'fps.json',
    AuditAuthority: 'audit-authority.json'
  };

  return mapping[clientOrg] ?? `${clientOrg}.json`;
};
