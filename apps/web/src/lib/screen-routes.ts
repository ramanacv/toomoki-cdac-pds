import type { DemoScreen } from '@/demo-model.js';

export const screenRoutes: Record<DemoScreen, string> = {
  dashboard: 'dashboard',
  workbench: 'workbench',
  stakeholders: 'stakeholders',
  lots: 'lots',
  transfers: 'transfers',
  allocations: 'allocations',
  distribution: 'distribution',
  'audit-alerts': 'audit',
  verify: 'verify'
};

export const routeToScreen = (segment: string): DemoScreen | undefined =>
  (Object.keys(screenRoutes) as DemoScreen[]).find((screen) => screenRoutes[screen] === segment);

export const screenPath = (screen: DemoScreen, search = ''): { pathname: string; search: string } => ({
  pathname: `/${screenRoutes[screen]}`,
  search
});
