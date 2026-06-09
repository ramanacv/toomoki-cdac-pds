import { describe, expect, it } from 'vitest';
import { hashReference, maskHash, StakeholderType } from '../src/index.js';

describe('shared types', () => {
  it('hashes references deterministically', () => {
    expect(hashReference('abc')).toBe(hashReference('abc'));
  });

  it('masks hashes for display', () => {
    expect(maskHash('1234567890')).toBe('1234****7890');
  });

  it('exposes stakeholder enums', () => {
    expect(StakeholderType.FAIR_PRICE_SHOP).toBe('FAIR_PRICE_SHOP');
  });
});
