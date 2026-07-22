import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataSourceMode, usesMockData } from '../src/data-source.js';

describe('data source mode', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to API mode when env is unset', () => {
    vi.stubEnv('VITE_DATA_SOURCE', '');
    expect(getDataSourceMode()).toBe('api');
  });

  it('does not silently substitute fixtures when the API is offline', () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'api');
    expect(usesMockData(true)).toBe(false);
    expect(usesMockData(false)).toBe(false);
  });

  it('uses fixtures only when mock mode is selected explicitly', () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'mock');
    expect(usesMockData(true)).toBe(true);
    expect(usesMockData(false)).toBe(true);
  });
});
