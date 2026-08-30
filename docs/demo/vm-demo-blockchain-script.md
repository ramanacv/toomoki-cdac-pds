# Final VM demo script — blockchain across modules + outbox briefing

**Audience:** Facilitator talking to evaluators / stakeholders on the VM  
**Length:** ~20–30 minutes (tight) or ~35–45 minutes (with Q&A)  
**Companion:** [poc-test-case-demo-checklist.md](poc-test-case-demo-checklist.md), [assumptions-for-demo.md](../product/assumptions-for-demo.md)

---

## One-sentence pitch (open with this)

> ViksitPDS is a **trust layer** on top of PDS operations: PostgreSQL runs the business workflow; Hyperledger Fabric stores **privacy-safe, immutable proofs** asynchronously — never raw Aadhaar, phone, OTP, or full ration-card numbers.

---

## Architecture soundbite (30 seconds)

```
Operator action (UI)
  → Nest API validates + writes PostgreSQL (source of truth)
  → Same commit path enqueues a row in ledger_outbox (PENDING)
  → Embedded outbox worker submits RecordLedgerProof to Fabric
  → Outbox becomes COMMITTED + fabric_tx_id
  → UI badges / Trust analytics show proof status
```

**Do say:** “Ops succeed even if Fabric is slow; proofs catch up.”  
**Do not say:** “The blockchain decides eligibility / stock / distribution.”

---

## Pre-flight (do before audience sits)

| Check | Pass criteria |
|-------|----------------|
| Reset/reseed authorized | Clean demo DB |
| Custody prep | `live-lifecycle` or workbench FCI → Godown → DSO → Godown → BSO → FPS |
| Postgres + API up | `PDS_PERSISTENCE_BACKEND=postgres` |
| Ledger mode | Prefer `fabric` for real TX IDs; if `demo`, say “in-process chaincode, same proof envelope” |
| Outbox health | No stuck `DEAD_LETTER`; pending should drain to `COMMITTED` |
| OIDC | Prefer `http://localhost:4173` (or VM HTTPS URL), not bare `127.0.0.1` |
| Personas ready | `demo-department`, `demo-fps`, `demo-auditor` |

---

## Suggested live order (blockchain-first narrative)

| # | Module | Persona | Route | Blockchain punchline |
|---|--------|---------|-------|----------------------|
| 0 | Framing | — | — | Postgres authoritative; Fabric = proofs |
| 1 | Supply chain | FCI / Godown / Dept | `/m/supply-chain` | Custody movements enqueue proofs |
| 2 | Card & eligibility | `demo-department` | `/m/eligibility` | Lifecycle + adjudication proofs |
| 3 | FPS authentication | `demo-fps` | `/m/fps` | Auth + distribution proofs |
| 4 | Trust & reconcile | `demo-auditor` | `/m/trust` | Cross-module outbox analytics + TX IDs |
| 5 | Optional closer | — | Outbox explainer | Why async proofs matter |

---

## Act 0 — Framing (1–2 min)

**Where:** Role login `/role-login` or Trust home.

**Say:**

> We do **not** replace SMART-PDS, RCMS, AePDS, or UIDAI. We complement them. Every sensitive business fact stays in operational systems and PostgreSQL. On Fabric we only store **hashed / opaque** evidence envelopes via `RecordLedgerProof`.

Point at module cards: Supply chain · Card & eligibility · FPS · Trust.

---

## Act 1 — Supply chain (`/m/supply-chain`)

**Persona:** FCI depot / Godown / Control Office as needed  
**Screens:** workbench → lots / transfers / allocations

### What triggers a Fabric proof

Workbench actions that mutate custody (examples): create/move lots, authorize movement, dispatch/receive, allocate to FPS, record FPS receipt. Each accepted mutation produces a ledger event and an outbox row.

### Where to look in the UI

| Place | What to show |
|-------|----------------|
| **Workbench** action result | After a successful action, **ProofStatusBadges** (“Blockchain proof pending / committed · `<fabric_tx_id>`”) |
| **Lots / Transfers / Allocations** | Provenance / event linkage on records |
| Later in Trust | Module bucket **supply-chain** in Fabric analytics |

