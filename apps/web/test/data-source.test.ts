import { describe, expect, it } from 'vitest';
import { getDataSourceMode, usesMockData } from '../src/data-source.js';

describe('data source mode', () => {
  it('defaults to auto when env is unset', () => {
    expect(getDataSourceMode()).toBe('auto');
  });

  it('uses fixtures in auto mode only when the API is offline', () => {
    expect(usesMockData(true)).toBe(false);
    expect(usesMockData(false)).toBe(true);
  });
});
