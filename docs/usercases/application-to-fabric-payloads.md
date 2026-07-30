# Application → Fabric payloads (by use case)

Captured: 2026-07-30. Branch/context: live Fabric mode (`PDS_LEDGER_MODE=fabric`).

## Summary: POST touch points → Fabric

**29 POST HTTP routes** enqueue a Fabric proof (via outbox → `RecordLedgerProof`).

There is still only **1** Fabric write API: `RecordLedgerProof`.

| Area | POST routes that enqueue |
|------|--------------------------|
| Supply chain | 7 (`/stakeholders`, `/lots`, `/transfers`, `/receive`, `/authorize`, `/fps-allocations`, `/receipt`) |
| FPS auth / issue | 5 (`/auth/mock-otp`, `/simulated-biometric`, `/supervisor-exception`, `/entitlements`, `/distributions`) |
| Audit / admin | 3 (`/audit-alerts/reconcile`, `/resolve`, `/admin/reset`) |
| Eligibility | 7 (6 case actions + `/beneficiaries/removals`) |
| Registry / portal | 2 (`/beneficiary-registry/.../events`, `/me/surrender`) |
| Integrations | 5 (4 ingest + `/reconcile`) |
| **Total** | **29** |

Those POSTs produce **33** distinct `eventType` values in the proof payload (e.g. `DispatchLot`, `RecordDistribution`, 6 eligibility types, 9 registry types, …).

Not counted: POSTs that never write proofs (`/screenings`, `/entitlements/validate`, `/entitlement-gate`, portal OTP/login, `/trace/verify`, etc.).

## How every write reaches Fabric

PostgreSQL is authoritative for business state. Fabric receives **only** an immutable proof. In live Fabric mode the NestJS API never calls named business chaincode transactions (`DispatchLot`, `AllocateToFPS`, …) for writes.

```text
HTTP mutation
  → Postgres commit (state + ledger_events + ledger_outbox)
  → outbox worker (every ~2s)
  → ledgerProofFromEvent(LedgerEvent)
  → Fabric gateway submit: RecordLedgerProof(<LedgerProof JSON>)
  → outbox status COMMITTED + fabric_tx_id
```

| Stage | Location |
|-------|----------|
| Proof builder | `apps/api/src/modules/fabric/ledger-proof.ts` → `ledgerProofFromEvent` |
| Submit | `apps/api/src/modules/fabric/fabric-gateway.client.ts` → `submitLedgerEventAsync` |
| Chaincode | `PdsDataContract.RecordLedgerProof(ctx, payloadJson)` |
| Outbox enqueue (supply / FPS) | `apps/api/src/modules/core/pds-runtime.ts` → `saveStateChanges` |
| Outbox enqueue (eligibility) | `apps/api/src/modules/eligibility/eligibility.repository.ts` → `insertProof` |
| Outbox enqueue (registry) | `apps/api/src/modules/beneficiary-registry/beneficiary-registry.repository.ts` |
| Outbox enqueue (integrations) | `apps/api/src/modules/integrations/integration-events.service.ts` |

`ledger_outbox.event_payload` stores the **`LedgerEvent`**. The worker transforms it into a **`LedgerProof`** before Fabric submit.

---

## Universal Fabric envelope (`LedgerProof`)

Every use case below is wrapped in this top-level object. Only `eventType`, `entityType`, `entityId`, `businessTimestamp`, and `proofPayload` change per use case.

```json
{
  "eventId": "<same as LedgerEvent.ledgerTxId>",
  "operationId": "<usually same as eventId>",
  "eventType": "<see each use case>",
  "schemaVersion": 1,
  "entityType": "<see each use case>",
  "entityId": "<primary entity id>",
  "actor": {
    "subject": "pds-api",
    "applicationRole": "SYSTEM",
    "submittingOrganization": "FoodAndCivilSuppliesMSP"
  },
  "payloadHash": "<sha256 hex of canonicalJson(proofPayload)>",
  "proofPayload": { },
  "businessTimestamp": "<ISO-8601 from the business event>"
}
```

`submittingOrganization` is the gateway MSP ID from Fabric runtime config (demo default `FoodAndCivilSuppliesMSP`).

### Stored outbox `LedgerEvent` (pre-transform)

```json
{
  "ledgerTxId": "<eventId>",
  "entityType": "<…>",
  "entityId": "<…>",
  "eventType": "<…>",
  "payload": { },
  "timestamp": "<ISO-8601>"
}
```

`proofPayload` ≈ `payload` except `RegisterStakeholder`, where prohibited keys (`name`, `dealerName`, …) are stripped via `privacySafeCopy`.

