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
    expect(stakeholders).toHaveLength(17);
    expect(stakeholders.map((entry) => entry.stakeholderId)).toEqual(
      expect.arrayContaining([
        'DFPD-001',
        'FCI-001',
        'FCI-BUF-001',
        'ISSUE-001',
        'TRANS-001',
        'FPS-101',
        'WI-101',
        'SBE-101',
        'DSO-001',
        'FDO-001',
        'TSO-001'
      ])
    );
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
