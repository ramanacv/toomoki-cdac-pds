import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultFabricContractManifest } from '../fabric/fabric-contract.js';
import { resolveLegacyBackendMode, resolveLedgerMode, type FabricBackendMode } from './ledger-mode.config.js';

export type FabricRuntimeConfig = {
  ledgerMode: ReturnType<typeof resolveLedgerMode>;
  mode: FabricBackendMode;
  clientOrg: string;
  statePath: string;
  journalPath: string;
  envelopePath: string;
  chaincodeStatePath: string;
  contractPath: string;
  connectionProfilePath: string;
  network: string;
  channel: string;
  chaincode: string;
  peerEndpoint: string;
  peerTlsCertPath: string;
  peerHostAlias: string;
  mspId: string;
  certPath: string;
  keyPath: string;
};

type FabricOrgManifest = {
  name: string;
  role: string;
  mspId?: string;
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

const clientOrgToMspId = (clientOrg: string): string => {
  const mapping: Record<string, string> = {
    FoodAndCivilSupplies: 'FoodAndCivilSuppliesMSP',
    GodownWarehouse: 'GodownWarehouseMSP',
    ProcurementMiller: 'ProcurementMillerMSP',
    FairPriceShop: 'FairPriceShopMSP',
    AuditAuthority: 'AuditAuthorityMSP'
  };

  return mapping[clientOrg] ?? `${clientOrg}MSP`;
};

export const loadFabricRuntimeConfig = (): FabricRuntimeConfig => {
  const ledgerMode = resolveLedgerMode();
  const mode = resolveLegacyBackendMode();
  const clientOrg = process.env.PDS_FABRIC_CLIENT_ORG ?? 'FoodAndCivilSupplies';
  const statePath = process.env.PDS_STATE_PATH ?? resolve(process.cwd(), '../../tmp/pds-state.json');
  const journalPath = process.env.PDS_LEDGER_JOURNAL_PATH ?? resolve(process.cwd(), '../../tmp/pds-ledger.ndjson');
  const envelopePath = process.env.PDS_FABRIC_ENVELOPE_PATH ?? resolve(process.cwd(), '../../tmp/pds-fabric-envelope.ndjson');
  const chaincodeStatePath = process.env.PDS_CHAINCODE_STATE_PATH ?? resolve(process.cwd(), '../../tmp/chaincode-world-state.json');
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

  if (
    contractFromFile.network !== contract.network ||
    contractFromFile.channel !== contract.channel ||
    contractFromFile.chaincode !== contract.chaincode ||
    contractFromFile.operations.length !== contract.operations.length
  ) {
    throw new Error(`Fabric contract at ${contractPath} does not match the expected manifest`);
  }

  const channel = process.env.PDS_FABRIC_CHANNEL ?? contract.channel;
  const chaincode = process.env.PDS_FABRIC_CHAINCODE ?? contract.chaincode;
  const mspId = process.env.PDS_FABRIC_MSP_ID ?? clientOrgToMspId(clientOrg);
  const cryptoBase = resolve(process.cwd(), '../../blockchain/fabric-network/crypto');

  return {
    ledgerMode,
    mode,
    clientOrg,
    statePath,
    journalPath,
    envelopePath,
    chaincodeStatePath,
    contractPath,
    connectionProfilePath,
    network: contract.network,
    channel,
    chaincode,
    peerEndpoint: process.env.PDS_FABRIC_PEER_ENDPOINT ?? 'peer0.food.example.com:7051',
    peerTlsCertPath: process.env.PDS_FABRIC_PEER_TLS_CERT_PATH ?? resolve(cryptoBase, 'peerOrganizations/food.example.com/peers/peer0.food.example.com/tls/ca.crt'),
    peerHostAlias: process.env.PDS_FABRIC_PEER_HOST_ALIAS ?? 'peer0.food.example.com',
    mspId,
    certPath: process.env.PDS_FABRIC_CERT_PATH ?? resolve(cryptoBase, 'peerOrganizations/food.example.com/users/User1@food.example.com/msp/signcerts/cert.pem'),
    keyPath: process.env.PDS_FABRIC_KEY_PATH ?? resolve(cryptoBase, 'peerOrganizations/food.example.com/users/User1@food.example.com/msp/keystore')
  };
};
