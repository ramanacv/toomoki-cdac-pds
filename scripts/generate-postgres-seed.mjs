import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stakeholders = JSON.parse(readFileSync(resolve(root, 'mock/entities/stakeholders.json'), 'utf8'));
const backendSeed = JSON.parse(readFileSync(resolve(root, 'mock/seed/backend.json'), 'utf8'));
const eligibilityBeneficiaries = JSON.parse(
  readFileSync(resolve(root, 'mock/entities/eligibility-beneficiaries.json'), 'utf8')
);
const outputPath = resolve(root, 'infra/postgres/seed.sql');

const sqlEscape = (value) => String(value).replaceAll("'", "''");

const stakeholderRows = stakeholders
  .map(
    (entry) =>
      `  ('${sqlEscape(entry.stakeholderId)}', '${sqlEscape(entry.stakeholderType)}', '${sqlEscape(entry.name)}', '${sqlEscape(entry.district)}', '${sqlEscape(entry.licenseNo)}', '${sqlEscape(entry.status)}')`
  )
  .join(',\n');

const lots = backendSeed.initialLots;
const entitlements = backendSeed.initialEntitlements;
const beneficiary = backendSeed.beneficiaryRegistry;
const rationCard = backendSeed.rationCard;

const sql = `-- Generated from mock/entities/stakeholders.json and mock/seed/backend.json
-- Regenerate with: npm run fixtures:sql

INSERT INTO stakeholders (stakeholder_id, stakeholder_type, name, district, license_no, status)
VALUES
${stakeholderRows};

INSERT INTO commodity_lots (lot_id, commodity, season, quantity_kg, quality_grade, source, current_owner, current_location, status)
VALUES
${lots
  .map(
    (lot) =>
      `  ('${sqlEscape(lot.lotId)}', '${sqlEscape(lot.commodity)}', '${sqlEscape(lot.season)}', ${lot.quantityKg}, '${sqlEscape(lot.qualityGrade)}', '${sqlEscape(lot.source)}', '${sqlEscape(lot.currentOwner)}', '${sqlEscape(lot.currentLocation)}', 'CREATED')`
  )
  .join(',\n')};

INSERT INTO stock_positions (stakeholder_id, commodity, quantity_kg, lot_id, month)
VALUES
${lots
  .map(
    (lot) =>
      `  ('${sqlEscape(lot.currentOwner)}', '${sqlEscape(lot.commodity)}', ${lot.quantityKg}, '${sqlEscape(lot.lotId)}', NULL)`
  )
  .join(',\n')};

INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
VALUES ('${sqlEscape(rationCard.rationCardHash)}', ${rationCard.householdSize}, '${sqlEscape(rationCard.district)}', '${sqlEscape(rationCard.status)}');

INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
VALUES
${eligibilityBeneficiaries
  .map((entry) => `  ('${sqlEscape(entry.rationCardHash)}', ${entry.householdSize}, '${sqlEscape(entry.districtCode ?? `${entry.jurisdictionCode ?? 'MH'}-DEMO`)}', 'ACTIVE')`)
  .join(',\n')};

INSERT INTO beneficiary_registry_mock (beneficiary_ref_hash, name_masked, district, ration_card_hash, active)
VALUES ('${sqlEscape(beneficiary.beneficiaryRefHash)}', '${sqlEscape(beneficiary.nameMasked)}', '${sqlEscape(beneficiary.district)}', '${sqlEscape(beneficiary.rationCardHash)}', TRUE);

INSERT INTO beneficiary_registry_mock (beneficiary_ref_hash, name_masked, district, ration_card_hash, active)
VALUES
${eligibilityBeneficiaries
  .map((entry) => `  ('${sqlEscape(entry.subjectRefHash)}', '${sqlEscape(entry.fictionalName)}', '${sqlEscape(entry.districtCode ?? `${entry.jurisdictionCode ?? 'MH'}-DEMO`)}', '${sqlEscape(entry.rationCardHash)}', TRUE)`)
  .join(',\n')};

INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active)
VALUES
${entitlements
  .map(
    (entitlement) =>
      `  ('${sqlEscape(entitlement.rationCardHash)}', '${sqlEscape(entitlement.commodity)}', '${sqlEscape(entitlement.month)}', ${entitlement.monthlyEntitlementKg}, ${entitlement.alreadyLiftedKg}, ${entitlement.availableBalanceKg}, TRUE)`
  )
  .join(',\n')};

INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active)
VALUES
${eligibilityBeneficiaries
  .map((entry) => `  ('${sqlEscape(entry.rationCardHash)}', 'Rice', '2026-07', ${entry.monthlyRiceEntitlementKg}, ${entry.alreadyLiftedKg}, ${entry.monthlyRiceEntitlementKg - entry.alreadyLiftedKg}, TRUE)`)
  .join(',\n')};
`;

writeFileSync(outputPath, sql, 'utf8');
console.log(JSON.stringify({ generated: true, outputPath }, null, 2));