---

## Privacy rules applied before Fabric submit

From `ledger-proof.ts` / chaincode:

- No raw Aadhaar, mobile, phone, OTP, biometric, address, credential fields.
- No cleartext `name` / `beneficiaryName` / `dealerName` in proofs (stakeholder soft-redact; other types fail hard).
- No cleartext ration-card values (use `rationCardHash` / opaque digests).
- String values that look like 10–16 digit identifiers are rejected.
- Opaque keys ending in `Hash` / `RefHash` / `Digest` are allowed.

---

## UC-01 — Register stakeholder

| | |
|--|--|
| **Trigger** | `POST /stakeholders` |
| **eventType** | `RegisterStakeholder` |
| **entityType** | `stakeholder` |
| **entityId** | `stakeholderId` |

**`proofPayload` (after redact — `name` / `dealerName` removed):**

```json
{
  "stakeholderId": "FPS-101",
  "stakeholderType": "FAIR_PRICE_SHOP",
  "district": "Demo",
  "licenseNo": "LIC-FPS-101",
  "status": "ACTIVE",
  "jurisdiction": "STATE",
  "dealerId": "DLR-101",
  "shopNo": "101",
  "blockName": "Demo Block",
  "tehsilName": "Demo Tehsil",
  "location": "Ward 1"
}
```

---

## UC-02 — Create commodity lot

| | |
|--|--|
| **Trigger** | `POST /lots` (also after `POST /admin/reset` reseed) |
| **eventType** | `CreateCommodityLot` |
| **entityType** | `lot` |
| **entityId** | `lotId` |

```json
{
  "lotId": "LOT-RICE-R20260730-001",
  "commodity": "Rice",
  "season": "2026-Kharif",
  "quantityKg": 10000,
  "qualityGrade": "A",
  "source": "PROC-001",
  "currentOwner": "FCI-001",
  "currentLocation": "FCI Depot",
  "status": "CREATED",
  "createdAt": "2026-07-30T06:00:00.000Z",
  "rootLotId": "LOT-RICE-R20260730-001",
  "originalQuantityKg": 10000,
  "remainingQuantityKg": 10000,
  "unit": "KG",
  "version": 1
}
```

Optional lineage fields when present: `parentLotId`, `transformedFromLotId`.

---

## UC-03 — Authorize movement (Stage-II / RO)

| | |
|--|--|
| **Trigger** | `POST /transfers/:transferId/authorize` |
| **eventType** | `AuthorizeMovement` |
| **entityType** | `workflow` |
| **entityId** | `transferId` |

```json
{
  "transferId": "TR-STAGE2-001",
  "authorizedBy": "RO-001",
  "authorizedAt": "2026-07-30T07:00:00.000Z",
  "roRef": "RO/2026/001",
  "remarks": "Approved for Stage-II"
}
```

`roRef` / `remarks` omitted when not supplied.

---

## UC-04 — Dispatch lot

| | |
|--|--|
| **Trigger** | `POST /transfers` |
| **eventType** | `DispatchLot` |
| **entityType** | `transfer` |
| **entityId** | `transferId` |

```json
{
  "transferId": "TR-001",
  "lotId": "LOT-RICE-R20260730-001",
  "fromOrg": "FCI-001",
  "toOrg": "GODOWN-S-001",
  "dispatchedQtyKg": 500,
  "vehicleNo": "MH12AB1234",
  "status": "DISPATCHED",
  "dispatchTimestamp": "2026-07-30T08:00:00.000Z",
  "transporterId": "TRANS-001",
  "transporterName": "Demo Transporter",
  "stage": "I"
}
```

May also include `authorizedBy`, `authorizedAt`, `approvalStatus`, `roRef`, `transformedFromLotId`, `provenance` when set on the transfer.

> Note: `transporterName` is a stakeholder display snapshot. It is **not** on the prohibited-key list today (unlike `name` / `dealerName`). Prefer treating transporter identity as non-PII demo labels.

---

## UC-05 — Receive lot

| | |
|--|--|
| **Trigger** | `POST /transfers/:transferId/receive` |
| **eventType** | `ReceiveLot` |
| **entityType** | `transfer` |
| **entityId** | `transferId` |

Same shape as UC-04 with receive fields:

