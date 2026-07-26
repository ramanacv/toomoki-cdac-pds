-- Generated from mock/entities/stakeholders.json and mock/seed/backend.json
-- Regenerate with: npm run fixtures:sql

INSERT INTO stakeholders (stakeholder_id, stakeholder_type, name, district, license_no, status, dealer_name, dealer_id, shop_no, block_name, tehsil_name, location_text)
VALUES
  ('FCI-001', 'FCI', 'Food Corporation of India', 'Central', 'FCI-POC-001', 'ACTIVE', NULL, NULL, NULL, NULL, NULL, NULL),
  ('DSO-001', 'DISTRICT_SUPPLY_OFFICE', 'District Supply Office', 'Demo District', 'DSO-LIC-001', 'ACTIVE', NULL, NULL, NULL, NULL, NULL, NULL),
  ('BSO-001', 'BLOCK_SUPPLY_OFFICE', 'Block Supply Office · Haveli', 'Demo District', 'BSO-LIC-001', 'ACTIVE', NULL, NULL, NULL, 'Haveli', 'Haveli', NULL),
  ('BSO-002', 'BLOCK_SUPPLY_OFFICE', 'Block Supply Office · Mulshi', 'Demo District', 'BSO-LIC-002', 'ACTIVE', NULL, NULL, NULL, 'Mulshi', 'Mulshi', NULL),
  ('GODOWN-S-001', 'STATE_GODOWN', 'State Government Depot 01', 'Demo District', 'SG-LIC-001', 'ACTIVE', NULL, NULL, NULL, NULL, NULL, NULL),
  ('GODOWN-B-001', 'BLOCK_GODOWN', 'Block Godown 01', 'Demo District', 'BG-LIC-001', 'ACTIVE', NULL, NULL, NULL, NULL, NULL, NULL),
  ('TRANS-001', 'TRANSPORTER', 'Transport Contractor 01', 'Demo District', 'TRANS-LIC-001', 'ACTIVE', NULL, NULL, NULL, NULL, NULL, NULL),
  ('FPS-101', 'FAIR_PRICE_SHOP', 'FPS 101 · Haveli Fair Price Shop', 'Demo District', 'FPS-LIC-101', 'ACTIVE', 'Suresh Jadhav (Fictional)', 'DLR-MH-HAV-101', 'FPS/MH/HAV/101', 'Haveli', 'Haveli', 'Near Gram Panchayat, Village Demo-Haveli, Demo District'),
  ('FPS-202', 'FAIR_PRICE_SHOP', 'FPS 202 · Mulshi Fair Price Shop', 'Demo District', 'FPS-LIC-202', 'ACTIVE', 'Anita Deshmukh (Fictional)', 'DLR-MH-MUL-202', 'FPS/MH/MUL/202', 'Mulshi', 'Mulshi', 'Main Road, Village Demo-Mulshi, Demo District'),
  ('AUD-001', 'AUDITOR', 'Auditor 01', 'Demo District', 'AUD-LIC-001', 'ACTIVE', NULL, NULL, NULL, NULL, NULL, NULL);

INSERT INTO commodity_lots (lot_id, commodity, season, quantity_kg, quality_grade, source, current_owner, current_location, status)
VALUES
  ('LOT-RICE-2026-001', 'Rice', 'Kharif 2026', 10000, 'A', 'FCI Central Depot', 'FCI-001', 'FCI Depot', 'CREATED'),
  ('LOT-WHEAT-2026-001', 'Wheat', 'Rabi 2026', 7000, 'A', 'FCI Central Depot', 'FCI-001', 'FCI Depot', 'CREATED'),
  ('LOT-DAL-2026-001', 'Dal', 'Kharif 2026', 2000, 'A', 'FCI Central Depot', 'FCI-001', 'FCI Depot', 'CREATED'),
  ('LOT-SUGAR-2026-001', 'Sugar', '2026', 2000, 'A', 'FCI Central Depot', 'FCI-001', 'FCI Depot', 'CREATED'),
  ('LOT-COOKING-OIL-2026-001', 'Cooking Oil', '2026', 1000, 'A', 'FCI Central Depot', 'FCI-001', 'FCI Depot', 'CREATED'),
  ('LOT-KEROSENE-2026-001', 'Kerosene', '2026', 1000, 'A', 'FCI Central Depot', 'FCI-001', 'FCI Depot', 'CREATED');

INSERT INTO stock_positions (stakeholder_id, commodity, quantity_kg, lot_id, month)
VALUES
  ('FCI-001', 'Rice', 10000, 'LOT-RICE-2026-001', NULL),
  ('FCI-001', 'Wheat', 7000, 'LOT-WHEAT-2026-001', NULL),
  ('FCI-001', 'Dal', 2000, 'LOT-DAL-2026-001', NULL),
  ('FCI-001', 'Sugar', 2000, 'LOT-SUGAR-2026-001', NULL),
  ('FCI-001', 'Cooking Oil', 1000, 'LOT-COOKING-OIL-2026-001', NULL),
  ('FCI-001', 'Kerosene', 1000, 'LOT-KEROSENE-2026-001', NULL);

INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
VALUES ('demo-ration-card-hash', 5, 'Demo District', 'ACTIVE');

INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
VALUES
  ('ration-card-demo-001-hash', 5, 'MH-DEMO-HAV', 'ACTIVE'),
  ('ration-card-demo-002-hash', 4, 'MH-DEMO-HAV', 'ACTIVE'),
  ('ration-card-demo-003-hash', 3, 'MH-DEMO-HAV', 'ACTIVE'),
  ('ration-card-demo-004-hash', 4, 'MH-DEMO-MUL', 'ACTIVE'),
  ('ration-card-demo-005-hash', 5, 'MH-DEMO-MUL', 'ACTIVE'),
  ('ration-card-jk-demo-001-hash', 5, 'JK-DEMO-01', 'ACTIVE'),
  ('ration-card-jk-demo-002-hash', 4, 'JK-DEMO-02', 'ACTIVE'),
  ('ration-card-jk-demo-003-hash', 6, 'JK-DEMO-03', 'ACTIVE'),
  ('ration-card-jk-demo-004-hash', 3, 'JK-DEMO-04', 'ACTIVE');

INSERT INTO beneficiary_registry_mock (beneficiary_ref_hash, name_masked, district, ration_card_hash, active)
VALUES ('beneficiary-hash', 'Beneficiary ****01', 'Demo District', 'demo-ration-card-hash', TRUE);

INSERT INTO beneficiary_registry_mock (beneficiary_ref_hash, name_masked, district, ration_card_hash, active)
VALUES
  ('beneficiary-demo-001-hash', 'Asha Patil (Fictional)', 'MH-DEMO-HAV', 'ration-card-demo-001-hash', TRUE),
  ('beneficiary-demo-002-hash', 'Ravi Shinde (Fictional)', 'MH-DEMO-HAV', 'ration-card-demo-002-hash', TRUE),
  ('beneficiary-demo-003-hash', 'Meera Kulkarni (Fictional)', 'MH-DEMO-HAV', 'ration-card-demo-003-hash', TRUE),
  ('beneficiary-demo-004-hash', 'Sunita More (Fictional)', 'MH-DEMO-MUL', 'ration-card-demo-004-hash', TRUE),
  ('beneficiary-demo-005-hash', 'Imran Shaikh (Fictional)', 'MH-DEMO-MUL', 'ration-card-demo-005-hash', TRUE),
  ('beneficiary-jk-demo-001-hash', 'Zoya Dar (Fictional)', 'JK-DEMO-01', 'ration-card-jk-demo-001-hash', TRUE),
  ('beneficiary-jk-demo-002-hash', 'Arif Lone (Fictional)', 'JK-DEMO-02', 'ration-card-jk-demo-002-hash', TRUE),
  ('beneficiary-jk-demo-003-hash', 'Nusrat Bano (Fictional)', 'JK-DEMO-03', 'ration-card-jk-demo-003-hash', TRUE),
  ('beneficiary-jk-demo-004-hash', 'Tariq Mir (Fictional)', 'JK-DEMO-04', 'ration-card-jk-demo-004-hash', TRUE);

INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active)
VALUES
  ('demo-ration-card-hash', 'Rice', '2026-06', 25, 0, 25, TRUE),
  ('demo-ration-card-hash', 'Wheat', '2026-06', 10, 0, 10, TRUE),
  ('demo-ration-card-hash', 'Dal', '2026-06', 2, 0, 2, TRUE),
  ('demo-ration-card-hash', 'Sugar', '2026-06', 2, 0, 2, TRUE),
  ('demo-ration-card-hash', 'Cooking Oil', '2026-06', 1, 0, 1, TRUE),
  ('demo-ration-card-hash', 'Kerosene', '2026-06', 3, 0, 3, TRUE);

INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active)
VALUES
  ('ration-card-demo-001-hash', 'Rice', '2026-07', 25, 0, 25, TRUE),
  ('ration-card-demo-002-hash', 'Rice', '2026-07', 20, 5, 15, TRUE),
  ('ration-card-demo-003-hash', 'Rice', '2026-07', 15, 5, 10, TRUE),
  ('ration-card-demo-004-hash', 'Rice', '2026-07', 20, 0, 20, TRUE),
  ('ration-card-demo-005-hash', 'Rice', '2026-07', 25, 10, 15, TRUE),
  ('ration-card-jk-demo-001-hash', 'Rice', '2026-07', 25, 5, 20, TRUE),
  ('ration-card-jk-demo-002-hash', 'Rice', '2026-07', 20, 0, 20, TRUE),
  ('ration-card-jk-demo-003-hash', 'Rice', '2026-07', 30, 10, 20, TRUE),
  ('ration-card-jk-demo-004-hash', 'Rice', '2026-07', 15, 0, 15, TRUE);
