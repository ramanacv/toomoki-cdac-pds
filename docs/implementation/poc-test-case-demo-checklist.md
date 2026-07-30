# POC Test-Case Demo Checklist

**Date:** 2026-07-29  
**Branch:** `docs/poc-test-case-gap-analysis`  
**Companion analysis:** [poc-test-case-gap-analysis.md](poc-test-case-gap-analysis.md)  
**Source TCs:** [Draft a test case document…](../requirements/Draft%20a%20test%20case%20document%20for%20the%20attached%20file.%20....pdf)

Use this checklist when evaluators walk the draft POC test cases against
ViksitPDS. Score against the **complementary trust-layer** reading, not as if
ViksitPDS replaced SMART-PDS/RCMS, UIDAI, or AePDS.

## How to score each TC

| Mode | Meaning |
|------|---------|
| **SHOW** | Run as close to the written TC as the product allows |
| **REMAP** | Demo adjacent capability; use the claim language below |
| **DEFER** | Out of trust-layer / POC scope; do not attempt live |

Pass a remapped TC only if the demo matches the **Expected (honest)** column
and the facilitator uses the **Say / Do not say** lines.

## Preconditions (before any external walkthrough)

1. Reset and reseed the controlled demo (authorized only).
2. Compose online with API + Keycloak + Postgres; enable profiles `eligibility`
   and `epos` / `mocks` as needed ([three-module-mock-services.md](three-module-mock-services.md)).
3. Prefer `http://localhost:4173` for OIDC (not bare `127.0.0.1` redirect URIs).
4. Run custody prep so FPS issue is unlocked:
   `node scripts/live-lifecycle.mjs` after reset/reseed, or workbench FCI →
   Godown → DSO → Godown → BSO → FPS.
5. Confirm Fabric outbox can reach `COMMITTED` (or report proof status
   separately from operational success — [assumptions-for-demo.md](../product/assumptions-for-demo.md)).
6. Use Keycloak personas; switching personas via `/role-login` ends SSO first.

| Persona | Username | Primary module |
|---------|----------|----------------|
| Eligibility / Control Office | `demo-department` | `/m/eligibility` |
| FPS Haveli (FPS-101) | `demo-fps` | `/m/fps` |
| Auditor | `demo-auditor` | `/m/trust` |

---

## Suggested live order (≈25–40 min)

1. TC_BR_001 → TC_BC_001 (create + proof trail)
2. TC_FD_002 → TC_BR_004 → TC_INT_003 (ghost review → cancel → FPS block)
3. TC_INT_002 (happy-path FPS issue on a still-eligible card)
4. TC_FD_003 / TC_FD_001 remaps (JK duplicate review)
5. TC_BR_003 (bifurcation soft)
6. TC_BC_002 soft + TC_SYNC_001 soft + TC_PERF_001 soft (API/Trust)
7. State DEFER for TC_BR_002 and TC_INT_001

---

## Module scorecard (facilitator quick view)

| ID | Mode | Pass if you can show… |
|----|------|------------------------|
| TC_BR_001 | SHOW (partial) | Opaque lifecycle create + later Fabric `fabric_tx_id` |
| TC_BR_002 | DEFER | Demographic update is RCMS/SoR — skip live |
| TC_BR_003 | REMAP | Household size shrink + lifecycle proof (not child-card lineage) |
| TC_BR_004 | REMAP | Death review then cancel/remove; gate blocks FPS |
| TC_FD_001 | REMAP | Opaque linkage duplicate **review** (not Aadhaar reject-on-create) |
| TC_FD_002 | SHOW (mocked) | `BEN-DEMO-001` → `DEATH_MATCH_REVIEW` guided case |
| TC_FD_003 | REMAP | JK linkage collision review across demo districts |
| TC_INT_001 | DEFER | Registration e-KYC is SoR/UIDAI — skip live |
| TC_INT_002 | SHOW (mocked) | FPS-101 auth success → distribute → receipt/proof |
| TC_INT_003 | REMAP | Block after cancel/removal with **Ineligible Beneficiary** notice; **not** ghost-flag alone |
| TC_BC_001 | SHOW (partial) | Hash-keyed trail search + cryptographic Fabric TX ID |
| TC_BC_002 | REMAP | Proof immutability + Trust completeness/drift (not DB stock vs chain) |
| TC_SYNC_001 | REMAP | Multi-source ingest + 2-org Fabric proofs (not municipal→central SoR) |
| TC_PERF_001 | REMAP | Idempotent ePoS `sourceEventId` replay (not offline device queue) |

