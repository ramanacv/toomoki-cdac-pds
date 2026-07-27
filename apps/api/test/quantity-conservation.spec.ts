import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDurableLift,
  entitlementMonthFromTimestamp,
  sumDeliveredKg
} from '../src/modules/core/entitlement-lift.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const schema = readFileSync(join(root, 'infra/postgres/schema.sql'), 'utf8');
const seed = readFileSync(join(root, 'infra/postgres/seed.sql'), 'utf8');
const runtime = readFileSync(join(root, 'apps/api/src/modules/core/pds-runtime.ts'), 'utf8');
const adapter = readFileSync(join(root, 'apps/api/src/infrastructure/postgres-adapter.ts'), 'utf8');
const snapshot = readFileSync(join(root, 'apps/api/src/infrastructure/postgres-snapshot.ts'), 'utf8');

describe('quantity conservation guards', () => {
  it('lists and sums only org-grain stock (lot_id/month NULL)', () => {
    expect(runtime).toMatch(
      /listStockPositions[\s\S]*WHERE lot_id IS NULL AND month IS NULL/
    );
    expect(runtime).toMatch(
      /getDashboardSummary[\s\S]*FROM stock_positions\s+WHERE lot_id IS NULL AND month IS NULL/
    );
    expect(adapter).toMatch(
      /FROM stock_positions\s+WHERE lot_id IS NULL AND month IS NULL/
    );
  });

  it('seeds org-grain stock only and deletes legacy lot-scoped rows', () => {
    expect(seed).toContain("('FCI-001', 'Dal', 2000, NULL, NULL)");
    expect(seed).not.toMatch(/INSERT INTO stock_positions[\s\S]*LOT-DAL-2026-001/);
    expect(seed).toContain('DELETE FROM stock_positions WHERE lot_id IS NOT NULL OR month IS NOT NULL');
  });

  it('repairs NULL-unique stock constraint so duplicates cannot reappear', () => {
    expect(schema).toContain('UNIQUE NULLS NOT DISTINCT (stakeholder_id, commodity, lot_id, month)');
    expect(schema).toContain('DELETE FROM stock_positions WHERE lot_id IS NOT NULL OR month IS NOT NULL');
    expect(schema).toMatch(
      /ADD CONSTRAINT stock_positions_stakeholder_id_commodity_lot_id_month_key\s+UNIQUE NULLS NOT DISTINCT/
    );
    expect(schema).toContain('a.updated_at < b.updated_at');
  });

  it('reconciles entitlement lifts and preloads durable SUM before distribution', () => {
    expect(runtime).toContain('reconcileEntitlementLift');
    expect(runtime).toContain('durableLiftedKg');
    expect(runtime).toContain('applyDurableLift');
    expect(runtime).toContain('entitlementMonthFromTimestamp');
    expect(runtime).toMatch(
      /to_char\(d\.timestamp AT TIME ZONE 'UTC', 'YYYY-MM'\) = \$3/
    );
    expect(snapshot).toContain('GREATEST(monthly_entitlements.already_lifted_kg, EXCLUDED.already_lifted_kg)');
    expect(snapshot).toContain("to_char(d.timestamp AT TIME ZONE 'UTC', 'YYYY-MM')");
  });
});

describe('entitlement lift helpers (behavioral)', () => {
  it('buckets months in UTC like the domain engine', () => {
    expect(entitlementMonthFromTimestamp('2026-07-15T10:00:00.000Z')).toBe('2026-07');
    expect(entitlementMonthFromTimestamp('2026-06-30T23:30:00.000Z')).toBe('2026-06');
    expect(entitlementMonthFromTimestamp('2026-07-01T00:30:00+05:30')).toBe('2026-06');
  });

  it('raises under-reported lifts to durable issued kg before balance checks', () => {
    const aligned = applyDurableLift(
      {
        rationCardHash: 'demo-ration-card-hash',
        commodity: 'Rice',
        month: '2026-07',
        monthlyEntitlementKg: 25,
        alreadyLiftedKg: 1,
        availableBalanceKg: 24,
        active: true
      },
      29
    );
    expect(aligned.alreadyLiftedKg).toBe(29);
    expect(aligned.availableBalanceKg).toBe(0);
  });

  it('blocks further issues when durable lift already exhausts the monthly quota', () => {
    const aligned = applyDurableLift(
      {
        rationCardHash: 'demo-ration-card-hash',
        commodity: 'Rice',
        month: '2026-07',
        monthlyEntitlementKg: 25,
        alreadyLiftedKg: 0,
        availableBalanceKg: 25,
        active: true
      },
      25
    );
    expect(aligned.availableBalanceKg).toBe(0);
    expect(aligned.availableBalanceKg < 1).toBe(true);
  });

  it('sums delivered kg from either snake_case or camelCase rows', () => {
    expect(sumDeliveredKg([{ delivered_kg: 25 }, { deliveredKg: 1 }, { delivered_kg: 1 }])).toBe(27);
  });
});
