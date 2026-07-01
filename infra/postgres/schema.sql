-- =============================================================================
-- PDS PostgreSQL schema.
-- Indexes and foreign keys added in T6.1 to support the API's query patterns
-- (filtering by status / month / entity_id and joins across stakeholders).
-- =============================================================================

CREATE TABLE IF NOT EXISTS stakeholders (
  stakeholder_id TEXT PRIMARY KEY,
  stakeholder_type TEXT NOT NULL,
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  license_no TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stakeholders_status ON stakeholders (status);
CREATE INDEX IF NOT EXISTS idx_stakeholders_type_district ON stakeholders (stakeholder_type, district);

-- `users` is reserved for a future IAM-backed login flow. The MVP enforcement
-- layer (T2.5) uses a stub IdentityProvider; this table is intentionally not
-- seeded by the app. Retained (not dropped) so production JWT verifiers can map
-- authenticated subjects to stakeholders without a migration.
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  stakeholder_id TEXT REFERENCES stakeholders(stakeholder_id) ON DELETE SET NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_stakeholder_id ON users (stakeholder_id);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);

CREATE TABLE IF NOT EXISTS commodity_lots (
  lot_id TEXT PRIMARY KEY,
  commodity TEXT NOT NULL,
  season TEXT NOT NULL,
  quantity_kg INTEGER NOT NULL CHECK (quantity_kg > 0),
  quality_grade TEXT NOT NULL,
  source TEXT NOT NULL,
  current_owner TEXT NOT NULL,
  current_location TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commodity_lots_status ON commodity_lots (status);
CREATE INDEX IF NOT EXISTS idx_commodity_lots_owner_commodity ON commodity_lots (current_owner, commodity);
CREATE INDEX IF NOT EXISTS idx_commodity_lots_commodity_season ON commodity_lots (commodity, season);

CREATE TABLE IF NOT EXISTS stock_positions (
  stock_position_id BIGSERIAL PRIMARY KEY,
  stakeholder_id TEXT NOT NULL REFERENCES stakeholders(stakeholder_id) ON DELETE CASCADE,
  commodity TEXT NOT NULL,
  quantity_kg INTEGER NOT NULL,
  lot_id TEXT,
  month TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stakeholder_id, commodity, lot_id, month)
);

CREATE INDEX IF NOT EXISTS idx_stock_positions_stakeholder_commodity ON stock_positions (stakeholder_id, commodity);
CREATE INDEX IF NOT EXISTS idx_stock_positions_month ON stock_positions (month);
CREATE INDEX IF NOT EXISTS idx_stock_positions_lot_id ON stock_positions (lot_id);