### Script beats

1. Open Supply chain workbench. Narrate custody path: FCI → Godown → DSO → Godown → BSO → FPS.
2. Execute **one visible movement** (or show a recent transfer if prep already ran).
3. Call out the badge: *“Operational accept is immediate; the proof badge may still say pending — that is the outbox catching up.”*
4. If badge flips to committed during the talk: read the **Fabric transaction ID** aloud.

**Say:** “Supply-chain proofs are custody attestations — who moved how much, when — without putting warehouse secrets or PII on chain.”  
**Do not say:** “Stock balances live only on the blockchain.”

---

## Act 2 — Card & eligibility (`/m/eligibility`)

**Persona:** `demo-department`  
**Screen:** eligibility-review

### What triggers a Fabric proof

| Action in UI | Proof story |
|--------------|-------------|
| **Register lifecycle record** / member add-remove / bifurcation / migration / deactivate | Beneficiary lifecycle event types (`BENEFICIARY_CREATED`, `HOUSEHOLD_BIFURCATED`, `RECORD_DEACTIVATED`, …) → outbox |
| **Issue notice / verification / recommendation / appeal** | Checkpoint proofs (`EligibilityNoticeIssued`, …) |
| **Authorize decision / reinstate** | Final proofs (`EligibilityDecisionAuthorized` / `EligibilityDecisionReversed`) |
| **Screening only** | Opens review — **no** Fabric proof required (`NOT_REQUIRED`) |

### Where to look in the UI

| Place | What to show |
|-------|----------------|
| Registry panel header | `pendingProofs` count |
| Selected case footer | `Fabric proof: PENDING \| COMMITTED \| …` next to RCMS status |
| After decision | `proofEventId` / proof status on the case |
| Privacy banner | “Fabric proofs use opaque hashes only” |

### Script beats (strongest fraud story)

1. Select **`BEN-DEMO-001`** → **Run external eligibility check** → `DEATH_MATCH_REVIEW`.
2. Say clearly: *“Screening opens human review; benefits stay open until an authorized decision.”*
3. Walk notice → verification → **Authorize cancellation** (or member removal path you prepared).
4. Run **Entitlement gate check** → blocked.
5. Point at **Fabric proof** status on the case — then promise to show the TX ID in Trust.

**Optional short add:** Register a lifecycle record or household bifurcation to show registry proofs are separate from the case workflow.

**Say:** “We prove authorized eligibility *decisions*, not demographics on chain.”  
**Do not say:** “Death signal alone revoked benefits” or “Aadhaar stored on Fabric.”

---

## Act 3 — FPS authentication (`/m/fps`)

**Persona:** `demo-fps` (FPS-101)  
**Screens:** workbench / allocations / **distribution**

### What triggers a Fabric proof

| Action | Proof story |
|--------|-------------|
| Mock OTP / simulated biometric **auth success** | Auth transaction evidence (opaque `aadhaarRefHash`) |
| **Distribute** ration against entitlement | `RecordDistribution` / distribution ledger event → outbox |
| Attempt on cancelled card | Blocked **before** issue — show Ineligible Beneficiary (eligibility gate), not a new proof of success |

### Where to look in the UI

| Place | What to show |
|-------|----------------|
| Distribution / auth panels | **ProvenanceBadges** + **ProofStatusBadges** on auth / allocation / entitlement / distribution rows |
| Distribution receipt | `ledgerTxId` linked proof status |
| Trust analytics later | Module bucket **fps** |

### Script beats

1. Confirm stock/allotment from Act 1 prep.
2. Happy path: mock auth success → distribute rice → show receipt + proof badge.
3. Contrast path (after Act 2 cancel): attempt issue on deactivated card → **Ineligible Beneficiary** / gate block.

**Say:** “ePoS authentication is simulated; we record privacy-safe auth and issue proofs.”  
**Do not say:** “Live UIDAI / AePDS terminal session.”

---

## Act 4 — Trust & reconcile (`/m/trust`) — the blockchain payoff

**Persona:** `demo-auditor` (or management)  
**Screens:** dashboard (Overview) → verify / audit-alerts as time allows

