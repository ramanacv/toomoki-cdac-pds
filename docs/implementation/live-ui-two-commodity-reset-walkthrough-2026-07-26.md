# Live UI two-commodity reset walkthrough — 2026-07-26 evening (re-run)

## Scope

Visible live re-run after **platform-admin full ledger reset** in Admin Tools
(`series R20260726-171531-22be`). Playwright automation drove personas on
`http://localhost:4173` while Cursor Glass stayed open for observation.

Commodities:

| Commodity | Intent |
| --- | --- |
| **Rice** | Negative path — short receipts + duplicate/over-entitlement alarms |
| **Wheat** | Positive path — full receipts, clean issue |

## Reset

1. Confirmed `PDS_ALLOW_RESET=true` on the API container.
2. Signed in as Platform administrator (`demo-platform-admin`, with `demo-reset`)
   → **Admin tools** → **Reset ledger** (all commodities).
3. Confirmed new series lots and zero transfers/distributions/alerts.
4. **Required demo step (heads-up):** admin reset truncates `monthly_entitlements`
   and does **not** reseed them. FPS issue fails with **“Entitlement not found”**
   until demo-month rows are restored/created.

### Entitlement restore (before FPS issue)

Immediately after reset, restored July rows for `demo-ration-card-hash`:

| Commodity | Month | Monthly kg | Lifted | Available |
| --- | --- | ---: | ---: | ---: |
| Rice | 2026-07 | 25 | 0 | 25 |
| Wheat | 2026-07 | 10 | 0 | 10 |

Do this before any FPS authenticate/issue action. Skipping it is the usual cause
of a failed demo issue after Admin Tools reset.

## Quantity conservation (Postgres = UI)

### Transfers

| Commodity | Leg | Dispatched | Received | Shortage | Status | UI / DB |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Rice | FCI → State | 5000 | 4900 | 100 | `RECEIVED_WITH_SHORTAGE` | PASS |
| Wheat | FCI → State | 4000 | 4000 | — | `RECEIVED` | PASS |
| Rice | State → Block | 4800 | 4000 | 800 | `RECEIVED_WITH_SHORTAGE` | PASS |
| Wheat | State → Block | 4000 | 4000 | — | `RECEIVED` | PASS |

Stock after Stage-I/II: FCI Rice **5000**, Wheat **3000**; State Rice **100**,
Wheat **0**; Block Rice **4000**, Wheat **4000** (before allotment).

### FPS allocations (UI Allocations desk / workbench)

| Commodity | Shipped | Received | Shortage | Status | Verdict |
| --- | ---: | ---: | ---: | --- | --- |
| Rice | 300 | 299 | 1 | `RECEIVED_WITH_SHORTAGE` | PASS |
| Wheat | 300 | 300 | — | `RECEIVED` | PASS |

Block residual after allotment: **3700** each (= 4000 − 300).

### Distributions + entitlements

| Commodity | Issued | FPS stock after | July lifted / available | Verdict |
| --- | ---: | ---: | --- | --- |
| Rice | 25 | 274 (= 299 − 25) | 25 / 0 | PASS |
| Wheat | 10 | 290 (= 300 − 10) | 10 / 0 | PASS |

FCI org-grain Available stock for untouched commodities remained correct
(Dal/Sugar **2000**, Oil/Kerosene **1000**) — no 4× inflation.

### Alarms (negative)

| Alert | Count / evidence | Verdict |
| --- | --- | --- |
| `SHORT_RECEIPT` | 3 — Stage-I Rice 100 kg, Stage-II Rice 800 kg, FPS Rice 1 kg | PASS |
| `DUPLICATE_CLAIM` | 1 — second Rice lift blocked; UI: “Duplicate claim blocked as expected” / exceeds balance | PASS |

## Gaps observed during the live run

1. **Admin reset clears entitlements** without reseeding fixture months — FPS
   issue fails with “Entitlement not found” until entitlements are restored.
   This re-run explicitly restored July Rice/Wheat before FPS issue.
2. Admin Tools copy still says reset “resets entitlement balances back to their
   monthly limits,” but the operational truncate leaves **zero** entitlement
   rows — copy and behavior disagree.
3. Workbench quantity inputs need React-aware value setting (native DOM value
   alone can leave the default).
4. Exception-path card (`exception-ration-card-hash`) is also missing after reset
   if exercised; only restore the cards you will demo.

## Verdict

**PASS for controlled demo quantity trust** on series `R20260726-171531-22be`
for Rice (negative) and Wheat (positive), including entitlements balance, FPS
stock conservation, and alarm visibility — **after** the post-reset entitlement
restore step.

### Stakeholder demo checklist

1. Reset from Admin Tools (all commodities or scoped).
2. **Restore/create demo-month entitlement rows** (Rice 25 / Wheat 10 for
   `demo-ration-card-hash`, or the cards you will issue against).
3. Run Rice short-receipt path, then Wheat clean path.
4. Confirm SHORT_RECEIPT + DUPLICATE_CLAIM in the alert inbox before handing
   the keyboard to the audience.