CREATE TABLE IF NOT EXISTS transfer_orders (
  transfer_id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES commodity_lots(lot_id) ON DELETE CASCADE,
  from_org TEXT NOT NULL REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  to_org TEXT NOT NULL REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  dispatched_qty_kg INTEGER NOT NULL CHECK (dispatched_qty_kg > 0),
  received_qty_kg INTEGER,
  shortage_qty_kg INTEGER,
  vehicle_no TEXT NOT NULL,
  status TEXT NOT NULL,
  dispatch_timestamp TIMESTAMPTZ NOT NULL,
  receive_timestamp TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transfer_orders_status ON transfer_orders (status);
CREATE INDEX IF NOT EXISTS idx_transfer_orders_lot_id ON transfer_orders (lot_id);
CREATE INDEX IF NOT EXISTS idx_transfer_orders_from_org ON transfer_orders (from_org);
CREATE INDEX IF NOT EXISTS idx_transfer_orders_to_org ON transfer_orders (to_org);
CREATE INDEX IF NOT EXISTS idx_transfer_orders_dispatch_ts ON transfer_orders (dispatch_timestamp);

CREATE TABLE IF NOT EXISTS fps_allocations (
  allocation_id TEXT PRIMARY KEY,
  fps_id TEXT NOT NULL REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  commodity TEXT NOT NULL,
  allocated_qty_kg INTEGER NOT NULL CHECK (allocated_qty_kg > 0),
  received_qty_kg INTEGER,
  month TEXT NOT NULL,
  source_godown_id TEXT NOT NULL REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fps_allocations_status ON fps_allocations (status);
CREATE INDEX IF NOT EXISTS idx_fps_allocations_fps_month ON fps_allocations (fps_id, month);
CREATE INDEX IF NOT EXISTS idx_fps_allocations_source_godown ON fps_allocations (source_godown_id);
CREATE INDEX IF NOT EXISTS idx_fps_allocations_commodity_month ON fps_allocations (commodity, month);

CREATE TABLE IF NOT EXISTS beneficiary_registry_mock (
  beneficiary_ref_hash TEXT PRIMARY KEY,
  name_masked TEXT NOT NULL,
  district TEXT NOT NULL,
  ration_card_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_beneficiary_registry_active ON beneficiary_registry_mock (active);
CREATE INDEX IF NOT EXISTS idx_beneficiary_registry_ration_card ON beneficiary_registry_mock (ration_card_hash);

CREATE TABLE IF NOT EXISTS ration_cards_mock (
  ration_card_hash TEXT PRIMARY KEY,
  household_size INTEGER NOT NULL CHECK (household_size > 0),
  district TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ration_cards_status ON ration_cards_mock (status);
CREATE INDEX IF NOT EXISTS idx_ration_cards_district ON ration_cards_mock (district);

CREATE TABLE IF NOT EXISTS monthly_entitlements (
  monthly_entitlement_id BIGSERIAL PRIMARY KEY,
  ration_card_hash TEXT NOT NULL REFERENCES ration_cards_mock(ration_card_hash) ON DELETE CASCADE,
  commodity TEXT NOT NULL,
  month TEXT NOT NULL,
  monthly_entitlement_kg INTEGER NOT NULL CHECK (monthly_entitlement_kg > 0),
  already_lifted_kg INTEGER NOT NULL DEFAULT 0,
  available_balance_kg INTEGER NOT NULL CHECK (available_balance_kg >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (ration_card_hash, commodity, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_entitlements_month ON monthly_entitlements (month);
CREATE INDEX IF NOT EXISTS idx_monthly_entitlements_active ON monthly_entitlements (active);
CREATE INDEX IF NOT EXISTS idx_monthly_entitlements_ration_card_month ON monthly_entitlements (ration_card_hash, month);

CREATE TABLE IF NOT EXISTS auth_transactions (
  auth_txn_id TEXT PRIMARY KEY,
  beneficiary_ref_hash TEXT NOT NULL,
  ration_card_hash TEXT NOT NULL,
  auth_mode TEXT NOT NULL,
  auth_result TEXT NOT NULL,
  auth_txn_ref_hash TEXT NOT NULL,
  approved_by TEXT,
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_transactions_ration_card ON auth_transactions (ration_card_hash);
CREATE INDEX IF NOT EXISTS idx_auth_transactions_beneficiary_ref ON auth_transactions (beneficiary_ref_hash);
CREATE INDEX IF NOT EXISTS idx_auth_transactions_auth_result ON auth_transactions (auth_result);
CREATE INDEX IF NOT EXISTS idx_auth_transactions_timestamp ON auth_transactions (timestamp);

CREATE TABLE IF NOT EXISTS distribution_transactions (
  distribution_id TEXT PRIMARY KEY,
  fps_id TEXT NOT NULL REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  ration_card_hash TEXT NOT NULL,
  beneficiary_ref_hash TEXT NOT NULL,
  commodity TEXT NOT NULL,
  delivered_kg INTEGER NOT NULL CHECK (delivered_kg > 0),
  auth_mode TEXT NOT NULL,
  auth_result TEXT NOT NULL,
  auth_txn_ref_hash TEXT NOT NULL,
  dealer_id TEXT NOT NULL,
  ledger_tx_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_distribution_transactions_fps ON distribution_transactions (fps_id);
CREATE INDEX IF NOT EXISTS idx_distribution_transactions_ration_card ON distribution_transactions (ration_card_hash);
CREATE INDEX IF NOT EXISTS idx_distribution_transactions_beneficiary_ref ON distribution_transactions (beneficiary_ref_hash);
CREATE INDEX IF NOT EXISTS idx_distribution_transactions_commodity_month ON distribution_transactions (commodity, date_trunc('month', timestamp));
CREATE INDEX IF NOT EXISTS idx_distribution_transactions_timestamp ON distribution_transactions (timestamp);

CREATE TABLE IF NOT EXISTS ledger_tx_index (
  ledger_tx_index_id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  ledger_tx_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_tx_index_entity_id ON ledger_tx_index (entity_id);
CREATE INDEX IF NOT EXISTS idx_ledger_tx_index_entity_type_id ON ledger_tx_index (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS audit_alerts (
  alert_id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_alerts_status ON audit_alerts (status);
CREATE INDEX IF NOT EXISTS idx_audit_alerts_entity_id ON audit_alerts (entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_alerts_type_risk ON audit_alerts (alert_type, risk_level);
CREATE INDEX IF NOT EXISTS idx_audit_alerts_created_at ON audit_alerts (created_at);

CREATE TABLE IF NOT EXISTS smartpds_integration_logs (
  integration_log_id BIGSERIAL PRIMARY KEY,
  source_system TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smartpds_integration_logs_status ON smartpds_integration_logs (status);
CREATE INDEX IF NOT EXISTS idx_smartpds_integration_logs_source_created ON smartpds_integration_logs (source_system, created_at);

CREATE TABLE IF NOT EXISTS ledger_events (
  ledger_event_id BIGSERIAL PRIMARY KEY,
  ledger_tx_id TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_events_entity_id ON ledger_events (entity_id);
CREATE INDEX IF NOT EXISTS idx_ledger_events_entity_type_id ON ledger_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ledger_events_event_type ON ledger_events (event_type);
CREATE INDEX IF NOT EXISTS idx_ledger_events_timestamp ON ledger_events (timestamp);