---

## Per-TC runbook

### TC_BR_001 — Create beneficiary + blockchain hash

| | |
|--|--|
| **Mode** | SHOW (partial) |
| **Persona / route** | `demo-department` → `/m/eligibility` |
| **Fixture / action** | Registry panel → **Register lifecycle record** |
| **Optional script** | `npm run live:beneficiaries` / `scripts/live-beneficiary-lifecycle.mjs` |
| **Expected (honest)** | Unique opaque registry ID (`beneficiaryRefHash`); `proofEventId`; after outbox poll, Trust/admin shows `COMMITTED` + `fabric_tx_id` |
| **Say** | “Privacy-safe lifecycle create with asynchronous Fabric proof.” |
| **Do not say** | “Demographics stored on-chain” or “transaction hash returned synchronously on create.” |

**Checkboxes**

- [ ] Create succeeds; registry summary count increments
- [ ] Proof moves to `COMMITTED` with real `fabric_tx_id` (or explicitly note proof pending)

---

### TC_BR_002 — Update demographics

| | |
|--|--|
| **Mode** | DEFER |
| **Why** | No demographic model in ViksitPDS registry; SMART-PDS/RCMS owns demographics |
| **Optional soft show** | **Record migration** or status change only — label as *not* demographic update |
| **Say** | “Demographic maintenance remains with RCMS; we prove authorized lifecycle events.” |
| **Do not say** | “We updated address/name on the blockchain.” |

- [ ] Facilitator states DEFER / SoR-owned (no failed live attempt)

---

### TC_BR_003 — Family bifurcation

| | |
|--|--|
| **Mode** | REMAP |
| **Persona / route** | `demo-department` → `/m/eligibility` |
| **Action** | **Record family bifurcation** (household size delta −1) |
| **Expected (honest)** | Same card household size shrinks; lifecycle event + privacy-safe proof queued |
| **Say** | “We record an authorized household bifurcation event and proof.” |
| **Do not say** | “New family card created with on-chain parent–child lineage.” |

- [ ] Household size decreases; proof event visible / pending→committed

---

### TC_BR_004 — Mark deceased / ineligible

| | |
|--|--|
| **Mode** | REMAP (pairs with TC_FD_002) |
| **Persona / route** | `demo-department` → `/m/eligibility` |
| **Fixture** | After death-match on `BEN-DEMO-001` (or cancel on an applicable card) |
| **Actions** | Guided verification → **Authorize cancellation** / member removal / **Remove selected** |
| **Then** | **Entitlement gate check** → blocked |
| **Expected (honest)** | Gate blocked only after authorized RCMS-style decision or removal; `RECORD_DEACTIVATED` / decision proof |
| **Say** | “Screening opens review; an authorized decision revokes distribution eligibility.” |
| **Do not say** | “Death certificate uploaded” or “death signal alone immediately revoked benefits.” |

- [ ] Gate shows blocked after decision/removal
- [ ] No claim of document upload

---

### TC_FD_001 — Duplicate Aadhaar reject-on-create

| | |
|--|--|
| **Mode** | REMAP |
| **Persona / route** | `demo-department` → `/m/eligibility` |
| **Fixture** | `BEN-JK-DEMO-001` → **Run external eligibility check** → `DUPLICATE_RECORD_REVIEW` |
| **Optional** | Officer **Remove selected** with reason `DUPLICATE_RECORD` |
| **Expected (honest)** | Opaque `linkageDigest` collision opens human review (not Aadhaar match; not create reject) |
| **Say** | “Privacy-preserving linkage review for possible duplicate registry references.” |
| **Do not say** | “System rejected create because Aadhaar X already exists.” |

- [ ] Duplicate review case opens
- [ ] Facilitator explicitly remaps away from Aadhaar reject-on-create

---

### TC_FD_002 — Ghost / deceased from civil registration

