import { describe, expect, it } from 'vitest';
import { canReadWorkspaceCollection, readApiError, type RestrictedWorkspaceCollection } from '../src/api.js';
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
      'block-office': [],
      fps: ['authTransactions', 'entitlements', 'distributions'],
      auditor: ['authTransactions', 'entitlements', 'distributions', 'alerts'],
      'platform-admin': [],
      'metrics-reader': [],
      'demo-reset': [],
      'integration-service': []
    };

    for (const [role, permitted] of Object.entries(expected) as Array<[WebRole, RestrictedWorkspaceCollection[]]>) {
      for (const collection of collections) {
        expect(canReadWorkspaceCollection(collection, [role]), `${role} / ${collection}`).toBe(permitted.includes(collection));
      }
    }
  });

  it('reports the denied endpoint and server-side scope reason instead of an outage', async () => {
    const response = new Response(
      JSON.stringify({ message: 'FPS identity has no active shop assignment' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );

    await expect(readApiError(response, '/stock')).resolves.toBe(
      'Access denied while loading /stock: FPS identity has no active shop assignment'
    );
  });
});
