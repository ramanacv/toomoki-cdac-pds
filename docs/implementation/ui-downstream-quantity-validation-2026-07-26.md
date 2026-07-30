# UI downstream quantity validation — 2026-07-26

## Scope

Visible Glass browser session at `http://localhost:4173` with Keycloak personas
`demo-fci` and `demo-fps` (FPS-101). UI values were read from the live DOM and
checked against PostgreSQL ground truth (`stock_positions`, `transfer_orders`,
`fps_allocations`, `distribution_transactions`, `monthly_entitlements`,
`ledger_outbox`).

This is **not** a click-through smoke pass. The goal was to validate what each
downstream persona sees and whether the numbers conserve.

## Method

1. Open a visible browser tab (Glass) on `/role-login`.
2. Sign in as FCI → Workbench / Lots / Transfers; extract card and table values.
3. Switch to FPS-101 → Allocations / Distribution / Trust Overview.
4. Compare each figure to Postgres aggregates (`lot_id IS NULL` stock vs naive
   `SUM`, transfer dispatched/received/shortage, FPS allocation and issue totals).

## Ground truth (Postgres)

| Org | Commodity | Correct stock (`lot_id IS NULL`) | Naive `SUM(all rows)` |
| --- | --- | ---: | ---: |
| FCI-001 | Rice | 4,000 | 34,000 |
| FCI-001 | Wheat | 6,000 | 27,000 |
| FCI-001 | Dal | 2,000 | 8,000 |
| FCI-001 | Sugar | 2,000 | 8,000 |
| FCI-001 | Cooking Oil | 1,000 | 4,000 |
| FCI-001 | Kerosene | 1,000 | 4,000 |
| GODOWN-S-001 | Rice | 100 | 100 |
| GODOWN-B-001 | Rice | 200 | 200 |
| FPS-101 | Rice | 4,420 | 4,420 |

All-org naive stock sum = **89,720 kg**; null-lot truth = **20,720 kg**.

Live Rice custody (matches UI Transfers / Allocations when DOM-extracted):

| Leg | Dispatched | Received | Shortage | Status |
| --- | ---: | ---: | ---: | --- |
| FCI → State | 5,000 | 4,900 | 100 | `RECEIVED_WITH_SHORTAGE` |
| State → Block | 4,800 | 4,750 | 50 | `RECEIVED_WITH_SHORTAGE` |
| Block → FPS-101 | 4,500 | 4,400 | 100 | `RECEIVED_WITH_SHORTAGE` |
| Block → FPS-101 (short) | 50 | 49 | 1 | `RECEIVED_WITH_SHORTAGE` |

FPS-101 Rice issues on `demo-ration-card-hash`: **29 kg** total
(`25+1+1+1+1`). Entitlement rows for that card: June lifted **0**, July lifted
**1**.

## Persona findings

### FCI Depot Officer — Workbench

| Commodity | UI Available stock | Correct null-lot stock | Verdict |
| --- | ---: | ---: | --- |
| Dal | 8,000 kg | 2,000 kg | **FAIL — 4× inflated** |
| Sugar | 8,000 kg | 2,000 kg | **FAIL — 4× inflated** |
| Cooking Oil | 4,000 kg | 1,000 kg | **FAIL — 4× inflated** |
| Kerosene | 4,000 kg | 1,000 kg | **FAIL — 4× inflated** |
| Rice | No pending FCI action | 4,000 kg available | OK that queue empty after Stage-I |

Root cause: `listStockPositions()` selects every `stock_positions` row without
filtering `lot_id IS NULL` or aggregating. Seed re-apply left **duplicate
lot-scoped rows**; the workbench sums them for “Available stock”. Dispatch qty
defaults (1,000 kg) remain runnable even when the displayed available figure is
wrong.

Also observed: workbench headline **0/43 checkpoints** while substantial Rice
lifecycle work is already committed — progress labelling is misleading for a
partially completed demo DB.

### FCI — Lots

- DOM table lists **12 lots** and matches Postgres owners/statuses/quantities
  (including dual fixture + reset lots).
- Commodity filter chips show **All (6)** / **Rice (1)** even though there are
  12 lots and 2 Rice lots — chip counts are commodity buckets, but the screen
  title says “lots”, which is easy to misread.
- Status chips (**Pending / Received**) do not line up cleanly with
  `CREATED` / `DISPATCHED` row statuses.

### FCI — Transfers

DOM-validated; arithmetic matches Postgres:

- `5,000 = 4,900 + 100`
- `4,800 = 4,750 + 50`
- Two open Stage-I dispatches at 1,000 kg (Rice, Wheat) still `DISPATCHED` /
  received pending.