| | |
|--|--|
| **Mode** | SHOW (mocked) — strongest fraud demo |
| **Persona / route** | `demo-department` → `/m/eligibility` |
| **Fixture** | Select `BEN-DEMO-001` (Asha Patil narrative) |
| **Actions** | **Run external eligibility check** → expect `DEATH_MATCH_REVIEW` → Issue notice → Record verification → decision path |
| **Expected (honest)** | Mock death-registry signal; case for human verification; benefits still open until decision |
| **Say** | “Simulated death-registry match opens review; no automatic exclusion.” |
| **Do not say** | “Live civil registration push sync.” |

- [ ] Status `DEATH_MATCH_REVIEW` / death-registry signal visible
- [ ] Entitlement still allowed **before** decision (if asked)

---

### TC_FD_003 — Cross-district duplicate flag

| | |
|--|--|
| **Mode** | REMAP |
| **Persona / route** | `demo-department` → `/m/eligibility` |
| **Fixture** | `BEN-JK-DEMO-001` (+ document twin `001B` linkage in mock narrative) |
| **Expected (honest)** | Same opaque linkage digest → duplicate review; distinct demo `districtCode`s |
| **Say** | “Cross-reference style linkage collision across demo districts.” |
| **Do not say** | “Biometric match engine across live districts.” |

- [ ] JK duplicate review demonstrated
- [ ] Optional: contrast with migration on `BEN-JK-DEMO-003` as a *different* story

---

### TC_INT_001 — Registration e-KYC

| | |
|--|--|
| **Mode** | DEFER |
| **Why** | FPS/citizen OTP are distribution or self-service login, not RCMS registration e-KYC |
| **Optional adjacent** | FPS `/auth/mock-otp` or `/citizen` login — label **not** registration e-KYC |
| **Say** | “Registration e-KYC remains with UIDAI/RCMS; we simulate FPS authentication for issue.” |
| **Do not say** | “This is registration e-KYC with demographic match from UIDAI.” |

- [ ] Facilitator states DEFER (no failed live registration wizard)

---

### TC_INT_002 — ePoS distribution against registry

| | |
|--|--|
| **Mode** | SHOW (mocked) |
| **Persona / route** | `demo-fps` → `/m/fps` Distribution / workbench |
| **Prep** | Active eligible card + FPS stock (lifecycle prep above) |
| **Actions** | Mock OTP or simulated biometric success → distribute rice |
| **Optional script** | `npm run live:fps-auth` / `scripts/live-fps-auth-lifecycle.mjs` |
| **Prep note** | Script raises monthly entitlement when prior `live-lifecycle` lifts leave balance too low (`POST /entitlements` cannot zero `already_lifted` because upserts use `GREATEST`) |
| **Expected (honest)** | Auth success + entitlement + gate open → distribution logged; proof may lag |
| **Say** | “Simulated ePoS authentication validates issue against entitlement and eligibility gate.” |
| **Do not say** | “Live AePDS terminal session against SMART-PDS master.” |

- [ ] Distribution succeeds with receipt
- [ ] Proof status shown (committed or pending called out)

---

### TC_INT_003 — Block deactivated / ghost at ePoS

| | |
|--|--|
| **Mode** | REMAP |
| **Order** | After TC_FD_002 / TC_BR_004 cancel on the target card |
| **Persona / route** | Same eligibility gate check, then `demo-fps` distribute attempt |
| **Expected (honest)** | Gate / distribute fails after cancel/removal; UI **Ineligible Beneficiary** · `EFFECTIVE_RCMS_DECISION`; FPS API `code: INELIGIBLE_BENEFICIARY` |
| **Say** | “After an authorized cancellation, FPS issue is blocked as Ineligible Beneficiary.” |
| **Do not say** | “Ghost flag alone blocked distribution.” |

**Alternate:** auth-failure hash → distribute rejected (auth path, not eligibility).

- [ ] Block demonstrated after decision/removal with Ineligible Beneficiary notice
- [ ] Facilitator notes ghost screening alone does not block

---

### TC_BC_001 — Audit trail + cryptographic TX IDs

