# Provenance badge wiring (auth / allocation / entitlement / distribution)

**Date:** 2026-07-30  
**Status:** Fixed in API + web

## Problem

Distribution UI cards often showed `Fabric proof: not linked` even when Trust /
outbox held committed proofs. Root cause was a **wiring gap**, not missing
Fabric commits:

1. Auth, allocation, and entitlement panels rendered `ProvenanceBadges` without
   `eventId`.
2. Distribution only linked when the row’s own `ledger_tx_id` column was set;
   many seed / older rows relied on `ledger_tx_index` instead.
3. Shared response types did not expose optional `ledgerTxId` on auth /
   allocation / entitlement.

## Fix

| Layer | Change |
|-------|--------|
| `@pds/shared-types` | Optional `ledgerTxId?` on `FPSAllocation`, `MonthlyEntitlement`, `AuthTransaction` (distribution already had it) |
| Postgres mappers | `optionalLedgerTxId()` reads `resolved_ledger_tx_id` or `ledger_tx_id` |
| `PdsRuntime` list/get | `LEFT JOIN ledger_tx_index` for allocation / entitlement / auth / distribution; memory path uses `attachProofIdsFromEvents` |
| Chaincode engine | Create paths for allocation / auth / entitlement attach `ledgerTxId` via `recordEvent` |
| Web `DataPanels` | Passes `eventId={*.ledgerTxId}` for all four card types |

Entitlement proofs join `ledger_tx_index` where `entity_type = 'distribution'`
and `entity_id = ration_card_hash` (matches `CreateMonthlyEntitlement`).

## Expected demo behavior

- After a live allocate / auth / create-entitlement / distribute mutation and
  outbox `COMMITTED`, the corresponding Distribution panel badge shows
  committed / pending status instead of “not linked.”
- Seed fixtures that never wrote a `ledger_tx_index` row still correctly show
  `Fabric proof: not linked`.

## Verification

```sh
npm run test --workspace=@pds/api -- test/postgres-snapshot.test.ts
npm run test --workspace=@pds/web -- test/provenance-badges.test.tsx
npm run typecheck --workspace=@pds/shared-types
npm run typecheck --workspace=@pds/api
npm run typecheck --workspace=@pds/web
```

All of the above passed on 2026-07-30.
