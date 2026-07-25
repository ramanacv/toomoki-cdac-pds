import { describe, expect, it } from 'vitest';
import {
  COMMODITIES,
  getCommodityRouteTemplate,
  hashReference,
  maskHash,
  StakeholderType,
  INITIAL_DEMO_SERIES_ID,
  buildSeedLotId,
  buildTransferId,
  buildAllocationId,
  buildDistributionId,
  buildCommodityRouteForSeries,
  seriesIdFromLotId,
  generateResetSeriesId,
  createdAtFromLotId
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
    expect(StakeholderType.BLOCK_GODOWN).toBe('BLOCK_GODOWN');
    expect(StakeholderType.BLOCK_SUPPLY_OFFICE).toBe('BLOCK_SUPPLY_OFFICE');
    expect(StakeholderType.TRANSPORTER).toBe('TRANSPORTER');
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
    expect(kerosene?.legs.map((leg) => leg.toOrg)).toEqual(['GODOWN-S-001', 'GODOWN-B-001']);
    expect(kerosene?.legs.some((leg) => leg.fromOrg === 'GODOWN-S-001' && leg.toOrg === 'GODOWN-B-001')).toBe(true);
    expect(kerosene?.legs.some((leg) => leg.toOrg === 'FPS-101')).toBe(false);
    expect(kerosene?.fpsDelivery?.allocationId).toBe('ALLOC-POC-KEROSENE-FPS');
    expect(kerosene?.fpsDelivery?.sourceGodownId).toBe('GODOWN-B-001');
  });

  it('keeps rice on the canonical block godown to FPS allocation path', () => {
    const rice = getCommodityRouteTemplate('Rice');

    expect(rice?.legs.map((leg) => leg.toOrg)).toEqual([
      'GODOWN-S-001',
      'GODOWN-B-001'
    ]);
    expect(rice?.requiresTransformation).toBe(false);
    expect(rice?.fpsDelivery?.fpsId).toBe('FPS-101');
    expect(rice?.fpsDelivery?.sourceGodownId).toBe('GODOWN-B-001');
  });
});

describe('reset series id helpers', () => {
  it('builds POC bootstrap ids matching fixtures', () => {
    expect(buildSeedLotId('KEROSENE', INITIAL_DEMO_SERIES_ID)).toBe('LOT-KEROSENE-2026-001');
    expect(buildTransferId(INITIAL_DEMO_SERIES_ID, 'KEROSENE', 'FCI-DEPOT')).toBe('TR-POC-KEROSENE-FCI-DEPOT');
    expect(buildTransferId(INITIAL_DEMO_SERIES_ID, 'KEROSENE', 'DEPOT-BLOCK')).toBe('TR-POC-KEROSENE-DEPOT-BLOCK');
    expect(buildAllocationId(INITIAL_DEMO_SERIES_ID, 'KEROSENE')).toBe('ALLOC-POC-KEROSENE-FPS');
    expect(buildDistributionId(INITIAL_DEMO_SERIES_ID, 'RICE', '001')).toBe('DIST-POC-001');
  });

  it('builds unique series-scoped ids after reset', () => {
    const seriesId = 'R20260710-165432-ab12';
    expect(buildSeedLotId('KEROSENE', seriesId)).toBe('LOT-KEROSENE-R20260710-165432-ab12-001');
    expect(buildTransferId(seriesId, 'KEROSENE', 'FCI-DEPOT')).toBe('TR-R20260710-165432-ab12-KEROSENE-FCI-DEPOT');
    expect(seriesIdFromLotId('LOT-KEROSENE-R20260710-165432-ab12-001')).toBe(seriesId);
    expect(seriesIdFromLotId('LOT-RICE-2026-001')).toBe(INITIAL_DEMO_SERIES_ID);
  });

  it('clones commodity routes onto a new series', () => {
    const route = buildCommodityRouteForSeries('Kerosene', 'R20260710-165432-ab12');
    expect(route?.sourceLotId).toBe('LOT-KEROSENE-R20260710-165432-ab12-001');
    expect(route?.legs[0]?.id).toBe('TR-R20260710-165432-ab12-KEROSENE-FCI-DEPOT');
    expect(route?.legs[1]?.id).toBe('TR-R20260710-165432-ab12-KEROSENE-DEPOT-BLOCK');
    expect(route?.fpsDelivery?.allocationId).toBe('ALLOC-R20260710-165432-ab12-KEROSENE-FPS');
  });

  it('derives a readable created time from reset series lot ids', () => {
    expect(createdAtFromLotId('LOT-KEROSENE-R20260710-165432-ab12-001')).toBe('2026-07-10T16:54:32.000Z');
    expect(createdAtFromLotId('LOT-RICE-2026-001')).toBeUndefined();
  });

  it('generates distinct series ids', () => {
    const a = generateResetSeriesId(new Date('2026-07-10T11:00:00.000Z'), 'aaaa');
    const b = generateResetSeriesId(new Date('2026-07-10T11:00:00.000Z'), 'bbbb');
    expect(a).not.toBe(b);
    expect(a.startsWith('R20260710-110000-')).toBe(true);
  });
});
