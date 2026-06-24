import type { FabricContractManifest } from './fabric-contract.js';
import { getFabricOperationByApiRoute } from './fabric-contract.js';

export type FabricRoutePlan = {
  route: string;
  operation: string | null;
};

export const buildFabricRoutePlan = (manifest: FabricContractManifest): FabricRoutePlan[] =>
  manifest.operations.map((operation) => {
    const route = Object.keys({
      '/stakeholders': null,
      '/lots': null,
      '/transfers': null,
      '/transfers/:transferId/receive': null,
      '/fps-allocations': null,
      '/fps-allocations/:allocationId/receipt': null,
      '/auth/mock-otp': null,
      '/auth/simulated-biometric': null,
      '/auth/supervisor-exception': null,
      '/entitlements/validate': null,
      '/distributions': null,
      '/audit-alerts/reconcile': null,
      '/audit-alerts/:alertId/resolve': null,
      '/lots/:lotId/history': null,
      '/distributions/:distributionId': null,
      '/dashboard/summary': null,
      '/openapi.json': null
    }).find((candidate) => getFabricOperationByApiRoute(candidate) === operation.name) ?? operation.name;

    return {
      route,
      operation: operation.name
    };
  });