### Where blockchain is most visible

| UI surface | Route / component | What it proves |
|------------|-------------------|----------------|
| **Fabric · Cross-module proof analytics** | `/dashboard` → `FabricAnalyticsPanel` | Outbox pipeline: COMMITTED / PENDING / FAILED / DEAD_LETTER |
| **Lifecycle proof completeness** | Same panel | Beneficiary + eligibility expected vs committed; missing-proof / drift alerts |
| **By module volumes** | Same panel | supply-chain · eligibility · fps buckets |
| **Recent envelopes** | Same panel | `eventId`, `fabricTxId`, `payloadHash`, entity refs, status |
| **Proof detail drawer** | Click recent proof (mgmt/auditor) | Privacy-safe `proofPayload` — no cleartext PII |
| **Hash-keyed trail** | Trust search / API `GET /ledger-proofs?beneficiaryRefHash=` | Auditor finds trail by **hash**, not name |
| **Verify / Trace** | `/verify` | Lot / distribution trace + alerts (reconcile story) |
| **Admin network** (optional) | `/admin` | Ledger mode fabric vs demo |

### Script beats

1. Open Trust Overview. Point at **Committed** count and **commit success %**.
2. Open **by module** — “Proofs came from all three operational modules.”
3. Click one recent COMMITTED row → show **`fabric_tx_id`** — *“That is the Hyperledger Fabric transaction ID.”*
4. Open detail → show hashes / opaque refs only.
5. Completeness panel: *“We can detect missing proofs or dead letters without claiming the DB equals the chain byte-for-byte.”*
6. Optional: hash-keyed search for the beneficiary you cancelled in Act 2.

**Say:** “Trust is the oversight plane over the three modules — not a fourth upstream government system.”  
**Do not say:** “Search blockchain by cleartext Beneficiary ID / Aadhaar.”

---

## Claim language cheat sheet

| Honest claim | Unsafe claim |
|--------------|--------------|
| Privacy-safe immutable proof of an authorized event | Demographics / Aadhaar on chain |
| Async Fabric proof with `fabric_tx_id` | Synchronous “blockchain confirmed” on every click |
| Postgres is operational source of truth | Fabric re-executes business commands |
| Complementary trust layer | Replacement for SMART-PDS / RCMS / AePDS |
| Screening opens review | Ghost flag alone blocks FPS |
| Outbox eventually consistent | Crash-safe multi-replica production |

---

## Facilitator map — “where is blockchain in the app?”

```
/m/supply-chain
  workbench actions ──► ProofStatusBadges
  lots / transfers / allocations ──► provenance + later Trust supply-chain bucket

/m/eligibility
  registry lifecycle ──► pendingProofs + outbox
  case notice/verify/decide ──► case.proofStatus / proofEventId
  screening alone ──► no proof (by design)

/m/fps
  auth + distribute ──► ProvenanceBadges / ProofStatusBadges on rows
  ineligible gate ──► block (eligibility), not a success proof

/m/trust
  Overview FabricAnalyticsPanel ──► outbox pipeline + module buckets + fabricTxId
  verify / alerts ──► reconcile + drift narrative
  hash-keyed proof trail ──► auditor search

/admin (optional)
  network / ledger mode ──► fabric vs demo
```

---

# Outbox briefing — what it is, how it is designed, why it matters

## What the outbox is (plain language)

The **ledger outbox** is a PostgreSQL table (`ledger_outbox`) that acts as a **durable queue** between the API and Hyperledger Fabric.

When a business operation succeeds, ViksitPDS does **not** wait for Fabric to finish before telling the operator “accepted.” Instead it:

1. Writes the operational change (and usually a `ledger_events` row).
2. Inserts a proof intent into `ledger_outbox` with status **`PENDING`**.
3. Returns success to the UI.
4. A background **outbox worker** later submits that payload to Fabric as `RecordLedgerProof`.
5. On confirmed Fabric commit, the row becomes **`COMMITTED`** and stores the real **`fabric_tx_id`**.

That pattern is the classic **Transactional Outbox**: keep “what must be published” in the same database that owns the business state, then publish asynchronously.

## Why it exists (the problem it solves)

