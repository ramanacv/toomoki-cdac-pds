import { describe, expect, it } from 'vitest';
import {
  backendSeed,
  getScenarioAlerts,
  getScenarioDashboardSummary,
  getWorkspaceSnapshot,
  stakeholders
} from '../src/index.js';

describe('@pds/fixtures', () => {
  it('loads stakeholders from mock entities', () => {
    expect(stakeholders).toHaveLength(7);
    expect(stakeholders.some((entry) => entry.stakeholderId === 'FPS-101')).toBe(true);
  });

  it('defines backend seed lot and entitlement', () => {
    expect(backendSeed.initialLot.lotId).toBe('LOT-RICE-2026-001');
    expect(backendSeed.initialEntitlement.availableBalanceKg).toBe(25);
  });

  it('returns scenario-specific alerts and dashboard overrides', () => {
    expect(getScenarioAlerts('short-receipt')[0]?.alertType).toBe('SHORT_RECEIPT');
    expect(getScenarioDashboardSummary('duplicate-claim').completedDistributions).toBe(0);
  });

  it('builds a complete workspace snapshot', () => {
    const workspace = getWorkspaceSnapshot('happy-path');
    expect(workspace.distributions).toHaveLength(1);
    expect(workspace.alerts).toHaveLength(1);
  });
});
