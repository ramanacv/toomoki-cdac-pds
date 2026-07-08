export type AdminScreen = 'overview' | 'network' | 'stakeholders' | 'ledger' | 'alerts' | 'tools';

export type AdminScreenDefinition = {
  id: AdminScreen;
  label: string;
  description: string;
};

export const adminScreenDefinitions: AdminScreenDefinition[] = [
  { id: 'overview', label: 'Overview', description: 'Ledger metrics and runtime status.' },
  { id: 'network', label: 'Network & health', description: 'Ledger mode, persistence, and subsystem checks.' },
  { id: 'stakeholders', label: 'Stakeholders', description: 'Org, status, and Fabric channel breakdown.' },
  { id: 'ledger', label: 'Ledger activity', description: 'Entitlement utilization, stock, and recent events.' },
  { id: 'alerts', label: 'Audit alerts', description: 'Open risk signals across the network.' },
  { id: 'tools', label: 'Admin tools', description: 'Token, test-data top-ups, and ledger reset.' }
];

export const adminScreenRoutes: Record<AdminScreen, string> = {
  overview: 'overview',
  network: 'network',
  stakeholders: 'stakeholders',
  ledger: 'ledger',
  alerts: 'alerts',
  tools: 'tools'
};

export const adminRouteToScreen = (segment: string): AdminScreen | undefined =>
  (Object.keys(adminScreenRoutes) as AdminScreen[]).find((screen) => adminScreenRoutes[screen] === segment);

export const adminScreenPath = (screen: AdminScreen): string => `/admin/${adminScreenRoutes[screen]}`;