If the API called Fabric **synchronously** inside the user request:

| Failure mode | Bad outcome without outbox |
|--------------|----------------------------|
| Fabric slow / down | Operator waits or request times out; FPS/depot blocked |
| Fabric succeeds, DB write fails | Proof without operational record (or messy compensation) |
| DB succeeds, Fabric fails | Operation done but no immutable evidence — and easy to forget retry |
| Dual-write race | “Did we prove it?” becomes unanswerable |

With the outbox:

- **Operations stay fast and available** even when Fabric lags.
- **Proof intent is durable** (a row you can query, retry, and audit).
- **Fabric delay never rolls back** a valid PostgreSQL operation (product rule).
- You can **measure** pending / failed / dead-letter proofs in Trust analytics.

## How it is designed in this repo

### Table (conceptual)

`ledger_outbox` holds at least:

- `event_id` / `operation_id` / `idempotency_key` — stable identity for the proof
- `event_payload` — LedgerEvent-shaped JSON (privacy-filtered before/at submit)
- `status` — lifecycle below
- `retry_count`, `next_attempt_at`, `last_error`
- `fabric_tx_id`, `committed_at` — only after Fabric confirms
- `submitting_at` / `dead_lettered_at` — claim and terminal failure timestamps

### Status machine

| Status | Meaning |
|--------|---------|
| `PENDING` | Ready (or scheduled) for submission |
| `SUBMITTING` | Claimed by one worker (`FOR UPDATE SKIP LOCKED`) |
| `COMMITTED` | Fabric confirmed; `fabric_tx_id` recorded |
| `FAILED` | Retryable; exponential backoff via `next_attempt_at` |
| `DEAD_LETTER` | Retry limit exhausted (5); needs manual intervention |

### Worker behavior (`FabricGatewayLedgerPort`)

- Embedded in the API process for the controlled demo (poll ~every 2s).
- Claims up to 10 ready rows with **`FOR UPDATE SKIP LOCKED`** so only one worker owns a row.
- Submits via Fabric gateway → **`RecordLedgerProof`**.
- Marks **COMMITTED** only after commit confirmation — never earlier.
- On error: bump retry, schedule backoff (`2^retry` seconds, capped), or **DEAD_LETTER** at limit.
- Reclaims stale **SUBMITTING** rows after restart so a crashed claim does not stick forever.

### Who enqueues

| Module | Typical enqueue site |
|--------|----------------------|
| Supply chain / core ledger | `pds-runtime` / Fabric gateway ledger port `appendEvents` |
| Beneficiary registry | `beneficiary-registry.repository` (lifecycle events) |
| Eligibility | Checkpoint + final decision paths in `eligibility.repository` |
| Integrations | Source-event acceptance paths |

### What goes on chain

A **LedgerProof** envelope: `eventId`, operation metadata, actor / org, **payload hash**, schema version, opaque entity refs — validated so nested sensitive fields (Aadhaar, OTP, phone, full RC, biometrics) are rejected.

Identical replay of the same `eventId` succeeds; conflicting content for an existing `eventId` fails.

## Why it matters for the demo narrative

1. **Honest dual-state UI** — “Distribution succeeded” and “Blockchain proof pending” can both be true. That is a feature, not a bug.
2. **Auditor story** — Trust Overview is largely an **outbox analytics** view (`GET /ledger-proofs/analytics`), not a live Fabric world-state browser.
3. **Resilience story** — Fabric hiccup ≠ failed ration issue or failed custody move.
4. **Governance story** — Two-org Fabric endorsement still happens; the outbox just **decouples** endorsement latency from the operator path.
5. **Completeness / drift** — You can show missing proofs or dead letters as trust signals without claiming crash-proof multi-replica production (see demo assumptions waiver).

## One slide diagram (draw this if asked)

```
┌─────────────┐     commit      ┌──────────────┐
│  API / Ops  │ ──────────────► │  PostgreSQL  │
│  command    │                 │  business +  │
└─────────────┘                 │  ledger_outbox│
                                └──────┬───────┘
                                       │ poll / claim
                                       ▼
                                ┌──────────────┐
                                │ Outbox worker│
                                └──────┬───────┘
                                       │ RecordLedgerProof
                                       ▼
                                ┌──────────────┐
                                │ Fabric peers │
                                │ Food + Godown│
                                └──────────────┘
```

