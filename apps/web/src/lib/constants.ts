import type { DemoRole, DemoScenario } from '@/demo-model.js';
import { roleProfiles } from '@/demo-model.js';

export const roleOrder: DemoRole[] = [
  'MANAGEMENT',
  'CONTROL_OFFICE',
  'FCI_DEPOT',
  'DEPOT',
  'FPS',
  'WELFARE_INSTITUTE',
  'SHIV_BHOJAN_OPERATOR',
  'AUDITOR'
];

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
