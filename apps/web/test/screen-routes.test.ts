import { describe, expect, it } from 'vitest';
import { screenDefinitions } from '../src/demo-model.js';
import { routeToScreen, screenPath, screenRoutes } from '../src/lib/screen-routes.js';

describe('screen routes', () => {
  it('maps every demo screen to a unique path segment', () => {
    const segments = screenDefinitions.map((definition) => screenRoutes[definition.id]);
    expect(new Set(segments).size).toBe(screenDefinitions.length);
    expect(segments.every((segment) => segment.length > 0 && !segment.includes('/'))).toBe(true);
  });

  it('round-trips screen ids through their path segments', () => {
    for (const definition of screenDefinitions) {
      expect(routeToScreen(screenRoutes[definition.id])).toBe(definition.id);
    }
    expect(routeToScreen('nope')).toBeUndefined();
  });

  it('builds paths that preserve the search string', () => {
    expect(screenPath('audit-alerts', '?role=AUDITOR')).toEqual({
      pathname: '/audit',
      search: '?role=AUDITOR'
    });
    expect(screenPath('dashboard')).toEqual({ pathname: '/dashboard', search: '' });
  });
});
