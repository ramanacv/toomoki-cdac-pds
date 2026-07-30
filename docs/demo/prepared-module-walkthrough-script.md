# Prepared module walkthrough script (blockchain cues)

**Use this as a live runbook.** Each step says: who to log in as, what to click, and **exactly what blockchain-related UI to point at**.

**Companions:** [Final VM demo script](vm-demo-blockchain-script.md) · [POC checklist](poc-test-case-demo-checklist.md) · [assumptions-for-demo](../product/assumptions-for-demo.md)

**Suggested total time:** 25–40 minutes (or skip Module 1 movements if `live-lifecycle` already ran and jump to proof badges on existing rows).

---

## Pre-flight (do once, alone)

1. Prefer `http://localhost:4173` (or the VM HTTPS URL) — **not** bare `127.0.0.1`.
2. Reset/reseed only if authorized; then custody prep:
   - `node scripts/live-lifecycle.mjs`, **or**
   - Run Module 1 Steps 1–7 below in order.
3. Confirm API online; prefer ledger mode `fabric` so badges show real `fabric_tx_id` (if `demo`, say “same proof envelope, in-process chaincode”).
4. Have Keycloak passwords ready for: `demo-fci`, `demo-godown`, `demo-department`, `demo-block-office`, `demo-fps`, `demo-auditor`.

### How to change role every time

1. Go to `/role-login`.
2. Choose the **module card**.
3. Click **Continue as {persona}**.
4. Complete Keycloak login (username is prefilled).
5. If already signed in, Continue **ends SSO first** — do not clear only `sessionStorage`.

### Blockchain badge cheat sheet (memorize)

After a successful workbench action you should see two badges:

| Badge text | Meaning |
|------------|---------|
| `Operational transaction committed` | Postgres accepted the business write |
| `Blockchain proof pending` | Outbox row queued (`PENDING`) |
| `Blockchain proof submitting` | Worker claimed the row |
| `Blockchain proof committed · {fabricTxId}` | Fabric confirmed — **read the TX ID aloud** |
| `Demo proof recorded · no Fabric transaction ID` | Demo/in-process mode — still a proof, no live TX ID |
| `Blockchain proof retryable failure` / `… dead letter…` | Call out; do not pretend success |

**Key talking line:** “Ops and blockchain are separate — the first badge can succeed while the second is still catching up.”

---

## Module 1 — Supply chain (`/m/supply-chain`)

**Goal:** Show custody movements and proof badges after each accepted action.  
**Commodity tab:** select **Rice** on the Role workbench.

### Step 1.1 — FCI dispatch

| | |
|--|--|
| **Login** | Module **Supply chain** → **Continue as FCI Depot Officer** (`demo-fci`) |
| **Go to** | Module home → **Open Workbench** → `/workbench` |
| **Do** | On **Role workbench**, tab **Rice**, find `Stage-I: FCI dispatch to state godown` → set qty if prompted → **Run action** |
| **See (blockchain)** | Success alert + badges: `Operational transaction committed` and `Blockchain proof pending` (may flip to `… committed · {tx}` within seconds). **Point at the second badge.** |
| **Say** | “Custody move is accepted in Postgres; Fabric proof is queued asynchronously.” |

Optional: open **Lots** / **Transfers** in the sidebar and note the new movement row (proof detail is clearer on the workbench badge and later in Trust).

### Step 1.2 — State godown receipt

| | |
|--|--|
| **Login** | `/role-login` → Supply chain → **Godown Operator** (`demo-godown`) |
| **Go to** | **Open Workbench** |
| **Do** | `Confirm receipt at state godown` → **Run action** |
| **See (blockchain)** | Same dual badges under Success. Watch pending → committed if Fabric is live. |
| **Say** | “Each custody handoff creates its own privacy-safe proof event.” |

### Step 1.3 — DSO Release Order