Conservation after Stage-I/II Rice: state residual **100 kg**, block residual
before allotment **4,750**; after allotments **200 kg** at block
(`4,750 − 4,550`).

### FPS-101 (Suresh Jadhav) — Allocations

| Allocation | Shipped | Received | Shortage | Verdict |
| --- | ---: | ---: | ---: | --- |
| `ALLOC-LIVE-…-RICE-FPS` | 4,500 | 4,400 | 100 | **PASS** |
| `ALLOC-LIVE-…-SHORT` | 50 | 49 | 1 | **PASS** |

Shop scope correct (FPS-101 only). Operational badge `ACCEPTED`. Fabric proof
chips were often **not linked** on these cards at the time of this audit
(UI/API wiring gap: auth/allocation/entitlement panels omitted `eventId`).
**Fixed 2026-07-30** — list/get joins `ledger_tx_index` and panels pass
`ledgerTxId` into `ProvenanceBadges`. Seed rows still without an index entry
correctly remain “not linked.”

### FPS-101 — Distribution / entitlements

| Check | UI / DB | Verdict |
| --- | --- | --- |
| Receipts listed | 5 Rice issues totaling 29 kg | **PASS** vs `distribution_transactions` |
| Shop stock equation | Received 4,449 − issued 29 = **4,420** stock | **PASS** |
| Entitlement lift | UI July Rice balance 24 / lifted 1; issued 29 kg | **FAIL — under-deducted** |
| June Rice balance | Still 25/25 after large issue activity | Suspect / inconsistent |

### FPS dealer — Trust Overview (same session)

Scoped summary metrics:

- Allocated **4,550 kg** = 4,500 + 50 → **PASS**
- Received **4,449 kg** = 4,400 + 49 → **PASS**
- Distributed **29 kg** → **PASS**
- Fabric: **266 COMMITTED**, **95 DEAD_LETTER** (RegisterStakeholder volume
  still dominates dead letters from pre-redaction history)
- Open alert copy includes `DB_LEDGER_MISMATCH` in the workflow panel region

## Severity summary

| Severity | Finding |
| --- | --- |
| **HIGH** | Workbench “Available stock” overstated FCI balances by ~4× (duplicate `stock_positions` + unaggregated `/stock` API). **Fixed 2026-07-26 evening.** |
| **HIGH** | Beneficiary entitlement ledger only showed 1 kg lifted while 29 kg Rice was issued on the same card hash. **Fixed 2026-07-26 evening** (reconcile + live repair). |
| **MEDIUM** | Lots filter chips under-count lots / mislabel status buckets. |
| **MEDIUM** | Workbench checkpoint counter stuck at 0/43 despite completed Rice custody. |
| **LOW** | Allocation cards show Fabric proof “not linked” while distribution receipts show committed proofs. **Fixed 2026-07-30** (proof-link wiring). |
| **INFO** | Transfer, allocation shortage arithmetic, and FPS shop stock conservation check out when read from the DOM. |

## Fix applied (2026-07-26 evening)

1. `/stock` and dashboard `trackedStockKg` now read only org-grain rows
   (`lot_id IS NULL AND month IS NULL`). Snapshot hydrate uses the same filter.
2. Seed inserts org-grain stock only and deletes legacy lot-scoped rows.
3. Schema repair dedupes `stock_positions` (prefer newest `updated_at`) and
   enforces `UNIQUE NULLS NOT DISTINCT`.
4. Entitlement lifts: pre-load `SUM(delivered_kg)` into the mutation engine before
   balance checks; upsert uses `GREATEST` so lifts cannot shrink under durable
   issues; post-write reconcile still aligns the row; snapshot write plan does
   the same reconcile. Month bucketing is shared UTC via
   `entitlementMonthFromTimestamp`.
5. Live DB repaired earlier: FCI org-grain stock clean; July Rice showed lifted
   **29** / available **0** after repair. Regression helpers:
   `apps/api/test/quantity-conservation.spec.ts`.

## Recommended follow-ups

1. Align Lots filter chip semantics with row counts; fix workbench checkpoint
   denominator for live state.
2. Before stakeholder demos: reset/reseed and re-check FCI Available stock and
   FPS entitlement balances against Postgres.

## Evidence

- Visible Glass session: FCI workbench / lots / transfers; FPS-101 allocations /
  distribution / dashboard.
- Postgres queries against the running Compose `postgres` service at validation
  time.
- Companion canvas: `ui-downstream-quantity-validation.canvas.tsx` in the Cursor
  canvases folder for this workspace.
