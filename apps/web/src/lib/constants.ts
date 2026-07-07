import type { DemoRole, DemoScenario } from '@/demo-model.js';
import { roleProfiles } from '@/demo-model.js';

export const roleOrder: DemoRole[] = [
  'MANAGEMENT',
  'CONTROL_OFFICE',
  'DEPARTMENT',
  'PROCUREMENT',
  'FCI_DEPOT',
  'GODOWN',
  'DEPOT',
  'FPS',
  'WELFARE_INSTITUTE',
  'SHIV_BHOJAN_OPERATOR',
  'AUDITOR'
];

export const workflowRoles = new Set<DemoRole>([
  'CONTROL_OFFICE',
  'PROCUREMENT',
  'FCI_DEPOT',
  'DEPOT',
  'FPS',
  'WELFARE_INSTITUTE',
  'SHIV_BHOJAN_OPERATOR'
]);

export const roleCategory = (role: DemoRole): 'workflow' | 'optional' =>
  workflowRoles.has(role) ? 'workflow' : 'optional';

export const scenarioOptions: Array<{ id: DemoScenario; label: string; short: string }> = [
  { id: 'happy-path', label: 'Happy path', short: 'All custody checkpoints clear.' },
  { id: 'short-receipt', label: 'Short receipt', short: 'Receipt mismatch raises alert.' },
  { id: 'duplicate-claim', label: 'Duplicate claim', short: 'Second lift is blocked.' }
];

export const summaryCardData = (summary: {
  trackedStockKg: number;
  activeLots: number;
  completedDistributions: number;
  pendingReceipts: number;
}): Array<[string, string]> => [
  ['Tracked stock', `${summary.trackedStockKg.toLocaleString()} kg`],
  ['Active lots', summary.activeLots.toString()],
  ['Completed distributions', summary.completedDistributions.toString()],
  ['Pending receipts', summary.pendingReceipts.toString()]
];

export const roleTitle = (role: DemoRole): string => roleProfiles[role].title;

export const formatDateTime = (value?: string): string => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false
  }).format(date);
};
