# Session Resume Notes: Fabric Reset + Dynamic Lots

Date: 2026-07-10

## Context

The app has moved from demo/mock mode to Fabric mode. Reset logic is intended to create fresh dynamic lot IDs each time, not reuse static IDs like `LOT-RICE-2026-001`.

Keep this behavior. Do not revert reset back to static seeded IDs.

## Issues Investigated

1. Full downstream Playwright test failed after Rice dispatch.
   - Rice procurement dispatch of 5000 kg succeeded.
   - FCI receipt got stuck.
   - API previously crashed on async Fabric persistence failure.
   - Fabric error included missing dynamic lot, for example:
     `Lot LOT-RICE-R20260710-114116-3755-001 not found`

2. Reset appeared to update Postgres/API state but Fabric was not getting the new dynamic reset lots reliably.

3. Deployed chaincode reset path tried to load `@pds/fixtures`, but the chaincode bundle intentionally vendors only runtime deps such as `@pds/shared-types`.
   - This caused Fabric reset replay to fail with:
     `Cannot find module '@pds/fixtures'`

4. Full reset cleared the engine event list, so Fabric could receive `CreateCommodityLot` events without the required stakeholder registry evidence.

5. Fabric submit initially failed due to endorsement policy:
   - With Food-only submit: `ENDORSEMENT_POLICY_FAILURE`
   - With discovery: `no peer combination can satisfy the endorsement policy`
   - With explicit two-org submit: `failed to find any endorsing peers for org(s): GodownWarehouseMSP`

## Fixes Made

### Chaincode / Ledger Engine

File: `blockchain/chaincode/pds-chaincode/src/index.ts`

- Reset seed lots now come from shared `COMMODITIES`, not `@pds/fixtures`.
- Dynamic lot IDs are preserved via `generateResetSeriesId()` and `buildSeedLotId()`.
- Full reset preserves registry history entity types:
  - `stakeholder`
  - `rationcard`
  - `grievance`
  - `entitlementrule`
- Full reset backfills missing `RegisterStakeholder` events from in-memory stakeholder state before emitting:
  - `ResetTransactionalData`
  - dynamic `CreateCommodityLot` events

File: `blockchain/chaincode/pds-chaincode/src/contract.ts`

- `RegisterStakeholder` is idempotent for identical replay payloads.
- If the same stakeholder exists with different data, it still rejects as duplicate.

### API Persistence

File: `apps/api/src/modules/core/pds-runtime.ts`

- Mutating persisted controller paths now await persistence.
- Fire-and-forget persistence catches async failures to avoid process crashes.
- Reset suppresses nested per-lot persists and persists reset as one ordered batch.
- Added `*Persisted` methods for mutating operations.

Controllers updated to call persisted variants:

- `apps/api/src/modules/lots/lots.controller.ts`
- `apps/api/src/modules/transfers/transfers.controller.ts`
- `apps/api/src/modules/allocations/allocations.controller.ts`
- `apps/api/src/modules/stakeholders/stakeholders.controller.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/distributions/distributions.controller.ts`
- `apps/api/src/modules/audit/audit.controller.ts`
- `apps/api/src/modules/admin/admin.service.ts`

### Fabric Gateway / Endorsement

File: `apps/api/src/modules/config/fabric.config.ts`

- Added `endorsingOrgs` to Fabric runtime config.
- Reads optional env var:
  `PDS_FABRIC_ENDORSING_ORGS=Org1MSP,Org2MSP`
- Defaults to `[mspId]`.

File: `apps/api/src/modules/fabric/fabric-gateway.client.ts`

- Submit uses `config.endorsingOrgs`.
- Evaluate no longer pins endorsing orgs.

File: `blockchain/fabric-network/scripts/deploy-chaincode.sh`

- Added optional:
  `CC_SIGNATURE_POLICY`
- Passed to approve and commit lifecycle commands.

## Deployed Runtime State

Chaincode was deployed successfully:

- Version: `1.3`
- Sequence: `6`
- Policy:
  `OR('FoodAndCivilSuppliesMSP.member','GodownWarehouseMSP.member')`

API was rebuilt and restarted after the gateway/config changes.

Running containers after successful reset included:

- `toomoki-cdac-pds-api-1` healthy
- `toomoki-cdac-pds-web-1` healthy
- `dev-peer0.food.example.com-pds-chaincode_1.3-...`
- `dev-peer0.godown.example.com-pds-chaincode_1.3-...`

## Live Validation Completed

Admin reset command used:

```bash
curl -sS -X POST http://127.0.0.1:3000/admin/reset \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Token: admin-mvp-token' \
  -d '{}'
```

Reset succeeded with:

- `seriesId`: `R20260710-130426-a28e`

Dynamic lots created:

- `LOT-RICE-R20260710-130426-a28e-001` - Rice 10000 kg
- `LOT-WHEAT-R20260710-130426-a28e-001` - Wheat 7000 kg
- `LOT-DAL-R20260710-130426-a28e-001` - Dal 2000 kg
- `LOT-SUGAR-R20260710-130426-a28e-001` - Sugar 2000 kg
- `LOT-COOKING-OIL-R20260710-130426-a28e-001` - Cooking Oil 1000 kg
- `LOT-KEROSENE-R20260710-130426-a28e-001` - Kerosene 1000 kg

Stock readback command:

```bash
curl -sS http://127.0.0.1:3000/stock \
  -H 'Authorization: Bearer dev-mvp-token'
```

Returned procurement stock:

- Rice 10000 kg
- Wheat 7000 kg
- Dal 2000 kg
- Sugar 2000 kg
- Cooking Oil 1000 kg
- Kerosene 1000 kg

Lots readback command:

```bash
curl -sS http://127.0.0.1:3000/lots \
  -H 'Authorization: Bearer dev-mvp-token'
```

Returned only dynamic reset lots for the current series.

## Tests Passed

Chaincode:

```bash
npm --workspace blockchain/chaincode/pds-chaincode test -- ledger.test.ts contract.test.ts
```

API focused tests:

```bash
npm --workspace apps/api test -- fabric-gateway.client.spec.ts fabric-gateway.ledger-port.spec.ts fabric-identity.service.spec.ts runtime.test.ts admin.module.spec.ts admin.service.spec.ts
```

API broader controller/persistence tests also passed earlier:

```bash
npm --workspace apps/api test -- runtime.test.ts admin.module.spec.ts admin.service.spec.ts allocations.module.spec.ts audit.module.spec.ts auth.module.spec.ts distributions.module.spec.ts lots.module.spec.ts transfers.module.spec.ts
```

Typecheck:

```bash
npm --workspace apps/api run typecheck
```

## Next Step

Resume with the full Playwright downstream transfer test from the UI.

Test quantities requested by the user:

- Rice: 5000 kg
- Wheat: 4000 kg
- Sugar: 2000 kg
- Kerosene: 500 kg
- Dal: 400 kg
- Cooking Oil: 300 kg

Goal:

Drive each commodity downstream through the workbench flow all the way to FPS and record any remaining bugs.

Known caveat from earlier testing:

- FPS allocation route may still default to 300 kg in shared route templates.
- This could prevent full requested quantities from reaching FPS even after Fabric reset sync is fixed.
- Verify whether the UI/API now allows custom allocation quantities or whether the hardcoded route allocation still needs a product/logic change.

## Useful Local Tokens

From local `.env`:

- Dev API bearer token: `dev-mvp-token`
- Admin token: `admin-mvp-token`

## Important Reminder

Dynamic reset IDs are intentional. If a workflow fails, first check whether the UI resolved the current reset series lot/transfer/allocation IDs rather than assuming static POC IDs.
