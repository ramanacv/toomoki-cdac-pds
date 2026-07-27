import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stakeholders = JSON.parse(readFileSync(resolve(root, 'mock/entities/stakeholders.json'), 'utf8'));
const backendSeed = JSON.parse(readFileSync(resolve(root, 'mock/seed/backend.json'), 'utf8'));
const entitlementFixtures = JSON.parse(readFileSync(resolve(root, 'mock/entities/entitlements.json'), 'utf8'));
const eligibilityBeneficiaries = JSON.parse(
  readFileSync(resolve(root, 'mock/entities/eligibility-beneficiaries.json'), 'utf8')
);
const outputPath = resolve(root, 'infra/postgres/seed.sql');

const sqlEscape = (value) => String(value).replaceAll("'", "''");
const sqlNullable = (value) => (value == null || value === '' ? 'NULL' : `'${sqlEscape(value)}'`);

const stakeholderRows = stakeholders
  .map(
    (entry) =>
      `  ('${sqlEscape(entry.stakeholderId)}', '${sqlEscape(entry.stakeholderType)}', '${sqlEscape(entry.name)}', '${sqlEscape(entry.district)}', '${sqlEscape(entry.licenseNo)}', '${sqlEscape(entry.status)}', ${sqlNullable(entry.dealerName)}, ${sqlNullable(entry.dealerId)}, ${sqlNullable(entry.shopNo)}, ${sqlNullable(entry.blockName)}, ${sqlNullable(entry.tehsilName)}, ${sqlNullable(entry.location)})`
  )
  .join(',\n');

const lots = backendSeed.initialLots;
const entitlementByKey = new Map();
for (const row of [...backendSeed.initialEntitlements, ...entitlementFixtures]) {
  entitlementByKey.set(`${row.rationCardHash}\0${row.commodity}\0${row.month}`, row);
}
const entitlements = [...entitlementByKey.values()];
const beneficiary = backendSeed.beneficiaryRegistry;
const rationCard = backendSeed.rationCard;

/** Org-grain stock only (`lot_id`/`month` NULL). Do not seed lot-scoped copies. */
const orgStock = new Map();
for (const lot of lots) {
  const key = `${lot.currentOwner}\0${lot.commodity}`;
  orgStock.set(key, (orgStock.get(key) ?? 0) + lot.quantityKg);
}
const orgStockRows = [...orgStock.entries()]
  .map(([key, quantityKg]) => {
    const [stakeholderId, commodity] = key.split('\0');
    return `  ('${sqlEscape(stakeholderId)}', '${sqlEscape(commodity)}', ${quantityKg}, NULL, NULL)`;
  })
  .join(',\n');

const sql = `-- Generated from mock/entities/stakeholders.json and mock/seed/backend.json
-- Regenerate with: npm run fixtures:sql
-- Idempotent: safe to re-apply on retained PostgreSQL volumes.

INSERT INTO stakeholders (stakeholder_id, stakeholder_type, name, district, license_no, status, dealer_name, dealer_id, shop_no, block_name, tehsil_name, location_text)
VALUES
${stakeholderRows}
ON CONFLICT (stakeholder_id) DO NOTHING;

INSERT INTO commodity_lots (lot_id, commodity, season, quantity_kg, quality_grade, source, current_owner, current_location, status)
VALUES
${lots
  .map(
    (lot) =>
      `  ('${sqlEscape(lot.lotId)}', '${sqlEscape(lot.commodity)}', '${sqlEscape(lot.season)}', ${lot.quantityKg}, '${sqlEscape(lot.qualityGrade)}', '${sqlEscape(lot.source)}', '${sqlEscape(lot.currentOwner)}', '${sqlEscape(lot.currentLocation)}', 'CREATED')`
  )
  .join(',\n')}
ON CONFLICT (lot_id) DO NOTHING;

-- Operational Available stock is org-grain only. Legacy lot-scoped seed rows
-- caused workbench balances to inflate when summed with null-lot rows.
INSERT INTO stock_positions (stakeholder_id, commodity, quantity_kg, lot_id, month)
VALUES
${orgStockRows}
ON CONFLICT DO NOTHING;

DELETE FROM stock_positions WHERE lot_id IS NOT NULL OR month IS NOT NULL;

INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
VALUES ('${sqlEscape(rationCard.rationCardHash)}', ${rationCard.householdSize}, '${sqlEscape(rationCard.district)}', '${sqlEscape(rationCard.status)}')
ON CONFLICT (ration_card_hash) DO NOTHING;

INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
VALUES ('exception-ration-card-hash', 3, 'DEMO', 'ACTIVE')
ON CONFLICT (ration_card_hash) DO NOTHING;

INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
VALUES
${eligibilityBeneficiaries
  .map((entry) => `  ('${sqlEscape(entry.rationCardHash)}', ${entry.householdSize}, '${sqlEscape(entry.districtCode ?? `${entry.jurisdictionCode ?? 'MH'}-DEMO`)}', 'ACTIVE')`)
  .join(',\n')}
ON CONFLICT (ration_card_hash) DO NOTHING;

INSERT INTO beneficiary_registry_mock (beneficiary_ref_hash, name_masked, district, ration_card_hash, active)
VALUES ('${sqlEscape(beneficiary.beneficiaryRefHash)}', '${sqlEscape(beneficiary.nameMasked)}', '${sqlEscape(beneficiary.district)}', '${sqlEscape(beneficiary.rationCardHash)}', TRUE)
ON CONFLICT (beneficiary_ref_hash) DO NOTHING;

INSERT INTO beneficiary_registry_mock (beneficiary_ref_hash, name_masked, district, ration_card_hash, active)
VALUES
${eligibilityBeneficiaries
  .map((entry) => `  ('${sqlEscape(entry.subjectRefHash)}', '${sqlEscape(entry.fictionalName)}', '${sqlEscape(entry.districtCode ?? `${entry.jurisdictionCode ?? 'MH'}-DEMO`)}', '${sqlEscape(entry.rationCardHash)}', TRUE)`)
  .join(',\n')}
ON CONFLICT (beneficiary_ref_hash) DO NOTHING;

INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active)
VALUES
${entitlements
  .map(
    (entitlement) =>
      `  ('${sqlEscape(entitlement.rationCardHash)}', '${sqlEscape(entitlement.commodity)}', '${sqlEscape(entitlement.month)}', ${entitlement.monthlyEntitlementKg}, ${entitlement.alreadyLiftedKg}, ${entitlement.availableBalanceKg}, TRUE)`
  )
  .join(',\n')}
ON CONFLICT (ration_card_hash, commodity, month) DO NOTHING;

INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active)
VALUES
${eligibilityBeneficiaries
  .map((entry) => `  ('${sqlEscape(entry.rationCardHash)}', 'Rice', '2026-07', ${entry.monthlyRiceEntitlementKg}, ${entry.alreadyLiftedKg}, ${entry.monthlyRiceEntitlementKg - entry.alreadyLiftedKg}, TRUE)`)
  .join(',\n')}
ON CONFLICT (ration_card_hash, commodity, month) DO NOTHING;
`;

writeFileSync(outputPath, sql, 'utf8');
console.log(JSON.stringify({ generated: true, outputPath }, null, 2));
