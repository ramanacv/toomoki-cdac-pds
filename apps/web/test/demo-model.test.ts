import { describe, expect, it } from 'vitest';
import {
  buildWorkflowSteps,
  getDefaultScreen,
  getRoleProfile,
  getRoleScreens,
  getScenarioAlerts,
  getScenarioMetrics,
  getTraceCards,
  demoAllocations
} from '../src/demo-model.js';
import { demoAuthTransactions, demoEntitlements } from '../src/demo-model.js';

describe('demo model', () => {
  it('keeps the happy-path workflow fully complete', () => {
    const workflow = buildWorkflowSteps('happy-path');
    expect(workflow.every((step) => step.state === 'complete')).toBe(true);
  });

  it('raises a shortage signal for the short-receipt scenario', () => {
    const workflow = buildWorkflowSteps('short-receipt');
    expect(workflow.some((step) => step.state === 'blocked')).toBe(true);
    expect(getScenarioAlerts('short-receipt')[0]?.alertType).toBe('SHORT_RECEIPT');
    expect(getTraceCards('short-receipt')[1]?.value).toBe('300 kg');
  });

  it('blocks duplicate claim attempts in the duplicate-claim scenario', () => {
    const workflow = buildWorkflowSteps('duplicate-claim');
    expect(workflow.some((step) => step.state === 'blocked')).toBe(true);
    expect(getScenarioAlerts('duplicate-claim')[0]?.alertType).toBe('DUPLICATE_CLAIM');
    expect(getScenarioMetrics('duplicate-claim').completedDistributions).toBe(0);
  });

  it('returns a role profile for auditors', () => {
    const profile = getRoleProfile('AUDITOR');
    expect(profile.modules).toContain('Trace explorer');
  });

  it('includes allocation records for the fps workspace', () => {
    expect(demoAllocations.some((allocation) => allocation.status === 'ALLOCATED')).toBe(true);
    expect(demoAllocations.some((allocation) => allocation.status === 'RECEIVED')).toBe(true);
  });

  it('includes auth and entitlement records for traceability', () => {
    expect(demoAuthTransactions).toHaveLength(1);
    expect(demoEntitlements[0]?.availableBalanceKg).toBe(0);
  });

  it('maps each role to a navigable screen set', () => {
    expect(getDefaultScreen('AUDITOR')).toBe('dashboard');
    expect(getRoleScreens('FPS')).toContain('distribution');
    expect(getRoleScreens('PROCUREMENT')).toContain('lots');
  });
});