```json
{
  "transferId": "TR-001",
  "lotId": "LOT-RICE-R20260730-001",
  "fromOrg": "FCI-001",
  "toOrg": "GODOWN-S-001",
  "dispatchedQtyKg": 500,
  "receivedQtyKg": 495,
  "shortageQtyKg": 5,
  "vehicleNo": "MH12AB1234",
  "status": "RECEIVED_WITH_SHORTAGE",
  "dispatchTimestamp": "2026-07-30T08:00:00.000Z",
  "receiveTimestamp": "2026-07-30T10:00:00.000Z",
  "transporterId": "TRANS-001",
  "transporterName": "Demo Transporter"
}
```

Shortage / exception paths often enqueue a **second** proof: `RaiseAuditFlag` (UC-12).

---

## UC-06 — Allocate to FPS

| | |
|--|--|
| **Trigger** | `POST /fps-allocations` |
| **eventType** | `AllocateToFPS` |
| **entityType** | `allocation` |
| **entityId** | `allocationId` |

```json
{
  "allocationId": "ALLOC-FPS-101-2026-07",
  "fpsId": "FPS-101",
  "commodity": "Rice",
  "allocatedQtyKg": 100,
  "month": "2026-07",
  "sourceGodownId": "GODOWN-B-001",
  "status": "ALLOCATED",
  "transporterId": "TRANS-001",
  "transporterName": "Demo Transporter",
  "vehicleNo": "MH12CD5678",
  "dispatchTimestamp": "2026-07-30T11:00:00.000Z",
  "ledgerTxId": "TX-…"
}
```

---

## UC-07 — Record FPS receipt

| | |
|--|--|
| **Trigger** | `POST /fps-allocations/:allocationId/receipt` |
| **eventType** | `RecordFPSReceipt` |
| **entityType** | `allocation` |
| **entityId** | `allocationId` |

```json
{
  "allocationId": "ALLOC-FPS-101-2026-07",
  "fpsId": "FPS-101",
  "commodity": "Rice",
  "allocatedQtyKg": 100,
  "receivedQtyKg": 98,
  "shortageQtyKg": 2,
  "month": "2026-07",
  "sourceGodownId": "GODOWN-B-001",
  "status": "RECEIVED_WITH_SHORTAGE",
  "transporterId": "TRANS-001",
  "transporterName": "Demo Transporter",
  "vehicleNo": "MH12CD5678",
  "dispatchTimestamp": "2026-07-30T11:00:00.000Z",
  "receiveTimestamp": "2026-07-30T12:00:00.000Z",
  "ledgerTxId": "TX-…"
}
```

---

## UC-08 — FPS authentication (OTP / biometric / supervisor exception)

| | |
|--|--|
| **Trigger** | `POST /auth/mock-otp`, `/auth/simulated-biometric`, `/auth/supervisor-exception` |
| **eventType** | `AuthTransaction` |
| **entityType** | `auth` |
| **entityId** | `authTxnId` |

```json
{
  "authTxnId": "AUTH-20260730-001",
  "fpsId": "FPS-101",
  "operatorRef": "op-ref-hash-or-id",
  "beneficiaryRefHash": "beneficiary-hash",
  "rationCardHash": "demo-ration-card-hash",
  "authMode": "MOCK_OTP",
  "authResult": "SUCCESS",
  "authTxnRefHash": "a1b2c3d4e5f60718",
  "timestamp": "2026-07-30T12:05:00.000Z",
  "ledgerTxId": "TX-…"
}
```

Supervisor exception adds `approvedBy` (e.g. `"SUPERVISOR-101"`) and typically `authMode: "SUPERVISOR_EXCEPTION"`, `authResult: "EXCEPTION_APPROVED"`.

Never includes OTP values, Aadhaar numbers, biometrics, or mobile numbers.

---

## UC-09 — Create / update monthly entitlement

| | |
|--|--|
| **Trigger** | `POST /entitlements` |
| **eventType** | `CreateMonthlyEntitlement` |
| **entityType** | `distribution` |
| **entityId** | `rationCardHash` |

```json
{
  "rationCardHash": "demo-ration-card-hash",
  "commodity": "Rice",
  "month": "2026-07",
  "monthlyEntitlementKg": 25,
  "alreadyLiftedKg": 0,
  "availableBalanceKg": 25,
  "active": true,
  "category": "PHH",
  "ledgerTxId": "TX-…"
}
```

`POST /entitlements/validate` does **not** enqueue a proof.

---

## UC-10 — Record distribution (FPS issue)

| | |
|--|--|
| **Trigger** | `POST /distributions` |
| **eventType** | `RecordDistribution` |
| **entityType** | `distribution` |
| **entityId** | `distributionId` |

