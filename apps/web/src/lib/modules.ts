import type { DemoRole, DemoScreen } from '@/demo-model.js';
import { getDefaultScreen, getRoleScreens } from '@/demo-model.js';
import { routeToScreen } from '@/lib/screen-routes.js';

export type DemoModule = 'supply-chain' | 'eligibility' | 'fps' | 'trust';

export type ModuleDefinition = {
  id: DemoModule;
  title: string;
  subtitle: string;
  boundary: string;
  path: string;
  screens: DemoScreen[];
  roles: DemoRole[];
};

export const moduleDefinitions: ModuleDefinition[] = [
  {
    id: 'supply-chain',
    title: 'Supply chain',
    subtitle: 'Custody from FCI through godowns to FPS allotment.',
    boundary: 'Simulated state SCM / IAeSCM operations; proofs recorded in ViksitPDS.',
    path: '/m/supply-chain',
    screens: ['workbench', 'lots', 'transfers', 'allocations'],
    roles: ['FCI_DEPOT', 'GODOWN', 'CONTROL_OFFICE', 'BLOCK_OFFICE', 'MANAGEMENT', 'AUDITOR']
  },
  {
    id: 'eligibility',
    title: 'Card & eligibility',
    subtitle: 'Ration-card integrity review and ghost-risk screening.',
    boundary: 'Simulated SMART-PDS/RCMS integrity review; not a live card master.',
    path: '/m/eligibility',
    screens: ['eligibility-review'],
    roles: ['CONTROL_OFFICE', 'MANAGEMENT', 'AUDITOR']
  },
  {
    id: 'fps',
    title: 'FPS authentication',
    subtitle: 'Shop receipt, mock beneficiary auth, and ration issue.',
    boundary:
      'Simulated AePDS/ePoS with Aadhaar-format auth outcomes via opaque aadhaarRefHash only (not live UIDAI).',
    path: '/m/fps',
    screens: ['workbench', 'allocations', 'distribution'],
    roles: ['FPS', 'MANAGEMENT', 'AUDITOR']
  },
  {
    id: 'trust',
    title: 'Trust & reconcile',
    subtitle: 'Cross-system overview, alerts, and verification.',
    boundary: 'ViksitPDS trust layer — reconcile views and privacy-safe proof evidence.',
    path: '/m/trust',
    screens: ['dashboard', 'stakeholders', 'audit-alerts', 'verify'],
    roles: ['MANAGEMENT', 'AUDITOR', 'CONTROL_OFFICE', 'BLOCK_OFFICE', 'FCI_DEPOT', 'GODOWN', 'FPS']
  }
];

export const isDemoModule = (value: string | undefined): value is DemoModule =>
  moduleDefinitions.some((definition) => definition.id === value);

export const getModuleDefinition = (moduleId: DemoModule): ModuleDefinition => {
  const definition = moduleDefinitions.find((item) => item.id === moduleId);
  if (!definition) {
    throw new Error(`Unknown demo module: ${moduleId}`);
  }
  return definition;
};

export const getModulesForRole = (role: DemoRole): ModuleDefinition[] =>
  moduleDefinitions.filter(
    (definition) =>
      definition.roles.includes(role) &&
      definition.screens.some((screen) => getRoleScreens(role).includes(screen))
  );

export const getDefaultModule = (role: DemoRole): DemoModule => {
  if (role === 'FPS') return 'fps';
  if (role === 'MANAGEMENT' || role === 'AUDITOR') return 'trust';
  return 'supply-chain';
};

export const getDefaultPath = (role: DemoRole): string => getModuleDefinition(getDefaultModule(role)).path;

export const modulePath = (moduleId: DemoModule, search = ''): { pathname: string; search: string } => ({
  pathname: getModuleDefinition(moduleId).path,
  search
});

export const getModuleScreensForRole = (moduleId: DemoModule, role: DemoRole): DemoScreen[] => {
  const allowed = new Set(getRoleScreens(role));
  return getModuleDefinition(moduleId).screens.filter((screen) => allowed.has(screen));
};

/** Prefer the role's default module when a screen belongs to more than one module. */
export const screenToModule = (screen: DemoScreen, role: DemoRole): DemoModule => {
  const candidates = getModulesForRole(role).filter((definition) => definition.screens.includes(screen));
  if (candidates.length === 0) {
    return getDefaultModule(role);
  }
  const preferred = getDefaultModule(role);
  return candidates.find((item) => item.id === preferred)?.id ?? candidates[0]!.id;
};

export const resolveActiveModule = (pathname: string, role: DemoRole): DemoModule => {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  if (trimmed.startsWith('/m/')) {
    const moduleId = trimmed.split('/')[2];
    if (isDemoModule(moduleId) && getModulesForRole(role).some((item) => item.id === moduleId)) {
      return moduleId;
    }
    return getDefaultModule(role);
  }

  const segment = trimmed.replace(/^\//, '').split('/')[0] ?? '';
  const screen = routeToScreen(segment);
  if (!screen) {
    return getDefaultModule(role);
  }
  return screenToModule(screen, role);
};

export const roleCanAccessModule = (role: DemoRole, moduleId: DemoModule): boolean =>
  getModulesForRole(role).some((definition) => definition.id === moduleId);

/** Fallback screen inside a module when a deep link is forbidden. */
export const getDefaultScreenForModule = (moduleId: DemoModule, role: DemoRole): DemoScreen => {
  const screens = getModuleScreensForRole(moduleId, role);
  if (screens.length > 0) {
    return screens[0]!;
  }
  return getDefaultScreen(role);
};
