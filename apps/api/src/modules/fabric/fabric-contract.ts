import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FabricOperationName } from './fabric-client.js';

export type FabricContractCategory = 'registry' | 'supply-chain' | 'allocation' | 'beneficiary' | 'delivery' | 'audit' | 'query';

export type FabricContractOperation = {
  name: FabricOperationName;
  category: FabricContractCategory;
};

export type FabricContractManifest = {
  network: string;
  channel: string;
  chaincode: string;
  operations: FabricContractOperation[];
};

export const resolveFabricNetworkPath = (...segments: string[]): string => {
  let directory = process.cwd();

  while (true) {
    const networkRoot = resolve(directory, 'blockchain/fabric-network');
    if (existsSync(resolve(networkRoot, 'fabric-contract.json'))) {
      return resolve(networkRoot, ...segments);
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return resolve(process.cwd(), 'blockchain/fabric-network', ...segments);
    }
    directory = parent;
  }
};

export const loadFabricContractManifest = (
  path = resolveFabricNetworkPath('fabric-contract.json')
): FabricContractManifest => JSON.parse(readFileSync(path, 'utf8')) as FabricContractManifest;

export const defaultFabricContractManifest = (): FabricContractManifest => loadFabricContractManifest();

export const getFabricOperationByApiRoute = (route: string): FabricOperationName | null => {
  const mapping: Record<string, FabricOperationName> = {
    '/stakeholders': 'RegisterStakeholder',
    '/lots': 'CreateCommodityLot',
    '/lots/transform': 'TransformLot',
    '/transfers/:transferId/authorize': 'RecordLedgerProof',
    '/transfers': 'DispatchLot',
    '/transfers/:transferId/receive': 'ReceiveLot',
    '/fps-allocations': 'AllocateToFPS',
    '/fps-allocations/:allocationId/receipt': 'RecordFPSReceipt',
    '/auth/mock-otp': 'RegisterBeneficiaryHash',
    '/auth/simulated-biometric': 'RegisterBeneficiaryHash',
    '/auth/supervisor-exception': 'RegisterBeneficiaryHash',
    '/entitlements/validate': 'CreateMonthlyEntitlement',
    '/distributions': 'RecordDistribution',
    '/audit-alerts/reconcile': 'RaiseAuditFlag',
    '/audit-alerts/:alertId/resolve': 'ResolveAuditFlag',
    '/lots/:lotId/history': 'GetLotHistory',
    '/distributions/:distributionId': 'GetDistributionHistory',
    '/dashboard/summary': 'GetCurrentStock',
    '/openapi.json': 'VerifyDatabaseHash'
  };

  return mapping[route] ?? null;
};