| | |
|--|--|
| **Login** | Supply chain → **District Supply Officer (DSO)** (`demo-department`) |
| **Go to** | **Open Workbench** |
| **Do** | `DSO approve Release Order: Stage-II: state godown dispatch to block godown` → **Run action** |
| **See (blockchain)** | Dual badges again. |
| **Say** | “Authorization is an operational act; the proof attests it happened.” |

### Step 1.4 — Stage-II dispatch + block receipt (Godown)

| | |
|--|--|
| **Login** | Supply chain → **Godown Operator** (`demo-godown`) |
| **Go to** | **Open Workbench** |
| **Do** | (1) `Stage-II: state godown dispatch to block godown` → **Run action** → note badges. (2) `Confirm receipt at block godown` → **Run action** → note badges. |
| **See (blockchain)** | Two more proof cycles (pending → committed). |
| **Say** | “Proof volume grows with custody events — you’ll see the supply-chain bucket in Trust later.” |

### Step 1.5 — BSO allot to FPS

| | |
|--|--|
| **Login** | Supply chain → **Block Supply Officer (BSO)** (`demo-block-office`) |
| **Go to** | **Open Workbench** (also show **Allocations** if useful) |
| **Do** | `BSO allot Rice to FPS` → **Run action** |
| **See (blockchain)** | Dual badges on Success. On **Allocations** (`/allocations`), allocation rows may show provenance chips; full Fabric TX is clearest on the workbench badge / Trust. |
| **Say** | “Allotment to FPS-101 is attested without putting shop PII on chain.” |

**If an action shows `Blocked` / `Waiting for …` / upstream incomplete:** stop and re-run earlier steps, or re-run `live-lifecycle`. Do not invent a Fabric failure story.

---

## Module 2 — Card & eligibility (`/m/eligibility`)

**Goal:** Screening ≠ proof; authorized decision = proof; gate blocks FPS.  
**Primary fixture:** `BEN-DEMO-001` · Asha Patil (Fictional) · FPS-101.

### Step 2.1 — Enter eligibility

| | |
|--|--|
| **Login** | Module **Card & eligibility** → **Continue as Eligibility officer (DSO)** (`demo-department`) |
| **Go to** | **Open eligibility review** → `/eligibility` |
| **See (blockchain)** | Page banner about synthetic beneficiaries / hashes. Registry card may show **`{n} proofs pending`**. Case footer pattern later: `Operational RCMS: … · Fabric proof: …`. |
| **Say** | “This simulates SMART-PDS/RCMS integrity review — not a live card master.” |

### Step 2.2 — Optional: registry lifecycle create (quick proof)

| | |
|--|--|
| **Do** | On **Registry lifecycle** → **Register lifecycle record** |
| **See (blockchain)** | Registry summary / pending proofs may increment. Later Trust will show a beneficiary lifecycle event. |
| **Say** | “Privacy-safe lifecycle create — opaque `beneficiaryRefHash`, async Fabric proof.” |
| **Do not say** | “Demographics stored on blockchain.” |

*(Skip if short on time.)*

### Step 2.3 — External screening (no Fabric proof required)

| | |
|--|--|
| **Do** | In **Synthetic beneficiary screening**, select **`BEN-DEMO-001`** → **Run external eligibility check** |
| **See (blockchain)** | Case opens / status toward **`DEATH_MATCH_REVIEW`**. Explainability panel. Case line may still show Fabric proof **`NOT_REQUIRED`** or unchanged until later steps — **screening itself does not enqueue a decision proof.** |
| **Say** | “Simulated death-registry match opens human review. Benefits stay open until an authorized decision.” |
| **Do not say** | “Live civil registration” or “ghost flag alone revoked benefits.” |

### Step 2.4 — Confirm entitlement still open (before decision)

| | |
|--|--|
| **Do** | **Entitlement gate check** |
| **See (blockchain)** | **Entitlement gate result** should allow distribution (or not yet show Ineligible). **No new success proof required here.** |
| **Say** | “Gate still open — review alone does not block FPS.” |

