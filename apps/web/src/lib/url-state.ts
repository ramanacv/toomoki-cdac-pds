import type { DemoRole, DemoScenario } from '@/demo-model.js';

export const VALID_ROLES: DemoRole[] = [
  'MANAGEMENT',
  'CONTROL_OFFICE',
  'FCI_DEPOT',
  'DEPOT',
  'FPS',
  'AUDITOR',
  'PROCUREMENT',
  'GODOWN'
];

export const VALID_SCENARIOS: DemoScenario[] = ['happy-path', 'short-receipt', 'duplicate-claim'];

export function parseRole(value: string | null): DemoRole {
  return VALID_ROLES.includes(value as DemoRole) ? (value as DemoRole) : 'MANAGEMENT';
}

export function parseScenario(value: string | null): DemoScenario {
  return VALID_SCENARIOS.includes(value as DemoScenario) ? (value as DemoScenario) : 'happy-path';
}
