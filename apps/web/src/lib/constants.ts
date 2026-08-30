import type { DemoRole, DemoScenario } from '@/demo-model.js';
import { roleProfiles } from '@/demo-model.js';
import { StakeholderType } from '@pds/shared-types';

export type ParticipationMode = 'active' | 'passive';

export const roleOrder: DemoRole[] = [
  'FCI_DEPOT',
  'GODOWN',
  'CONTROL_OFFICE',
  'BLOCK_OFFICE',
  'FPS',
  'MANAGEMENT',
  'AUDITOR'
];

/** Roles with executable workbench actions in the custody chain. */
export const activeParticipantRoles = new Set<DemoRole>([
  'CONTROL_OFFICE',
  'BLOCK_OFFICE',
  'FCI_DEPOT',
  'GODOWN',
  'FPS'
]);

/** Oversight, policy, and inspection roles — view dashboards and evidence only. */
export const passiveRoles = new Set<DemoRole>(['MANAGEMENT', 'AUDITOR']);

export const roleParticipation = (role: DemoRole): ParticipationMode =>
  passiveRoles.has(role) ? 'passive' : 'active';

export const activeRolesInOrder = (): DemoRole[] =>
  roleOrder.filter((role) => roleParticipation(role) === 'active');

export const passiveRolesInOrder = (): DemoRole[] =>
  roleOrder.filter((role) => roleParticipation(role) === 'passive');

/** @deprecated Use activeParticipantRoles / roleParticipation instead. */
export const workflowRoles = activeParticipantRoles;

/** @deprecated Use roleParticipation instead. */
export const roleCategory = (role: DemoRole): 'workflow' | 'optional' =>
  roleParticipation(role) === 'active' ? 'workflow' : 'optional';

const passiveStakeholderTypes = new Set<StakeholderType>([
  StakeholderType.AUDITOR,
  StakeholderType.TRANSPORTER,
  StakeholderType.DISTRICT_SUPPLY_OFFICE,
  StakeholderType.BLOCK_SUPPLY_OFFICE
]);

export const stakeholderParticipation = (stakeholderType: StakeholderType): ParticipationMode =>
  passiveStakeholderTypes.has(stakeholderType) ? 'passive' : 'active';

export const participationLabel: Record<ParticipationMode, string> = {
  active: 'Workbench operator',
  passive: 'View only'
};

export const stageHints: Record<'I' | 'II', string> = {
  I: 'Stage-I: government movement from FCI Central Depot to the state godown.',
  II: 'Stage-II: RO-authorized movement from state godown to block godown before FPS allocation.'
};

export const scenarioOptions: Array<{ id: DemoScenario; label: string; short: string }> = [
  { id: 'happy-path', label: 'Happy path', short: 'All custody checkpoints clear.' },
  { id: 'short-receipt', label: 'Short receipt', short: 'Receipt mismatch raises alert.' },
  { id: 'duplicate-claim', label: 'Duplicate claim', short: 'Second lift is blocked.' }
];

import type { DashboardSummary } from '@pds/shared-types';

export const summaryCardData = (summary: DashboardSummary): Array<[string, string]> => [
  ['Tracked stock', `${summary.trackedStockKg.toLocaleString()} kg`],
  ['Active lots', summary.activeLots.toString()],
  ['Completed distributions', summary.completedDistributions.toString()],
  ['In-transit transfers', (summary.pendingTransferReceipts ?? summary.pendingReceipts).toString()],
  ['Pending FPS allocations', (summary.pendingFpsAllocations ?? 0).toString()]
];

export const roleTitle = (role: DemoRole): string => roleProfiles[role].title;

const humanDateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: true
});

export const formatDateTime = (value?: string): string => {
  if (!value) return 'Pending';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return humanDateTimeFormatter
    .format(date)
    .replace(/\b(am|pm)\b/gi, (period) => period.toUpperCase());
};