## Q&A ready answers

**Q: Is the outbox BullMQ / Kafka?**  
A: No — PostgreSQL table + embedded poller for the controlled demo. A future standalone worker can keep using PG as the durable queue.

**Q: Can I trust an operation if proof is still PENDING?**  
A: Operationally yes (Postgres accepted it). Cryptographic immutability is complete only at COMMITTED + `fabric_tx_id`.

**Q: What if the API crashes between business write and outbox insert?**  
A: Under the current controlled-demo waiver, that gap is possible for some paths — run one API replica, reset before demos, and verify outbox drain after the lifecycle. Full atomic command+outbox hardening is tracked separately.

**Q: Does Fabric store the ration card?**  
A: No — hashes and opaque references only.

---

## Timing guide (20-minute cut)

| Min | Act |
|-----|-----|
| 0–2 | Pitch + architecture soundbite |
| 2–7 | Supply chain one movement + proof badge |
| 7–14 | Eligibility death-match → decide → gate block + proof status |
| 14–17 | FPS happy distribute + proof badge |
| 17–20 | Trust analytics + fabric_tx_id + outbox one-liner |

Keep the full outbox briefing for Q&A unless someone asks mid-demo — then use the status machine table only.

1. PdsControlContract

  Governance and policy operations:

  - Stakeholder registration
  - Ration-card lifecycle
  - Entitlement-rule proposal and approval
  - Quota rollover
  - Governance-related queries

  2. PdsDataContract

  Operational and evidence operations:

  - Commodity movement and receipts
  - FPS allocation and distribution
  - Audit flags and grievances
  - Operational queries
  - RecordLedgerProof

  The important architectural point: PostgreSQL remains authoritative. The API normally submits only asynchronous, privacy-safe
  RecordLedgerProof transactions through PdsDataContract. The other named business transactions are retained as compatibility
  functions—not the API’s primary Fabric integration path.

  Both contracts are registered from the same chaincode package and share the same channel/world state. See blockchain/chaincode/
  pds-chaincode/src/contract.ts:1 and blockchain/chaincode/pds-chaincode/src/server.ts:1.

 - 2 MSP organizations: FoodAndCivilSuppliesMSP and GodownWarehouseMSP
  - 1 channel: pdschannel
  - 1 chaincode: pds-chaincode
  - 2 contracts: PdsControlContract and PdsDataContract


 RecordLedgerProof:

  {
    "eventId": "<unique business event ID>",
    "operationId": "<usually the same as eventId>",
    "eventType": "<operation type, e.g. DispatchLot>",
    "schemaVersion": 1,
    "entityType": "<lot | transfer | allocation | distribution | ...>",
    "entityId": "<primary entity ID>",
    "actor": {
      "subject": "pds-api",
      "applicationRole": "SYSTEM",
      "submittingOrganization": "FoodAndCivilSuppliesMSP"
    },
    "payloadHash": "<64-character SHA-256 hash>",
    "proofPayload": {
      "<operation-specific non-sensitive evidence>": "<value>"
    },
    "businessTimestamp": "<ISO-8601 API-generated timestamp>"
  }

  For example:

  {
    "eventId": "EVT-DISPATCH-001",
    "operationId": "EVT-DISPATCH-001",
    "eventType": "DispatchLot",
    "schemaVersion": 1,
    "entityType": "transfer",
    "entityId": "TRANSFER-001",
    "actor": {
      "subject": "pds-api",
      "applicationRole": "SYSTEM",
      "submittingOrganization": "FoodAndCivilSuppliesMSP"
    },
    "payloadHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "proofPayload": {
      "lotId": "LOT-001",
      "quantityKg": 500,
      "sourceStakeholderId": "GODOWN-001",
      "destinationStakeholderId": "FPS-001"
    },
    "businessTimestamp": "2026-07-31T10:30:00.000Z"
  }

  The exact submission is effectively:

  RecordLedgerProof(JSON.stringify(ledgerProof))
