import { describe, expect, it } from 'vitest';
import {
  backendSeed,
  commodities,
  eligibilityBeneficiaries,
  getScenarioAlerts,
  getScenarioDashboardSummary,
  getWorkspaceSnapshot,
  stakeholders
} from '../src/index.js';

describe('@pds/fixtures', () => {
  it('loads stakeholders from mock entities', () => {
    expect(stakeholders).toHaveLength(9);
    expect(stakeholders.map((entry) => entry.stakeholderId)).toEqual(
      expect.arrayContaining([
        'PROC-001',
        'FCI-001',
        'GODOWN-S-001',
        'ISSUE-001',
        'TRANS-001',
        'FPS-101',
        'FPS-202',
        'DSO-001',
        'AUD-001'
      ])
    );
  });

  it('defines backend seed lot and entitlement', () => {
    expect(commodities.map((commodity) => commodity.name)).toEqual([
      'Rice',
      'Wheat',
      'Dal',
      'Sugar',
      'Cooking Oil',
      'Kerosene'
    ]);
    expect(backendSeed.initialLots).toHaveLength(6);
    expect(backendSeed.initialEntitlements).toHaveLength(6);
    expect(backendSeed.initialLot.lotId).toBe('LOT-RICE-2026-001');
    expect(backendSeed.initialEntitlement.availableBalanceKg).toBe(25);
    expect(backendSeed.initialLots.map((lot) => lot.commodity)).toEqual(
      expect.arrayContaining(['Wheat', 'Dal', 'Sugar', 'Cooking Oil', 'Kerosene'])
    );
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

  it('exports Maharashtra and J&K canonical fictional eligibility panel profiles', () => {
    expect(eligibilityBeneficiaries).toHaveLength(9);
    expect(eligibilityBeneficiaries.map((item) => item.demoBeneficiaryId)).toEqual([
      'BEN-DEMO-001', 'BEN-DEMO-002', 'BEN-DEMO-003', 'BEN-DEMO-004', 'BEN-DEMO-005',
      'BEN-JK-DEMO-001', 'BEN-JK-DEMO-002', 'BEN-JK-DEMO-003', 'BEN-JK-DEMO-004'
    ]);
    expect(eligibilityBeneficiaries.every((item) =>
      item.fictionalName.includes('(Fictional)') &&
      item.maskedCardRef.includes('***') &&
      item.rationCardHash.endsWith('-hash')
    )).toBe(true);
  });
});