```json
{
  "distributionId": "DIST-20260730-001",
  "fpsId": "FPS-101",
  "rationCardHash": "demo-ration-card-hash",
  "beneficiaryRefHash": "beneficiary-hash",
  "commodity": "Rice",
  "deliveredKg": 5,
  "authMode": "MOCK_OTP",
  "authResult": "SUCCESS",
  "authTxnRefHash": "a1b2c3d4e5f60718",
  "dealerId": "DLR-101",
  "timestamp": "2026-07-30T12:10:00.000Z",
  "ledgerTxId": "TX-…"
}
```

Duplicate / over-entitlement blocks may still enqueue `RaiseAuditFlag` without a successful distribution proof.

---

## UC-11 — Admin transactional reset

| | |
|--|--|
| **Trigger** | `POST /admin/reset` |
| **eventType** | `ResetTransactionalData` |
| **entityType** | `workflow` |
| **entityId** | `ledger` |

```json
{
  "resetAt": "2026-07-30T06:24:42.000Z",
  "seriesId": "R20260730-062442-e023",
  "lots": [
    { "commodity": "Rice", "quantityKg": 10000 },
    { "commodity": "Wheat", "quantityKg": 8000 }
  ],
  "commodity": "Rice"
}
```

Followed by separate `CreateCommodityLot` proofs per reseeded lot (UC-02).

---

## UC-12 — Raise / resolve audit flag

| | |
|--|--|
| **Trigger** | Domain side-effect (shortage, unauthorized txn, duplicate claim, reconcile, …); `POST /audit-alerts/reconcile`; `POST /audit-alerts/:alertId/resolve` |
| **eventType** | `RaiseAuditFlag` / `ResolveAuditFlag` |
| **entityType** | `audit` |
| **entityId** | `alertId` |

```json
{
  "alertId": "ALERT-…",
  "alertType": "UNAUTHORIZED_TRANSACTION",
  "entityId": "DIST-20260730-001",
  "riskLevel": "HIGH",
  "message": "Supervisor-exception distribution recorded",
  "status": "OPEN",
  "evidence": {
    "rationCardHash": "demo-ration-card-hash",
    "authMode": "SUPERVISOR_EXCEPTION"
  },
  "createdAt": "2026-07-30T12:05:30.000Z"
}
```

Resolve adds `status: "RESOLVED"`, `resolvedAt`, `resolvedBy`. Evidence must already be privacy-safe (hashes / codes only).

---

## UC-13 — Eligibility adjudication checkpoints

| | |
|--|--|
| **Trigger** | `POST /eligibility/cases/:caseId/{notice,verification,recommendation,appeals,decision,reinstate}` |
| **entityType** | `eligibility-case` |
| **entityId** | `caseId` |
| **eventId** | `ELIG-PROOF-<hash…>` (`proofEventId`) |

| Action | Fabric `eventType` |
|--------|--------------------|
| NOTICE | `EligibilityNoticeIssued` |
| VERIFICATION | `EligibilityVerificationRecorded` |
| RECOMMENDATION | `EligibilityRecommendationRecorded` |
| APPEAL | `EligibilityAppealOpened` |
| DECISION | `EligibilityDecisionAuthorized` |
| REINSTATEMENT | `EligibilityDecisionReversed` |

**Shared `proofPayload`:**

```json
{
  "caseId": "ELIG-CASE-003-77EF2C",
  "subjectRefHash": "subject-ref-…",
  "rationCardHash": "ration-card-…",
  "policyId": "ELIG-POLICY-DEMO-1",
  "ruleIds": ["RULE-INCOME", "RULE-DUPLICATE"],
  "outcomeCode": "NOTICE_ISSUED",
  "reasonCode": "ECONOMIC_REVIEW",
  "actionType": "NOTICE",
  "effectiveTimestamp": "2026-07-30T06:12:40.000Z",
  "priorState": "SCREENED",
  "newState": "NOTICE_ISSUED",
  "externalEvidenceDigest": "sha256-…"
}
```

For DECISION / REINSTATEMENT, `outcomeCode` is the case `decision` (e.g. `CANCELLED`, `REINSTATED`).

**Not proven:** `POST /eligibility/screenings` (`proofStatus: NOT_REQUIRED`).

Verification / removal paths may also enqueue beneficiary-registry proofs (UC-14).

---

## UC-14 — Beneficiary registry lifecycle

| | |
|--|--|
| **Trigger** | `POST /beneficiary-registry/v1/events` (also eligibility removal / portal surrender) |
| **entityType** | `beneficiary-registry` |
| **entityId** | `beneficiaryRefHash` |
| **eventId** | `BEN-LIFECYCLE-<sha256(eventId)[0:32]>` |

