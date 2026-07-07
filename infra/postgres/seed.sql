-- Generated from mock/entities/stakeholders.json and mock/seed/backend.json
-- Regenerate with: npm run fixtures:sql

INSERT INTO stakeholders (stakeholder_id, stakeholder_type, name, district, license_no, status)
VALUES
  ('DFPD-001', 'DFPD', 'Department of Food and Public Distribution', 'Central', 'DFPD-POC-001', 'ACTIVE'),
  ('FCI-001', 'FCI', 'Food Corporation of India', 'Central', 'FCI-POC-001', 'ACTIVE'),
  ('FCI-BUF-001', 'FCI_BUFFER_GODOWN', 'FCI Buffer Godown 01', 'Demo District', 'FCI-BUF-LIC-001', 'ACTIVE'),
  ('FOOD-001', 'DEPARTMENT', 'State Food Department', 'Demo District', 'FD-LIC-001', 'ACTIVE'),
  ('FDO-001', 'DIVISIONAL_OFFICE', 'Divisional Food Office', 'Demo Division', 'FDO-LIC-001', 'ACTIVE'),
  ('DSO-001', 'DISTRICT_SUPPLY_OFFICE', 'District Supply Office', 'Demo District', 'DSO-LIC-001', 'ACTIVE'),
  ('TSO-001', 'TALUKA_SUPPLY_OFFICE', 'Taluka Supply Office', 'Demo Taluka', 'TSO-LIC-001', 'ACTIVE'),
  ('PROC-001', 'PROCUREMENT_CENTER', 'Procurement Centre 01', 'Demo District', 'PROC-LIC-001', 'ACTIVE'),
  ('MLL-001', 'MILLER', 'Miller 01', 'Demo District', 'MLL-LIC-001', 'ACTIVE'),
  ('GODOWN-S-001', 'STATE_GODOWN', 'State Government Depot 01', 'Demo District', 'SG-LIC-001', 'ACTIVE'),
  ('GODOWN-B-001', 'BLOCK_GODOWN', 'Block Godown 01', 'Demo District', 'BG-LIC-001', 'ACTIVE'),
  ('ISSUE-001', 'ISSUE_POINT', 'Issue Point 01', 'Demo District', 'ISSUE-LIC-001', 'ACTIVE'),
  ('TRANS-001', 'TRANSPORTER', 'Transport Contractor 01', 'Demo District', 'TRANS-LIC-001', 'ACTIVE'),
  ('FPS-101', 'FAIR_PRICE_SHOP', 'FPS 101', 'Demo District', 'FPS-LIC-101', 'ACTIVE'),
  ('WI-101', 'WELFARE_INSTITUTE', 'Welfare Hostel 101', 'Demo District', 'WI-LIC-101', 'ACTIVE'),
  ('SBE-101', 'SHIV_BHOJAN_EATERY', 'Shiv Bhojan Eatery 101', 'Demo District', 'SBE-LIC-101', 'ACTIVE'),
  ('AUD-001', 'AUDITOR', 'Auditor 01', 'Demo District', 'AUD-LIC-001', 'ACTIVE');

INSERT INTO commodity_lots (lot_id, commodity, season, quantity_kg, quality_grade, source, current_owner, current_location, status)
VALUES ('LOT-RICE-2026-001', 'Rice', 'Kharif 2026', 10000, 'A', 'Procurement Centre 01', 'PROC-001', 'Procurement Yard', 'CREATED');

INSERT INTO stock_positions (stakeholder_id, commodity, quantity_kg, lot_id, month)
VALUES ('PROC-001', 'Rice', 10000, 'LOT-RICE-2026-001', NULL);

INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
VALUES ('demo-ration-card-hash', 5, 'Demo District', 'ACTIVE');

INSERT INTO beneficiary_registry_mock (beneficiary_ref_hash, name_masked, district, ration_card_hash, active)
VALUES ('beneficiary-hash', 'Beneficiary ****01', 'Demo District', 'demo-ration-card-hash', TRUE);

INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active)
VALUES ('demo-ration-card-hash', 'Rice', '2026-06', 25, 0, 25, TRUE);

