import { describe, expect, it } from 'vitest';
import { canReadWorkspaceCollection, type RestrictedWorkspaceCollection } from '../src/api.js';
import type { WebRole } from '../src/auth-token.js';

describe('workspace collection role access', () => {
  it('skips restricted collections for management instead of turning expected 403 responses into an outage', () => {
    expect(canReadWorkspaceCollection('authTransactions', ['management'])).toBe(false);
    expect(canReadWorkspaceCollection('entitlements', ['management'])).toBe(false);
    expect(canReadWorkspaceCollection('alerts', ['management'])).toBe(false);
    expect(canReadWorkspaceCollection('distributions', ['management'])).toBe(true);
  });

  it('matches the API read policies for every operational login', () => {
    const collections: RestrictedWorkspaceCollection[] = ['authTransactions', 'entitlements', 'distributions', 'alerts'];
    const expected: Record<WebRole, RestrictedWorkspaceCollection[]> = {
      management: ['distributions'],
      department: ['authTransactions', 'entitlements', 'distributions'],
      procurement: [],
      fci: [],
      godown: [],
      fps: ['authTransactions', 'entitlements', 'distributions'],
      auditor: ['authTransactions', 'entitlements', 'distributions', 'alerts'],
      'platform-admin': [],
      'metrics-reader': [],
      'demo-reset': []
    };

    for (const [role, permitted] of Object.entries(expected) as Array<[WebRole, RestrictedWorkspaceCollection[]]>) {
      for (const collection of collections) {
        expect(canReadWorkspaceCollection(collection, [role]), `${role} / ${collection}`).toBe(permitted.includes(collection));
      }
    }
  });
});
