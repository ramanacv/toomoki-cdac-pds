import { describe, expect, it } from 'vitest';
import {
  getDefaultModule,
  getDefaultPath,
  getModulesForRole,
  getModuleScreensForRole,
  resolveActiveModule,
  roleCanAccessModule,
  screenToModule
} from '../src/lib/modules.js';
import { getRoleScreens } from '../src/demo-model.js';

describe('demo modules', () => {
  it('maps roles to default module homes', () => {
    expect(getDefaultModule('FPS')).toBe('fps');
    expect(getDefaultModule('AUDITOR')).toBe('trust');
    expect(getDefaultModule('MANAGEMENT')).toBe('trust');
    expect(getDefaultModule('FCI_DEPOT')).toBe('supply-chain');
    expect(getDefaultPath('CONTROL_OFFICE')).toBe('/m/supply-chain');
    expect(getDefaultPath('FPS')).toBe('/m/fps');
  });

  it('exposes eligibility to control office and keeps FPS in its assigned module', () => {
    expect(roleCanAccessModule('CONTROL_OFFICE', 'eligibility')).toBe(true);
    expect(getModuleScreensForRole('eligibility', 'CONTROL_OFFICE')).toContain('eligibility-review');
    expect(roleCanAccessModule('FPS', 'eligibility')).toBe(false);
    expect(getModulesForRole('FPS').map((item) => item.id)).toEqual(['fps']);
  });

  it('reserves Trust & reconcile for oversight roles', () => {
    for (const role of ['FCI_DEPOT', 'GODOWN', 'CONTROL_OFFICE', 'BLOCK_OFFICE', 'FPS'] as const) {
      expect(roleCanAccessModule(role, 'trust')).toBe(false);
      expect(getRoleScreens(role)).not.toContain('dashboard');
      expect(getRoleScreens(role)).not.toContain('verify');
    }
    for (const role of ['MANAGEMENT', 'AUDITOR'] as const) {
      expect(roleCanAccessModule(role, 'trust')).toBe(true);
      expect(getRoleScreens(role)).toContain('dashboard');
      expect(getRoleScreens(role)).toContain('verify');
    }
  });

  it('resolves active module from flat routes and module homes', () => {
    expect(resolveActiveModule('/m/fps', 'FPS')).toBe('fps');
    expect(resolveActiveModule('/distribution', 'FPS')).toBe('fps');
    expect(resolveActiveModule('/lots', 'FCI_DEPOT')).toBe('supply-chain');
    expect(resolveActiveModule('/eligibility', 'CONTROL_OFFICE')).toBe('eligibility');
    expect(resolveActiveModule('/audit', 'AUDITOR')).toBe('trust');
  });

  it('prefers the role default when a screen belongs to multiple modules', () => {
    expect(screenToModule('allocations', 'FPS')).toBe('fps');
    expect(screenToModule('allocations', 'BLOCK_OFFICE')).toBe('supply-chain');
    expect(screenToModule('workbench', 'FPS')).toBe('fps');
    expect(screenToModule('workbench', 'GODOWN')).toBe('supply-chain');
  });
});
