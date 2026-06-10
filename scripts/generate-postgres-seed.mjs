import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stakeholders = JSON.parse(readFileSync(resolve(root, 'mock/entities/stakeholders.json'), 'utf8'));
const backendSeed = JSON.parse(readFileSync(resolve(root, 'mock/seed/backend.json'), 'utf8'));
const outputPath = resolve(root, 'infra/postgres/seed.sql');

const sqlEscape = (value) => String(value).replaceAll("'", "''");

const stakeholderRows = stakeholders
  .map(
    (entry) =>
      `  ('${sqlEscape(entry.stakeholderId)}', '${sqlEscape(entry.stakeholderType)}', '${sqlEscape(entry.name)}', '${sqlEscape(entry.district)}', '${sqlEscape(entry.licenseNo)}', '${sqlEscape(entry.status)}')`
  )
  .join(',\n');

const lot = backendSeed.initialLot;
const entitlement = backendSeed.initialEntitlement;
const beneficiary = backendSeed.beneficiaryRegistry;
const rationCard = backendSeed.rationCard;

const sql = `-- Generated from mock/entities/stakeholders.json and mock/seed/backend.json
-- Regenerate with: npm run fixtures:sql

INSERT INTO stakeholders (stakeholder_id, stakeholder_type, name, district, license_no, status)
VALUES
${stakeholderRows};

INSERT INTO commodity_lots (lot_id, commodity, season, quantity_kg, quality_grade, source, current_owner, current_location, status)
VALUES ('${sqlEscape(lot.lotId)}', '${sqlEscape(lot.commodity)}', '${sqlEscape(lot.season)}', ${lot.quantityKg}, '${sqlEscape(lot.qualityGrade)}', '${sqlEscape(lot.source)}', '${sqlEscape(lot.currentOwner)}', '${sqlEscape(lot.currentLocation)}', 'CREATED');

INSERT INTO stock_positions (stakeholder_id, commodity, quantity_kg, lot_id, month)
VALUES ('${sqlEscape(lot.currentOwner)}', '${sqlEscape(lot.commodity)}', ${lot.quantityKg}, '${sqlEscape(lot.lotId)}', NULL);

INSERT INTO ration_cards_mock (ration_card_hash, household_size, district, status)
VALUES ('${sqlEscape(rationCard.rationCardHash)}', ${rationCard.householdSize}, '${sqlEscape(rationCard.district)}', '${sqlEscape(rationCard.status)}');

INSERT INTO beneficiary_registry_mock (beneficiary_ref_hash, name_masked, district, ration_card_hash, active)
VALUES ('${sqlEscape(beneficiary.beneficiaryRefHash)}', '${sqlEscape(beneficiary.nameMasked)}', '${sqlEscape(beneficiary.district)}', '${sqlEscape(beneficiary.rationCardHash)}', TRUE);

INSERT INTO monthly_entitlements (ration_card_hash, commodity, month, monthly_entitlement_kg, already_lifted_kg, available_balance_kg, active)
VALUES ('${sqlEscape(entitlement.rationCardHash)}', '${sqlEscape(entitlement.commodity)}', '${sqlEscape(entitlement.month)}', ${entitlement.monthlyEntitlementKg}, ${entitlement.alreadyLiftedKg}, ${entitlement.availableBalanceKg}, TRUE);
`;

writeFileSync(outputPath, `${sql}\n`, 'utf8');
console.log(JSON.stringify({ generated: true, outputPath }, null, 2));
