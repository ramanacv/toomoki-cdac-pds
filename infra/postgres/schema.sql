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

-- Additive demo geography / FPS dealer display fields (controlled PoC only).
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS dealer_name TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS dealer_id TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS shop_no TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS block_name TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS tehsil_name TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS location_text TEXT;

CREATE INDEX IF NOT EXISTS idx_stakeholders_status ON stakeholders (status);
CREATE INDEX IF NOT EXISTS idx_stakeholders_type_district ON stakeholders (stakeholder_type, district);
CREATE INDEX IF NOT EXISTS idx_stakeholders_block_tehsil ON stakeholders (block_name, tehsil_name);

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

CREATE TABLE IF NOT EXISTS authorization_subjects (
  subject_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subject_role_assignments (
  subject_id TEXT NOT NULL REFERENCES authorization_subjects(subject_id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  PRIMARY KEY (subject_id, role)
);

CREATE TABLE IF NOT EXISTS subject_scope_assignments (
  assignment_id BIGSERIAL PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES authorization_subjects(subject_id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('ORGANIZATION', 'GEOGRAPHY', 'STAKEHOLDER', 'FPS', 'FACILITY')),
  scope_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  UNIQUE (subject_id, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS integration_source_assignments (
  subject_id TEXT NOT NULL REFERENCES authorization_subjects(subject_id) ON DELETE CASCADE,
  source_system TEXT NOT NULL,
  endpoint_family TEXT NOT NULL,
  event_type TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (subject_id, source_system, endpoint_family, event_type)
);

CREATE TABLE IF NOT EXISTS integration_credentials (
  credential_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES authorization_subjects(subject_id) ON DELETE CASCADE,
  credential_fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_role_active ON subject_role_assignments (subject_id, active);
CREATE INDEX IF NOT EXISTS idx_subject_scope_active ON subject_scope_assignments (subject_id, scope_type, active);
CREATE INDEX IF NOT EXISTS idx_integration_source_subject_active ON integration_source_assignments (subject_id, active);

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

ALTER TABLE commodity_lots ADD COLUMN IF NOT EXISTS root_lot_id TEXT REFERENCES commodity_lots(lot_id);
ALTER TABLE commodity_lots ADD COLUMN IF NOT EXISTS parent_lot_id TEXT REFERENCES commodity_lots(lot_id);
ALTER TABLE commodity_lots ADD COLUMN IF NOT EXISTS original_quantity_kg INTEGER CHECK (original_quantity_kg >= 0);
ALTER TABLE commodity_lots ADD COLUMN IF NOT EXISTS remaining_quantity_kg INTEGER CHECK (remaining_quantity_kg >= 0);
ALTER TABLE commodity_lots ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'KG' CHECK (unit = 'KG');
ALTER TABLE commodity_lots ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_commodity_lots_root ON commodity_lots (root_lot_id);
CREATE INDEX IF NOT EXISTS idx_commodity_lots_parent ON commodity_lots (parent_lot_id);

CREATE TABLE IF NOT EXISTS stock_positions (
  stock_position_id BIGSERIAL PRIMARY KEY,
  stakeholder_id TEXT NOT NULL REFERENCES stakeholders(stakeholder_id) ON DELETE CASCADE,
  commodity TEXT NOT NULL,
  quantity_kg INTEGER NOT NULL,
  lot_id TEXT,
  month TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (stakeholder_id, commodity, lot_id, month)
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
  receive_timestamp TIMESTAMPTZ,
  stage TEXT CHECK (stage IN ('I', 'II')),
  ro_ref TEXT,
  authorized_by TEXT REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  authorized_at TIMESTAMPTZ,
  approval_status TEXT CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'BLOCKED')),
  transporter_id TEXT REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  transporter_name TEXT,
  transformed_from_lot_id TEXT REFERENCES commodity_lots(lot_id) ON DELETE RESTRICT
);

ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS stage TEXT CHECK (stage IN ('I', 'II'));
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS ro_ref TEXT;
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS authorized_by TEXT REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT;
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ;
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS approval_status TEXT CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'BLOCKED'));
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS transporter_id TEXT REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT;
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS transporter_name TEXT;
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS transformed_from_lot_id TEXT REFERENCES commodity_lots(lot_id) ON DELETE RESTRICT;

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
  shortage_qty_kg INTEGER,
  month TEXT NOT NULL,
  source_godown_id TEXT NOT NULL REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  status TEXT NOT NULL,
  transporter_id TEXT REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  transporter_name TEXT,
  vehicle_no TEXT,
  dispatch_timestamp TIMESTAMPTZ,
  receive_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fps_allocations ADD COLUMN IF NOT EXISTS transporter_id TEXT REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT;
ALTER TABLE fps_allocations ADD COLUMN IF NOT EXISTS transporter_name TEXT;
ALTER TABLE fps_allocations ADD COLUMN IF NOT EXISTS vehicle_no TEXT;
ALTER TABLE fps_allocations ADD COLUMN IF NOT EXISTS dispatch_timestamp TIMESTAMPTZ;
ALTER TABLE fps_allocations ADD COLUMN IF NOT EXISTS receive_timestamp TIMESTAMPTZ;

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

CREATE TABLE IF NOT EXISTS eligibility_cases (
  case_id TEXT PRIMARY KEY,
  demo_beneficiary_id TEXT NOT NULL,
  subject_ref_hash TEXT NOT NULL,
  ration_card_hash TEXT NOT NULL REFERENCES ration_cards_mock(ration_card_hash) ON DELETE RESTRICT,
  screening_status TEXT NOT NULL CHECK (screening_status IN (
    'CLEAR', 'DEATH_MATCH_REVIEW', 'INACTIVITY_REVIEW', 'PORTABILITY_ACTIVITY_FOUND',
    'ECONOMIC_ELIGIBILITY_REVIEW', 'LANDHOLDING_REVIEW', 'MULTI_SOURCE_CONFLICT',
    'DUPLICATE_RECORD_REVIEW'
  )),
  evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  policy_id TEXT NOT NULL,
  rule_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  state TEXT NOT NULL CHECK (state IN (
    'OPEN', 'AWAITING_DATA', 'AWAITING_FIELD_VERIFICATION', 'NOTICE_ISSUED', 'REVIEW_READY',
    'RECOMMENDED_ELIGIBLE', 'RECOMMENDED_INELIGIBLE', 'DECIDED', 'APPEALED',
    'REINSTATED', 'CLOSED', 'QUARANTINED'
  )),
  decision TEXT CHECK (decision IS NULL OR decision IN (
    'NO_CHANGE', 'MEMBER_REMOVED', 'HOUSEHOLD_SIZE_RECALCULATED', 'TRANSFER_REQUIRED',
    'TEMPORARILY_SUSPENDED', 'CARD_CANCELLED', 'REINSTATED'
  )),
  rcms_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (rcms_status IN ('ACTIVE', 'SUSPENDED', 'CANCELLED')),
  entitlement_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  household_size INTEGER NOT NULL CHECK (household_size > 0),
  monthly_rice_entitlement_kg INTEGER NOT NULL CHECK (monthly_rice_entitlement_kg > 0),
  version INTEGER NOT NULL DEFAULT 1,
  proof_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (proof_status IN ('NOT_REQUIRED', 'PENDING', 'COMMITTED', 'FAILED', 'DEAD_LETTER')),
  proof_event_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE eligibility_cases DROP CONSTRAINT IF EXISTS eligibility_cases_screening_status_check;
ALTER TABLE eligibility_cases ADD CONSTRAINT eligibility_cases_screening_status_check CHECK (screening_status IN (
  'CLEAR', 'DEATH_MATCH_REVIEW', 'INACTIVITY_REVIEW', 'PORTABILITY_ACTIVITY_FOUND',
  'ECONOMIC_ELIGIBILITY_REVIEW', 'LANDHOLDING_REVIEW', 'MULTI_SOURCE_CONFLICT',
  'DUPLICATE_RECORD_REVIEW'
));
ALTER TABLE eligibility_cases ADD COLUMN IF NOT EXISTS screening JSONB;
ALTER TABLE eligibility_cases ADD COLUMN IF NOT EXISTS already_lifted_kg INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_eligibility_case_active_beneficiary
  ON eligibility_cases (demo_beneficiary_id)
  WHERE state NOT IN ('CLOSED', 'REINSTATED');
CREATE INDEX IF NOT EXISTS idx_eligibility_cases_state ON eligibility_cases (state, updated_at);
CREATE INDEX IF NOT EXISTS idx_eligibility_cases_card ON eligibility_cases (ration_card_hash);

CREATE TABLE IF NOT EXISTS eligibility_case_actions (
  action_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES eligibility_cases(case_id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  action_type TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  outcome_code TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  actor_ref TEXT NOT NULL,
  prior_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  case_version INTEGER NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE eligibility_case_actions ADD COLUMN IF NOT EXISTS case_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_eligibility_actions_case ON eligibility_case_actions (case_id, occurred_at);

CREATE TABLE IF NOT EXISTS eligibility_screenings (
  screening_request_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  demo_beneficiary_id TEXT NOT NULL,
  response JSONB NOT NULL,
  case_id TEXT REFERENCES eligibility_cases(case_id) ON DELETE SET NULL,
  entitlement_preserved BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eligibility_screenings_beneficiary
  ON eligibility_screenings (demo_beneficiary_id, created_at);

CREATE TABLE IF NOT EXISTS beneficiary_registry_projection (
  beneficiary_ref_hash TEXT PRIMARY KEY,
  ration_card_hash TEXT NOT NULL,
  district_code TEXT NOT NULL,
  household_size INTEGER NOT NULL CHECK (household_size >= 0),
  state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'UNDER_REVIEW', 'SUSPENDED', 'DEACTIVATED')),
  version INTEGER NOT NULL CHECK (version > 0),
  last_event_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  proof_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (proof_status IN ('PENDING', 'COMMITTED', 'FAILED', 'DEAD_LETTER'))
);

CREATE INDEX IF NOT EXISTS idx_beneficiary_registry_projection_state
  ON beneficiary_registry_projection (state, district_code);

CREATE TABLE IF NOT EXISTS beneficiary_lifecycle_events (
  event_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  beneficiary_ref_hash TEXT NOT NULL,
  ration_card_hash TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'BENEFICIARY_CREATED', 'MEMBER_ADDED', 'MEMBER_REMOVED', 'HOUSEHOLD_BIFURCATED',
    'MIGRATION_RECORDED', 'CARD_TRANSFERRED', 'VERIFICATION_COMPLETED',
    'STATUS_CHANGED', 'RECORD_DEACTIVATED'
  )),
  source_system TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  reason_code TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  event_payload JSONB NOT NULL,
  projection_snapshot JSONB NOT NULL,
  proof_event_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beneficiary_lifecycle_subject
  ON beneficiary_lifecycle_events (beneficiary_ref_hash, effective_at);
CREATE INDEX IF NOT EXISTS idx_beneficiary_lifecycle_type
  ON beneficiary_lifecycle_events (event_type, effective_at);

CREATE TABLE IF NOT EXISTS auth_transactions (
  auth_txn_id TEXT PRIMARY KEY,
  fps_id TEXT REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT,
  operator_ref TEXT,
  beneficiary_ref_hash TEXT NOT NULL,
  ration_card_hash TEXT NOT NULL,
  auth_mode TEXT NOT NULL,
  auth_result TEXT NOT NULL,
  auth_txn_ref_hash TEXT NOT NULL,
  approved_by TEXT,
  timestamp TIMESTAMPTZ NOT NULL
);

ALTER TABLE auth_transactions ADD COLUMN IF NOT EXISTS fps_id TEXT REFERENCES stakeholders(stakeholder_id) ON DELETE RESTRICT;
ALTER TABLE auth_transactions ADD COLUMN IF NOT EXISTS operator_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_auth_transactions_fps ON auth_transactions (fps_id);
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
CREATE INDEX IF NOT EXISTS idx_distribution_transactions_commodity_timestamp ON distribution_transactions (commodity, timestamp);
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

CREATE TABLE IF NOT EXISTS integration_events (
  integration_event_id BIGSERIAL PRIMARY KEY,
  source_system TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  device_sync_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  approved_payload_hash TEXT NOT NULL CHECK (approved_payload_hash ~ '^[a-f0-9]{64}$'),
  operation_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ACCEPTED', 'QUARANTINED', 'PROCESSED', 'RECONCILED', 'REJECTED')),
  endpoint_family TEXT NOT NULL,
  normalized_payload JSONB NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  parent_source_event_id TEXT,
  amendment_of_source_event_id TEXT,
  reversal_of_source_event_id TEXT,
  UNIQUE (source_system, source_event_id)
);

CREATE TABLE IF NOT EXISTS integration_event_attempts (
  integration_event_attempt_id BIGSERIAL PRIMARY KEY,
  source_system TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  approved_payload_hash TEXT NOT NULL CHECK (approved_payload_hash ~ '^[a-f0-9]{64}$'),
  disposition TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_events_status_ingested ON integration_events (status, ingested_at);
CREATE INDEX IF NOT EXISTS idx_integration_events_source_status ON integration_events (source_system, status);
CREATE INDEX IF NOT EXISTS idx_integration_events_parent ON integration_events (source_system, parent_source_event_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_entity ON integration_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_integration_event_attempts_source ON integration_event_attempts (source_system, attempted_at);

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

CREATE TABLE IF NOT EXISTS ledger_outbox (
  outbox_id BIGSERIAL PRIMARY KEY,
  event_payload JSONB NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ledger_outbox ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE ledger_outbox ADD COLUMN IF NOT EXISTS operation_id TEXT;
ALTER TABLE ledger_outbox ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE ledger_outbox ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ledger_outbox ADD COLUMN IF NOT EXISTS fabric_tx_id TEXT;
ALTER TABLE ledger_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE ledger_outbox ADD COLUMN IF NOT EXISTS submitting_at TIMESTAMPTZ;
ALTER TABLE ledger_outbox ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ;
ALTER TABLE ledger_outbox ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_outbox_event_id ON ledger_outbox(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_outbox_idempotency_key ON ledger_outbox(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_outbox_ready ON ledger_outbox(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS workflow_instances (
  workflow_id TEXT PRIMARY KEY, template_id TEXT NOT NULL, template_version INTEGER NOT NULL,
  current_state TEXT NOT NULL, related_entity_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT, version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workflow_transitions (
  transition_id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflow_instances(workflow_id),
  from_state TEXT NOT NULL, to_state TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
  actor_subject TEXT NOT NULL, actor_role TEXT NOT NULL, failure_reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_workflow ON workflow_transitions(workflow_id, occurred_at);

CREATE TABLE IF NOT EXISTS lot_movements (
  movement_id TEXT PRIMARY KEY, source_lot_id TEXT NOT NULL REFERENCES commodity_lots(lot_id),
  child_lot_id TEXT NOT NULL UNIQUE REFERENCES commodity_lots(lot_id), quantity_kg INTEGER NOT NULL CHECK(quantity_kg > 0),
  from_stakeholder_id TEXT NOT NULL REFERENCES stakeholders(stakeholder_id),
  to_stakeholder_id TEXT NOT NULL REFERENCES stakeholders(stakeholder_id), status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS quantity_adjustments (
  adjustment_id TEXT PRIMARY KEY, movement_id TEXT REFERENCES lot_movements(movement_id),
  lot_id TEXT NOT NULL REFERENCES commodity_lots(lot_id), quantity_kg INTEGER NOT NULL CHECK(quantity_kg > 0),
  reason TEXT NOT NULL, investigation_id TEXT, created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lot_movements_source ON lot_movements(source_lot_id);
CREATE INDEX IF NOT EXISTS idx_quantity_adjustments_lot ON quantity_adjustments(lot_id);

CREATE INDEX IF NOT EXISTS idx_ledger_outbox_status ON ledger_outbox (status);
CREATE INDEX IF NOT EXISTS idx_ledger_outbox_created_at ON ledger_outbox (created_at);

ALTER TABLE stock_positions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE monthly_entitlements ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_ledger_outbox_status_created ON ledger_outbox (status, created_at);

-- Repair duplicate stock_positions created when UNIQUE treated NULL months as
-- distinct, then enforce NULLS NOT DISTINCT so seed re-apply cannot multiply rows.
-- Prefer the newest updated_at (then highest id) when quantities diverge.
DELETE FROM stock_positions a
 USING stock_positions b
 WHERE a.stock_position_id <> b.stock_position_id
   AND a.stakeholder_id = b.stakeholder_id
   AND a.commodity = b.commodity
   AND a.lot_id IS NOT DISTINCT FROM b.lot_id
   AND a.month IS NOT DISTINCT FROM b.month
   AND (
     a.updated_at < b.updated_at
     OR (a.updated_at = b.updated_at AND a.stock_position_id < b.stock_position_id)
   );

-- Legacy lot-/month-scoped seed copies are not the operational Available-stock grain.
DELETE FROM stock_positions WHERE lot_id IS NOT NULL OR month IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE stock_positions DROP CONSTRAINT IF EXISTS stock_positions_stakeholder_id_commodity_lot_id_month_key;
  ALTER TABLE stock_positions
    ADD CONSTRAINT stock_positions_stakeholder_id_commodity_lot_id_month_key
    UNIQUE NULLS NOT DISTINCT (stakeholder_id, commodity, lot_id, month);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;