| | |
|--|--|
| **Mode** | SHOW (partial) |
| **Persona / route** | `demo-auditor` → `/m/trust` (or department after create) |
| **Actions** | Trust **Hash-keyed proof trail** search with opaque `beneficiaryRefHash` / `entityId`, or API `GET /ledger-proofs?beneficiaryRefHash=` / `entityId=` |
| **API** | `GET /ledger-proofs?entityId=` / `beneficiaryRefHash=`, `GET /ledger-proofs/:eventId`, `GET /admin/proofs/summary` |
| **Expected (honest)** | Time-ordered lifecycle / ledger events keyed by hash; Fabric `fabric_tx_id` when committed |
| **Say** | “Hash-keyed immutable proof trail with Fabric transaction IDs.” |
| **Do not say** | “Search the blockchain by cleartext Beneficiary ID.” |

- [ ] At least one `COMMITTED` proof with `fabric_tx_id` shown via hash-keyed search or proof status
- [ ] Search key explained as opaque ref / hash

---

### TC_BC_002 — DB vs blockchain tamper alert

| | |
|--|--|
| **Mode** | REMAP |
| **Persona / route** | `demo-auditor` → `/m/trust` |
| **Actions** | Show completeness / drift / missing-proof or dead-letter panels; optionally explain identical vs conflicting proof replay |
| **Expected (honest)** | Tamper-evident proofs; Trust integrity signals; Postgres remains operational SoT |
| **Say** | “We detect proof incompleteness and conflicting proof replay; operational DB stays authoritative.” |
| **Do not say** | “Editing PostgreSQL stock automatically raises a blockchain security alert.” |

- [ ] Completeness/drift or immutability narrative shown
- [ ] Async proof lag distinguished from tamper

---

### TC_SYNC_001 — Multi-agency sync to central registry

| | |
|--|--|
| **Mode** | REMAP |
| **Demo** | Ingest SMART-PDS / SCM / ePoS fixture events via integration APIs; show 2-org Fabric endorsement story |
| **API examples** | `POST /integrations/epos/v1/distribution-events` (and related SMART-PDS/SCM routes) |
| **Expected (honest)** | Events appear in ViksitPDS; proofs sync across Food + Godown peers |
| **Say** | “Multi-source ingestion into the trust layer and multi-org Fabric proof sync.” |
| **Do not say** | “Municipal node updated the central SMART-PDS registry in real time.” |

- [ ] At least one multi-source ingest or documented 2-org proof story
- [ ] Facilitator states ViksitPDS is not the central SoR

---

### TC_PERF_001 — Offline ePoS reconnect without duplicates

| | |
|--|--|
| **Mode** | REMAP |
| **Demo** | POST same ePoS `sourceEventId` twice to integration ingest |
| **Expected (honest)** | First accepted; second `DUPLICATE` (no double apply); conflict → `409` |
| **Say** | “Idempotent reconnect ingest for simulated ePoS events (`deviceSyncAt` supported).” |
| **Do not say** | “Field offline ePoS device queue verified.” |

- [ ] Duplicate replay demonstrated (API or scripted)
- [ ] Offline client explicitly out of scope

---

## Claim language cheat sheet

| Safe | Unsafe |
|------|--------|
| Complementary trust / audit layer for SMART-PDS, ePoS, RCMS | Replacement beneficiary registry / SoR |
| Privacy-safe hashes and opaque refs | Aadhaar / biometrics / OTP / full ration card on Fabric |
| Async outbox → Fabric `fabric_tx_id` | Sync TX hash on every create response |
| Mock / simulated external screening and ePoS auth | Live UIDAI, CRS, or AePDS production integration |
| Human decision gates distribution | Ghost flag auto-blocks issue |
| Operational success ≠ proof completion | “Blockchain confirmed” before outbox `COMMITTED` |

## After the walkthrough

Record separately:

1. Which TCs were SHOW / REMAP / DEFER
2. Operational outcomes vs proof outcomes (`COMMITTED` count, any `FAILED` / `DEAD_LETTER`)
3. Any environment blockers (OIDC, eligibility mock down, empty FPS stock)

Do not mark the near-MVP complete from a single checklist pass while
[mvp-hardening-plan.md](mvp-hardening-plan.md) critical gates remain open.
