import { describe, expect, it } from 'vitest';
import {
  COMMODITIES,
  getCommodityRouteTemplate,
  hashReference,
  maskHash,
  StakeholderType
} from '../src/index.js';

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

  it('exposes the supported commodity catalog', () => {
    expect(COMMODITIES.map((commodity) => commodity.name)).toEqual([
      'Rice',
      'Wheat',
      'Dal',
      'Sugar',
      'Cooking Oil',
      'Kerosene'
    ]);
  });

  it('defines canonical routes for oil and kerosene without commodity-specific processing', () => {
    const kerosene = getCommodityRouteTemplate('Kerosene');
    const oil = getCommodityRouteTemplate('Cooking Oil');

    expect(kerosene?.requiresTransformation).toBe(false);
    expect(oil?.requiresTransformation).toBe(false);
    expect(kerosene?.legs.map((leg) => leg.toOrg)).toEqual(['FCI-001', 'GODOWN-S-001', 'ISSUE-001']);
    expect(kerosene?.legs.some((leg) => leg.fromOrg === 'GODOWN-S-001' && leg.toOrg === 'ISSUE-001')).toBe(true);
    expect(kerosene?.legs.some((leg) => leg.toOrg === 'FPS-101')).toBe(false);
    expect(kerosene?.fpsDelivery?.allocationId).toBe('ALLOC-POC-KEROSENE-FPS');
  });

  it('keeps rice on the canonical issue point to FPS allocation path', () => {
    const rice = getCommodityRouteTemplate('Rice');

    expect(rice?.legs.map((leg) => leg.toOrg)).toEqual([
      'FCI-001',
      'GODOWN-S-001',
      'ISSUE-001'
    ]);
    expect(rice?.requiresTransformation).toBe(false);
    expect(rice?.fpsDelivery?.fpsId).toBe('FPS-101');
  });
});