### Step 2.5 — Guided case → notice → verification → decision (proofs start)

| | |
|--|--|
| **Do** | In **Guided case actions**: **Issue notice** → then **Record verification** → then **Authorize cancellation** *(or **Authorize member removal** on `BEN-DEMO-001` if that control is shown)* |
| **See (blockchain)** | After notice/verification/decision, case footer updates: **`Fabric proof: PENDING`** (then later `COMMITTED`). Point at **`Fabric proof:`** on the case. |
| **Say** | “Checkpoint and decision events are the ones we prove on Fabric — not the screening click.” |

### Step 2.6 — Gate blocked after decision

| | |
|--|--|
| **Do** | **Entitlement gate check** again |
| **See (blockchain)** | **Entitlement gate result** → **`Ineligible Beneficiary`** / distribution blocked. Case still shows Fabric proof status. |
| **Say** | “Authorized cancellation revokes distribution eligibility. We’ll show the Fabric TX ID in Trust.” |

### Step 2.7 — Optional remaps (only if asked)

| Action | Click | Blockchain cue |
|--------|-------|----------------|
| Bifurcation | **Record family bifurcation** | Lifecycle proof queued; household size shrinks |
| JK duplicate | Select `BEN-JK-DEMO-001` → **Run external eligibility check** | Review case; still not “Aadhaar on chain” |

---

## Module 3 — FPS authentication (`/m/fps`)

**Goal:** Happy-path issue with proof badges; contrast ineligible card.  
**Shop:** Haveli **FPS-101** via `demo-fps`.

### Step 3.1 — FPS receipt (if not already done in prep)

| | |
|--|--|
| **Login** | Module **FPS authentication** → **Continue as FPS Dealer · Haveli (FPS-101)** (`demo-fps`) |
| **Go to** | **Open Workbench** → `/workbench` |
| **Do** | Tab **Rice** → `FPS Dealer confirm receipt for Rice` → **Run action** |
| **See (blockchain)** | Dual badges: operational + blockchain proof pending/committed. |
| **Say** | “Shop receipt is attested like other custody events.” |

*(If button is blocked, Module 1 / lifecycle prep is incomplete.)*

### Step 3.2 — Authenticate and issue (happy path)

| | |
|--|--|
| **Do** | `Authenticate and issue Rice ration` → **Run action** |
| **See (blockchain)** | Under Success: **`Operational transaction committed`** + **`Blockchain proof pending`** → ideally **`Blockchain proof committed · {fabricTxId}`**. **Pause and point at this.** |
| **Say** | “Simulated ePoS auth + issue. Opaque auth hash only — not live UIDAI.” |

### Step 3.3 — Read evidence on Distribution screen

| | |
|--|--|
| **Go to** | Sidebar **Distribution** → `/distribution` |
| **See (blockchain)** | Panels: |
| | • **Beneficiary authentication** / **FPS allocation** / **Monthly entitlement** / **Citizen receipt** — each row passes `ledgerTxId` into **ProvenanceBadges** when a proof is indexed |
| | • Seed fixtures without a `ledger_tx_index` row still show `Fabric proof: not linked` (expected); live allocate / auth / entitlement / distribute mutations link after outbox commit |
| | • **Citizen receipt proof** remains the clearest place to re-show a committed Fabric TX ID |
| **Say** | “Distribution receipt is the citizen-facing operational record; the badge is the Fabric proof status.” |

### Step 3.4 — Ineligible contrast (after Module 2 cancel)

| | |
|--|--|
| **Do** | Attempt issue again for the cancelled `BEN-DEMO-001` path (workbench issue / gate as available), **or** return to eligibility gate already shown |
| **See (blockchain)** | **`Ineligible Beneficiary`** / blocked — **no successful distribution proof**. |
| **Say** | “After authorized cancellation, FPS cannot issue. Ghost screening alone did not do this — the decision did.” |

---

## Module 4 — Trust & reconcile (`/m/trust`) — blockchain payoff

