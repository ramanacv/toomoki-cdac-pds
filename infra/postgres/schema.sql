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

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  stakeholder_id TEXT REFERENCES stakeholders(stakeholder_id),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS stock_positions (
  stock_position_id BIGSERIAL PRIMARY KEY,
  stakeholder_id TEXT NOT NULL,
  commodity TEXT NOT NULL,
  quantity_kg INTEGER NOT NULL,
  lot_id TEXT,
  month TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stakeholder_id, commodity, lot_id, month)
);

CREATE TABLE IF NOT EXISTS transfer_orders (
  transfer_id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES commodity_lots(lot_id),
  from_org TEXT NOT NULL,
  to_org TEXT NOT NULL,
  dispatched_qty_kg INTEGER NOT NULL CHECK (dispatched_qty_kg > 0),
  received_qty_kg INTEGER,
  shortage_qty_kg INTEGER,
  vehicle_no TEXT NOT NULL,
  status TEXT NOT NULL,
  dispatch_timestamp TIMESTAMPTZ NOT NULL,
  receive_timestamp TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fps_allocations (
  allocation_id TEXT PRIMARY KEY,
  fps_id TEXT NOT NULL,
  commodity TEXT NOT NULL,
  allocated_qty_kg INTEGER NOT NULL CHECK (allocated_qty_kg > 0),
  received_qty_kg INTEGER,
  month TEXT NOT NULL,
  source_godown_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beneficiary_registry_mock (
  beneficiary_ref_hash TEXT PRIMARY KEY,
  name_masked TEXT NOT NULL,
  district TEXT NOT NULL,
  ration_card_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ration_cards_mock (
  ration_card_hash TEXT PRIMARY KEY,
  household_size INTEGER NOT NULL CHECK (household_size > 0),
  district TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_entitlements (
  monthly_entitlement_id BIGSERIAL PRIMARY KEY,
  ration_card_hash TEXT NOT NULL REFERENCES ration_cards_mock(ration_card_hash),
  commodity TEXT NOT NULL,
  month TEXT NOT NULL,
  monthly_entitlement_kg INTEGER NOT NULL CHECK (monthly_entitlement_kg > 0),
  already_lifted_kg INTEGER NOT NULL DEFAULT 0,
  available_balance_kg INTEGER NOT NULL CHECK (available_balance_kg >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (ration_card_hash, commodity, month)
);

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

CREATE TABLE IF NOT EXISTS distribution_transactions (
  distribution_id TEXT PRIMARY KEY,
  fps_id TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS ledger_tx_index (
  ledger_tx_index_id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  ledger_tx_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);

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

CREATE TABLE IF NOT EXISTS smartpds_integration_logs (
  integration_log_id BIGSERIAL PRIMARY KEY,
  source_system TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_events (
  ledger_event_id BIGSERIAL PRIMARY KEY,
  ledger_tx_id TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL
);