| Registry `eventType` (also Fabric `eventType`) |
|------------------------------------------------|
| `BENEFICIARY_CREATED`, `MEMBER_ADDED`, `MEMBER_REMOVED`, `HOUSEHOLD_BIFURCATED`, `MIGRATION_RECORDED`, `CARD_TRANSFERRED`, `VERIFICATION_COMPLETED`, `STATUS_CHANGED`, `RECORD_DEACTIVATED` |

```json
{
  "lifecycleEventIdHash": "<sha256 of inbound event.eventId>",
  "beneficiaryRefHash": "beneficiary-live-…-hash",
  "rationCardHash": "ration-card-live-…-hash",
  "eventType": "MIGRATION_RECORDED",
  "sourceSystem": "RCMS_SIM",
  "reasonCode": "INTER_DISTRICT_MOVE",
  "policyId": "REG-POLICY-1",
  "evidenceDigest": "sha256-…",
  "effectiveAt": "2026-07-30T06:12:33.000Z",
  "priorState": "ACTIVE",
  "newState": "ACTIVE",
  "priorVersion": 1,
  "newVersion": 2
}
```

Cleartext lifecycle `eventId` is **not** put in the proof; only its hash.

---

## UC-15 — External source integration ingest

| | |
|--|--|
| **Trigger** | `POST /integrations/smartpds/v1/master-references`, `/integrations/scm/v1/allocation-events`, `/integrations/scm/v1/movement-events`, `/integrations/epos/v1/distribution-events` |
| **entityType** | `workflow` |
| **entityId** | operation-scoped id |
| **eventId / operationId** | `integration-<hash(sourceSystem:sourceEventId)[0:32]>` |

| Route family | Fabric `eventType` |
|--------------|--------------------|
| SmartPDS master | `MASTER_REFERENCE` |
| SCM allocation | `ALLOCATION` |
| SCM movement | `MOVEMENT` |
| ePoS distribution | `DISTRIBUTION` |

```json
{
  "sourceSystem": "STATE_SCM",
  "sourceEventIdHash": "<sha256 of sourceEventId>",
  "approvedPayloadHash": "<sha256 of approved normalized payload>",
  "operationId": "integration-…",
  "status": "ACCEPTED"
}
```

Full source envelopes stay in PostgreSQL; Fabric gets hashes + status only.

---

## UC-16 — Integration reconciliation

| | |
|--|--|
| **Trigger** | `POST /integrations/reconcile` |
| **eventType** | `IntegrationReconciliation` |
| **entityType** | `workflow` |

```json
{
  "checkedEvents": 42,
  "reconciledEvents": 40,
  "exceptionCount": 2,
  "exceptionDigest": "sha256-…"
}
```

---

## Use cases that do **not** send Fabric write payloads

| Use case | Why |
|----------|-----|
| Eligibility screening | Explicitly `NOT_REQUIRED` |
| Entitlement validate / entitlement gate | Read-only checks |
| Trace, stock, dashboard, proof GETs | Reads (may **evaluate** chaincode queries, not `RecordLedgerProof`) |
| Health / metrics / OpenAPI | Ops |
| Beneficiary portal login / OTP / profile | Session simulation; surrender → UC-14 |
| Duplicate identical integration / registry replay | No new outbox row |
| Ration-card / grievance / entitlement-rule / rollover chaincode APIs | Exist on chaincode; **no Nest routes** today |

---

## End-to-end journey map (typical demo)

```text
UC-01 RegisterStakeholder
UC-02 CreateCommodityLot
UC-04 DispatchLot → UC-05 ReceiveLot   (repeat FCI→State→Block)
UC-03 AuthorizeMovement                 (Stage-II when required)
UC-06 AllocateToFPS → UC-07 RecordFPSReceipt
UC-09 CreateMonthlyEntitlement
UC-08 AuthTransaction
UC-10 RecordDistribution
  └─ optional UC-12 RaiseAuditFlag

Parallel / other modules:
UC-14 Beneficiary registry lifecycle
UC-13 Eligibility notice → … → decision
UC-15 / UC-16 Integrations
UC-11 Admin reset (demo only)
```

---

## Source of truth for types

- `LedgerProof` / `LedgerEvent` — `packages/shared-types/src/index.ts`
- Domain records (`CommodityLot`, `TransferOrder`, …) — same package
- Privacy + envelope build — `apps/api/src/modules/fabric/ledger-proof.ts`
- File/line inventory — [../implementation/fabric-proof-submission-inventory.md](../implementation/fabric-proof-submission-inventory.md)
