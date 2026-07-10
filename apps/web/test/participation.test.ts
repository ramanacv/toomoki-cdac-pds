import { describe, expect, it } from 'vitest';
import { StakeholderType } from '@pds/shared-types';
import {
  activeParticipantRoles,
  activeRolesInOrder,
  passiveRoles,
  passiveRolesInOrder,
  roleParticipation,
  stakeholderParticipation
} from '../src/lib/constants.js';

describe('participation helpers', () => {
  it('classifies workbench roles as active participants', () => {
    expect(activeParticipantRoles.has('GODOWN')).toBe(true);
    expect(activeParticipantRoles.has('FPS')).toBe(true);
    expect(activeParticipantRoles.has('CONTROL_OFFICE')).toBe(true);
    expect(activeRolesInOrder()).not.toContain('MANAGEMENT');
    expect(activeRolesInOrder()).not.toContain('AUDITOR');
    expect(activeRolesInOrder()).toEqual([
      'PROCUREMENT',
      'FCI_DEPOT',
      'GODOWN',
      'CONTROL_OFFICE',
      'DEPOT',
      'FPS'
    ]);
  });

  it('classifies oversight roles as passive', () => {
    for (const role of ['MANAGEMENT', 'AUDITOR'] as const) {
      expect(passiveRoles.has(role)).toBe(true);
      expect(roleParticipation(role)).toBe('passive');
    }
    expect(passiveRolesInOrder()).toEqual(['MANAGEMENT', 'AUDITOR']);
  });

  it('maps stakeholder types to active custody operators', () => {
    expect(stakeholderParticipation(StakeholderType.FAIR_PRICE_SHOP)).toBe('active');
    expect(stakeholderParticipation(StakeholderType.DISTRICT_SUPPLY_OFFICE)).toBe('active');
    expect(stakeholderParticipation(StakeholderType.PROCUREMENT_CENTER)).toBe('active');
  });

  it('maps policy and audit stakeholder types to passive', () => {
    expect(stakeholderParticipation(StakeholderType.AUDITOR)).toBe('passive');
    expect(stakeholderParticipation(StakeholderType.TRANSPORTER)).toBe('passive');
  });
});
