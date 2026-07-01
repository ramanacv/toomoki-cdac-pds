import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T6.1 — static schema assertions. A full Postgres integration test (inserting
 * a transfer with a non-existent from_org and expecting an FK violation) needs
 * a real/in-memory postgres, which is not available in this vitest setup. This
 * lightweight static assertion reads schema.sql and verifies the expected
 * CREATE INDEX statements and REFERENCES (FK) constraints are present, which is
 * what enforces the behavior at runtime. Run with a real PG instance to verify
 * enforcement end-to-end (noted as a follow-up).
 */
const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '../../../infra/postgres/schema.sql');
const schema = readFileSync(schemaPath, 'utf8');

describe('postgres schema indexes and foreign keys (T6.1)', () => {
  it('declares the key filter indexes named in the plan', () => {
    const expectedIndexes = [
      'idx_stakeholders_status',
      'idx_commodity_lots_status',
      'idx_commodity_lots_owner_commodity',
      'idx_stock_positions_stakeholder_commodity',
      'idx_stock_positions_month',
      'idx_stock_positions_lot_id',
      'idx_transfer_orders_status',
      'idx_transfer_orders_lot_id',
      'idx_transfer_orders_from_org',
      'idx_transfer_orders_to_org',
      'idx_fps_allocations_status',
      'idx_fps_allocations_fps_month',
      'idx_fps_allocations_source_godown',
      'idx_monthly_entitlements_month',
      'idx_monthly_entitlements_ration_card_month',
      'idx_auth_transactions_ration_card',
      'idx_auth_transactions_timestamp',
      'idx_distribution_transactions_fps',
      'idx_distribution_transactions_commodity_month',
      'idx_ledger_events_entity_id',
      'idx_ledger_events_event_type',
      'idx_ledger_events_timestamp',
      'idx_audit_alerts_status',
      'idx_audit_alerts_entity_id'
    ];
    for (const name of expectedIndexes) {
      expect(schema).toContain(`CREATE INDEX IF NOT EXISTS ${name}`);
    }
  });

  it('declares the foreign keys required for join integrity', () => {
    // stock_positions.stakeholder_id → stakeholders
    expect(schema).toMatch(/stock_positions[\s\S]*REFERENCES stakeholders\(stakeholder_id\)/);
    // transfer_orders.from_org / to_org → stakeholders
    expect(schema).toMatch(/transfer_orders[\s\S]*from_org TEXT NOT NULL REFERENCES stakeholders\(stakeholder_id\)/);
    expect(schema).toMatch(/transfer_orders[\s\S]*to_org TEXT NOT NULL REFERENCES stakeholders\(stakeholder_id\)/);
    // transfer_orders.lot_id → commodity_lots
    expect(schema).toMatch(/transfer_orders[\s\S]*lot_id TEXT NOT NULL REFERENCES commodity_lots\(lot_id\)/);
    // fps_allocations.fps_id / source_godown_id → stakeholders
    expect(schema).toMatch(/fps_allocations[\s\S]*fps_id TEXT NOT NULL REFERENCES stakeholders\(stakeholder_id\)/);
    expect(schema).toMatch(/fps_allocations[\s\S]*source_godown_id TEXT NOT NULL REFERENCES stakeholders\(stakeholder_id\)/);
    // distribution_transactions.fps_id → stakeholders
    expect(schema).toMatch(/distribution_transactions[\s\S]*fps_id TEXT NOT NULL REFERENCES stakeholders\(stakeholder_id\)/);
    // monthly_entitlements.ration_card_hash → ration_cards_mock
    expect(schema).toMatch(/monthly_entitlements[\s\S]*ration_card_hash TEXT NOT NULL REFERENCES ration_cards_mock\(ration_card_hash\)/);
  });

  it('declares CHECK constraints protecting numeric quantities', () => {
    expect(schema).toMatch(/quantity_kg INTEGER NOT NULL CHECK \(quantity_kg > 0\)/);
    expect(schema).toMatch(/dispatched_qty_kg INTEGER NOT NULL CHECK \(dispatched_qty_kg > 0\)/);
    expect(schema).toMatch(/allocated_qty_kg INTEGER NOT NULL CHECK \(allocated_qty_kg > 0\)/);
    expect(schema).toMatch(/delivered_kg INTEGER NOT NULL CHECK \(delivered_kg > 0\)/);
    expect(schema).toMatch(/available_balance_kg INTEGER NOT NULL CHECK \(available_balance_kg >= 0\)/);
  });

  it('retains the users table with a stakeholder FK (reserved for future IAM, not dropped)', () => {
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS users[\s\S]*stakeholder_id TEXT REFERENCES stakeholders\(stakeholder_id\)/);
  });
});