**Goal:** Cross-module outbox analytics and a real `fabric_tx_id`.  
**Login:** Module **Trust & reconcile** → **Continue as Auditor** (`demo-auditor`).

### Step 4.1 — Overview pipeline

| | |
|--|--|
| **Go to** | Module home → **Open Dashboard** → `/dashboard` |
| **See (blockchain)** | Panel **Fabric · Cross-module proof analytics**: |
| | • Cards: **Committed**, **Pending / submitting**, **Failed**, **Dead letter** |
| | • Pill / % committed |
| | • Optional: oldest outstanding proof age |
| **Say** | “This is the durable outbox view — proofs from all modules, not a live chain browser.” |

### Step 4.2 — Completeness + module buckets

| | |
|--|--|
| **See (blockchain)** | Panel **Lifecycle proof completeness**: Beneficiary expected→committed, Eligibility expected→committed, Missing proofs, Dead letters. |
| | Module cards: **Supply chain**, **Card & eligibility**, **FPS authentication** with proof counts. |
| | Table **Proofs by event type**. |
| **Say** | “Supply-chain movements, eligibility decisions, and FPS issues all land here.” |

### Step 4.3 — Open a committed envelope (must-do)

| | |
|--|--|
| **Do** | In **Recent proof envelopes**, find a row with Status **COMMITTED** → click **Open** (Detail) |
| **See (blockchain)** | **Proof detail** drawer: Event ID, Status, **Fabric TX**, Payload hash, Module, privacy-safe `proofPayload` JSON — **no cleartext Aadhaar/phone/RC**. |
| **Say** | “This Fabric transaction ID is the immutable attest. Payload is hashed/opaque.” |

### Step 4.4 — Hash-keyed trail (auditor)

| | |
|--|--|
| **Do** | Panel **Hash-keyed proof trail** → paste `beneficiary-demo-001-hash` (or the opaque hash from the case) → **Search proofs** |
| **See (blockchain)** | Table columns: Event, Entity, Status, **Fabric TX**, Business time, Detail. |
| **Say** | “Auditors search by hash — never by cleartext beneficiary ID.” |

### Step 4.5 — Optional Verify

| | |
|--|--|
| **Go to** | **Verify** → `/verify` |
| **See** | Trace + alerts (reconcile story). Tie back: operational alerts vs proof completeness on Dashboard. |

---

## Fast path if custody already prepared (~20 min)

| Min | Module | Who | Do | Point at |
|-----|--------|-----|-----|----------|
| 0–1 | Framing | — | `/role-login` module cards | “Trust layer, not replacement” |
| 1–4 | Supply | `demo-fci` or `demo-godown` | One **Run action** still available, **or** open Transfers and narrate prep | Workbench dual badges |
| 4–12 | Eligibility | `demo-department` | Steps 2.3 → 2.6 | `Fabric proof:` on case + gate Ineligible |
| 12–16 | FPS | `demo-fps` | Issue Rice + Distribution | Dual badges + Citizen receipt proof |
| 16–20 | Trust | `demo-auditor` | Dashboard → Open COMMITTED → Fabric TX | Analytics + detail drawer |

---

## Facilitator “don’ts” (keep visible)

- Don’t say Fabric decides stock, eligibility, or issue.
- Don’t say Aadhaar / OTP / full ration card is on chain.
- Don’t wait forever on pending — say “outbox catching up” and continue; confirm COMMITTED in Trust.
- Don’t call ghost screening alone a distribution block.
- Don’t clear only `sessionStorage` to switch users — use `/role-login` Continue.

---

## After-run checklist

- [ ] At least one workbench action showed dual badges  
- [ ] Eligibility case showed `Fabric proof: PENDING` or `COMMITTED` after decision  
- [ ] FPS Distribution / workbench showed committed or pending proof  
- [ ] Trust Overview showed Committed count and a real **Fabric TX** (or honest demo-mode note)  
- [ ] Hash search used opaque hash, not cleartext name/ID  
