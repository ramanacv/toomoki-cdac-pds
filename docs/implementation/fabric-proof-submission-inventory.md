# NestJS API → Hyperledger Fabric submission inventory

Assessment date: 2026-07-30. Scope: every path where the NestJS API enqueues or submits payloads toward Fabric, plus chaincode `RecordLedgerProof` contract shape.

## Executive summary

In **live Fabric mode** (`PDS_LEDGER_MODE=fabric` / `ledgerMode === 'fabric'`), the NestJS API does **not** call named business chaincode transactions for writes. Every durable write to Fabric goes through:

1. A `LedgerEvent` inserted into PostgreSQL `ledger_outbox.event_payload`
2. `FabricGatewayLedgerPort` outbox worker
3. `FabricGatewayClient.submitLedgerEventAsync` → `ledgerProofFromEvent` → **`RecordLedgerProof`** on `PdsDataContract`

Named chaincode functions (`RegisterStakeholder`, `DispatchLot`, etc.) remain deployed for **compatibility / local demo invoker / evaluate queries**, and for the **legacy** `fabric-envelope` / local chaincode ledger modes. They are **not** the live Fabric write path.

---

## 1. Submission pipeline (live Fabric + Postgres)

```
API mutation
  → domain engine recordEvent() OR module-specific proofEvent()
  → INSERT ledger_events + ledger_outbox (PENDING)
  → FabricGatewayLedgerPort.processOutbox (every 2s)
  → ledgerProofFromEvent(event, SYSTEM actor)
  → gateway submit RecordLedgerProof(JSON.stringify(LedgerProof))
  → outbox COMMITTED + fabric_tx_id
```

| Stage | File | Key function |
|-------|------|--------------|
| Outbox insert (core supply/FPS) | `apps/api/src/modules/core/pds-runtime.ts` | `saveStateChanges` |
| Outbox insert (eligibility) | `apps/api/src/modules/eligibility/eligibility.repository.ts` | `insertProof` |
| Outbox insert (beneficiary registry) | `apps/api/src/modules/beneficiary-registry/beneficiary-registry.repository.ts` | `applyPostgres` |
| Outbox insert (integrations) | `apps/api/src/modules/integrations/integration-events.service.ts` | `ingestPostgres`, `persistReconciliation` |
| Worker | `apps/api/src/modules/fabric/fabric-gateway.ledger-port.ts` | `processOutbox`, `appendEvents` |
| Proof envelope builder | `apps/api/src/modules/fabric/ledger-proof.ts` | `ledgerProofFromEvent` |
| Fabric submit | `apps/api/src/modules/fabric/fabric-gateway.client.ts` | `submitLedgerEventAsync` → `submitWithTxId('RecordLedgerProof', …)` |
| Chaincode | `blockchain/chaincode/pds-chaincode/src/contract.ts` | `PdsDataContract.RecordLedgerProof` |
| Port selection | `apps/api/src/modules/ledger/ledger-port-factory.ts` | `createLedgerPortFromEnv` |

### Ledger modes that still use named operations

| Mode | Port | What is sent to “Fabric” |
|------|------|--------------------------|
| `fabric` + Postgres | `FabricGatewayLedgerPort` | **Only** `RecordLedgerProof` (via outbox) |
| `fabric` without Postgres adapter | `FabricGatewayLedgerPort.appendEvents` | Direct `submitLedgerEventAsync` → `RecordLedgerProof` |
| `fabric-envelope` | `FabricEnvelopeLedgerPort` | NDJSON envelopes via `toFabricTransactionEnvelope` (named op mapping; **local file**, not live peers) |
| Demo chaincode runtime | `FabricChaincodeLedgerPort` / `PostgresChaincodeLedgerPort` | Local invoker `submitLedgerEvent` → `applyLedgerEvent` (in-process world state) |

Legacy named-op mapping lives in `apps/api/src/modules/fabric/fabric-client.ts` (`toFabricTransactionEnvelope`). Route→op metadata in `fabric-contract.ts` / `fabric-contract.json` is **documentation/compatibility**, not the live submit path.

---

## 2. Top-level Fabric proof envelope (`LedgerProof`)

Built by `ledgerProofFromEvent` from a `LedgerEvent`:

```ts
{
  eventId: string;            // = LedgerEvent.ledgerTxId
  operationId: string;        // defaults to ledgerTxId
  eventType: string;
  schemaVersion: 1;
  entityType: LedgerEvent['entityType'];
  entityId: string;
  actor: {
    subject: 'pds-api';
    applicationRole: 'SYSTEM';
    submittingOrganization: <FabricRuntimeConfig.mspId>
  };
  payloadHash: string;        // sha256(canonicalJson(proofPayload))
  proofPayload: Record<string, unknown>;  // usually = event.payload
  businessTimestamp: string;  // = event.timestamp
}
```

Types: `packages/shared-types/src/index.ts` (`LedgerProof`, `LedgerEvent`).

### Outbox row shape (before Fabric transform)

`ledger_outbox.event_payload` stores the **raw `LedgerEvent`**, not the `LedgerProof`:

```ts
{
  ledgerTxId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  payload: Record<string, unknown>;  // becomes proofPayload
  timestamp: string;
}
```

---

## 3. Chaincode `RecordLedgerProof` signature

**Contract:** `PdsDataContract`  
**Method:** `RecordLedgerProof(ctx: Context, payloadJson: string): Promise<string>`  
**File:** `blockchain/chaincode/pds-chaincode/src/contract.ts`  
**Auth:** `FoodAndCivilSuppliesMSP` or `AuditAuthorityMSP` (`authorization.ts`)

Behavior:

1. Parse `payloadJson` as `LedgerProof`
2. Require `eventId`, `operationId`, `entityId`, `eventType`, `schemaVersion === 1`
3. Require `payloadHash` = 64 hex chars; require `actor.subject`, `actor.applicationRole`, `actor.submittingOrganization`
4. `assertNoSensitiveProofFields(proof.proofPayload)`
5. Recompute hash; must equal `payloadHash`
6. Identical replay → success with `{ duplicate: true }`
7. Conflicting content for same `eventId` → throw
8. Store under composite key `proof` / `eventId` — **does not re-execute business commands or project operational state**

Local invoker path (`invoker.ts` case `RecordLedgerProof`) instead calls `engine.applyLedgerEvent` (demo dual-write projection). Live Fabric peers store the proof document only.

### Allowlisted `eventType` values (replay / local apply)

From `ALLOWED_LEDGER_EVENT_TYPES` in `blockchain/chaincode/pds-chaincode/src/index.ts`:

Supply/FPS: `RegisterStakeholder`, `CreateCommodityLot`, `AuthorizeMovement`, `DispatchLot`, `ReceiveLot`, `AllocateToFPS`, `RecordFPSReceipt`, `AuthTransaction`, `CreateMonthlyEntitlement`, `RecordDistribution`, `RaiseAuditFlag`, `ResolveAuditFlag`, `ResetTransactionalData`

Ration/grievance/rules (engine-only; no Nest route today): `IssueRationCard`, `ActivateRationCard`, `SuspendRationCard`, `TransferRationCard`, `FileGrievance`, `AcknowledgeGrievance`, `ResolveGrievance`, `EscalateOverdueGrievances`, `ProposeEntitlementRule`, `ApproveEntitlementRule`, `RolloverUnclaimedQuota`

Eligibility: `EligibilityNoticeIssued`, `EligibilityVerificationRecorded`, `EligibilityRecommendationRecorded`, `EligibilityAppealOpened`, `EligibilityDecisionAuthorized`, `EligibilityDecisionReversed`

Beneficiary registry: `BENEFICIARY_CREATED`, `MEMBER_ADDED`, `MEMBER_REMOVED`, `HOUSEHOLD_BIFURCATED`, `MIGRATION_RECORDED`, `CARD_TRANSFERRED`, `VERIFICATION_COMPLETED`, `STATUS_CHANGED`, `RECORD_DEACTIVATED`

Integrations: `MASTER_REFERENCE`, `ALLOCATION`, `MOVEMENT`, `DISTRIBUTION`, `IntegrationReconciliation`

---

## 4. Privacy / hashing rules

### API boundary (`apps/api/src/modules/fabric/ledger-proof.ts`)

- `assertPrivacySafe` runs on every `proofPayload` before submit.
- Prohibited **keys** (normalized, alphanumeric): contains `aadhaar`, `mobile`, `phone`, `otp`, `biometric`, `address`, `credential` unless key ends in `hash` / `refhash` / `digest`; exact `name` or ends with `beneficiaryname` / `dealername`; contains `rationcard` unless opaque hash suffix.
- Prohibited **string values**: raw 10–16 digit numeric identifiers.
- **Exception:** `RegisterStakeholder` / `entityType === 'stakeholder'` uses `privacySafeCopy` (strip prohibited keys) instead of failing — so display `name` / `dealerName` are dropped from Fabric proofs while PostgreSQL may retain them.

### Chaincode (`contract.ts` `assertNoSensitiveProofFields`)

Recursive key check: `aadhaar|mobile|phone|otp|biometric` and `rationcard` stems unless opaque `hash|refhash|digest` suffix.

### Domain hashing conventions

- Auth / distribution use `rationCardHash`, `beneficiaryRefHash`, `authTxnRefHash` (never raw Aadhaar/OTP/mobile).
- Eligibility proofs use `subjectRefHash`, `rationCardHash`, `externalEvidenceDigest`.
- Beneficiary registry proofs use `lifecycleEventIdHash` (sha256 of event id), never cleartext event ids as sole identity.
- Integration proofs store `sourceEventIdHash` + `approvedPayloadHash`; full envelope is privacy-checked at ingest via `assertPrivacySafe(envelope)`.

---

## 5. Operation inventory (enqueues Fabric proof)

For each row: **outbox `eventType`** → becomes Fabric `LedgerProof.eventType`; **`proofPayload`** = event `payload` (after stakeholder redaction).

### 5.1 Supply chain / stakeholders / lots / transfers / allocations

| eventType | Fires when | API route / service | proofPayload (nested) | Source |
|-----------|------------|---------------------|------------------------|--------|
| `RegisterStakeholder` | New stakeholder | `POST /stakeholders` → `registerStakeholderPersisted` | Stakeholder object **minus** prohibited keys (`name`, `dealerName`, …): `{ stakeholderId, stakeholderType, district, licenseNo, status, jurisdiction?, capacityKg?, dealerId?, shopNo?, blockName?, tehsilName?, location? }` | `PdsLedgerEngine.registerStakeholder` → `pds-runtime` |
| `CreateCommodityLot` | New lot (also after admin reset reseed) | `POST /lots`; also emitted by `resetTransactionalData` | Full `CommodityLot`: `{ lotId, commodity, season, quantityKg, qualityGrade, source, currentOwner, currentLocation, status, createdAt?, transformedFromLotId?, rootLotId?, parentLotId?, … }` | `createCommodityLot` |
| `AuthorizeMovement` | Stage-II / RO authorization | `POST /transfers/:transferId/authorize` | `{ transferId, authorizedBy, authorizedAt, roRef?, remarks? }` | `authorizeMovement` |
| `DispatchLot` | Dispatch transfer | `POST /transfers` | Full `TransferOrder` incl. `transporterName`, qty, vehicle, status, stage, auth fields | `dispatchLot` |
| `ReceiveLot` | Receive transfer | `POST /transfers/:transferId/receive` | Updated `TransferOrder` (+ optional `shortageQtyKg`) | `receiveLot` |
| `AllocateToFPS` | FPS allocation | `POST /fps-allocations` | Full `FPSAllocation` (+ `ledgerTxId` after event) | `allocateToFps` |
| `RecordFPSReceipt` | FPS receipt | `POST /fps-allocations/:allocationId/receipt` | Updated `FPSAllocation` | `recordFpsReceipt` |
| `RaiseAuditFlag` | Domain raises alert (shortage, unauthorized, duplicate claim, reconcile, rejection path) | Side effect of mutations; `POST /audit-alerts/reconcile`; rejection evidence persist | Full `AuditAlert`: `{ alertId, alertType, entityId, riskLevel, message, status, evidence, createdAt, … }` | `raiseAuditFlag` |
| `ResolveAuditFlag` | Resolve alert | `POST /audit-alerts/:alertId/resolve` | Resolved `AuditAlert` | `resolveAuditAlert` |
| `ResetTransactionalData` | Admin reset | `POST /admin/reset` → `AdminService` → `resetTransactionalDataPersisted` | `{ resetAt, seriesId, lots: seedLotInputs[], commodity? }` then separate `CreateCommodityLot` events per reseeded lot | `resetTransactionalData` |

Controllers: `stakeholders.controller.ts`, `lots.controller.ts`, `transfers.controller.ts`, `allocations.controller.ts`, `audit.controller.ts`, `admin.controller.ts` / `admin.service.ts`. Engine: `blockchain/chaincode/pds-chaincode/src/index.ts`. Persistence: `pds-runtime.ts` `saveStateChanges`.

**Note:** Successful mutations that also raise shortage / exception alerts enqueue **multiple** outbox rows (primary event + `RaiseAuditFlag`). Failed mutations that raised flags before throw still persist `RaiseAuditFlag` via `persistRejectionAuditEvidence`.

### 5.2 Auth / entitlements / distributions (FPS)

| eventType | Fires when | API route / service | proofPayload | Source |
|-----------|------------|---------------------|--------------|--------|
| `AuthTransaction` | Simulated/ePoS auth | `POST /auth/mock-otp`, `/auth/simulated-biometric`, `/auth/supervisor-exception` | `{ authTxnId, fpsId?, operatorRef?, beneficiaryRefHash, rationCardHash, authMode, authResult, authTxnRefHash, approvedBy?, timestamp, ledgerTxId? }` | `simulateAuthentication` via `AuthController` |
| `CreateMonthlyEntitlement` | Create/update entitlement | `POST /entitlements` | Full `MonthlyEntitlement`: `{ rationCardHash, commodity, month, monthlyEntitlementKg, alreadyLiftedKg, availableBalanceKg, active, category? }` | `createOrUpdateEntitlement` |
| `RecordDistribution` | FPS distribution | `POST /distributions` | Full `DistributionTransaction`: `{ distributionId, fpsId, rationCardHash, beneficiaryRefHash, commodity, deliveredKg, authMode, authResult, authTxnRefHash, dealerId, timestamp, ledgerTxId? }` | `recordDistribution` |

### 5.3 Eligibility adjudication

Enqueue site: `EligibilityRepository.insertProof` when action ∈ `ELIGIBILITY_PROOF_ACTIONS`.

| eventType | Action | API route | proofPayload |
|-----------|--------|-----------|--------------|
| `EligibilityNoticeIssued` | `NOTICE` | `POST /eligibility/cases/:caseId/notice` | Shared shape below |
| `EligibilityVerificationRecorded` | `VERIFICATION` | `POST /eligibility/cases/:caseId/verification` | Shared shape |
| `EligibilityRecommendationRecorded` | `RECOMMENDATION` | `POST /eligibility/cases/:caseId/recommendation` | Shared shape |
| `EligibilityAppealOpened` | `APPEAL` | `POST /eligibility/cases/:caseId/appeals` | Shared shape |
| `EligibilityDecisionAuthorized` | `DECISION` | `POST /eligibility/cases/:caseId/decision` | Shared shape (`outcomeCode` = decision) |
| `EligibilityDecisionReversed` | `REINSTATEMENT` | `POST /eligibility/cases/:caseId/reinstate` | Shared shape |

Shared eligibility `proofPayload`:

```ts
{
  caseId, subjectRefHash, rationCardHash,
  policyId, ruleIds,
  outcomeCode, reasonCode, actionType,
  effectiveTimestamp, priorState, newState,
  externalEvidenceDigest
}
```

`entityType`: `eligibility-case`; `entityId`: `caseId`; `ledgerTxId`: `proofEventId` (`ELIG-PROOF-…`).

Verification may also bridge a beneficiary-registry `MEMBER_REMOVED` / `BENEFICIARY_CREATED` proof via `bridgeDeceasedMemberRemoval`.

### 5.4 Beneficiary registry lifecycle

Enqueue: `BeneficiaryRegistryRepository.applyPostgres` on **new** (non-replay) `POST /beneficiary-registry/v1/events`.

| eventType | proofPayload |
|-----------|--------------|
| `BENEFICIARY_CREATED` | Shared registry shape |
| `MEMBER_ADDED` | Shared |
| `MEMBER_REMOVED` | Shared |
| `HOUSEHOLD_BIFURCATED` | Shared |
| `MIGRATION_RECORDED` | Shared |
| `CARD_TRANSFERRED` | Shared |
| `VERIFICATION_COMPLETED` | Shared |
| `STATUS_CHANGED` | Shared |
| `RECORD_DEACTIVATED` | Shared |

Shared registry `proofPayload`:

```ts
{
  lifecycleEventIdHash,   // sha256(event.eventId)
  beneficiaryRefHash, rationCardHash,
  eventType, sourceSystem, reasonCode, policyId, evidenceDigest,
  effectiveAt, priorState, newState, priorVersion, newVersion
}
```

`entityType`: `beneficiary-registry`; `entityId`: `beneficiaryRefHash`; `ledgerTxId`: `BEN-LIFECYCLE-{sha256(eventId)[0:32]}`.

Also triggered indirectly by eligibility removal / citizen portal surrender (`EligibilityService.removeBeneficiaries` → registry `RECORD_DEACTIVATED`).

### 5.5 External integrations

| eventType | Fires when | API route | proofPayload |
|-----------|------------|-----------|--------------|
| `MASTER_REFERENCE` | SmartPDS master ingest | `POST /integrations/smartpds/v1/master-references` | `{ sourceSystem, sourceEventIdHash, approvedPayloadHash, operationId, status }` |
| `ALLOCATION` | SCM allocation ingest | `POST /integrations/scm/v1/allocation-events` | Same |
| `MOVEMENT` | SCM movement ingest | `POST /integrations/scm/v1/movement-events` | Same |
| `DISTRIBUTION` | ePoS distribution ingest | `POST /integrations/epos/v1/distribution-events` | Same |
| `IntegrationReconciliation` | Reconcile run | `POST /integrations/reconcile` | `{ checkedEvents, reconciledEvents, exceptionCount, exceptionDigest }` |

`entityType`: `workflow`. Ingest `operationId` = `integration-{hash(sourceSystem:sourceEventId)[0:32]}`.

---

## 6. Operations that intentionally do **not** send Fabric proofs

| Operation | Route / method | Reason |
|-----------|----------------|--------|
| Eligibility `SCREENING` | `POST /eligibility/screenings` | `proofStatus: NOT_REQUIRED`; only case/screening rows |
| Entitlement validate | `POST /entitlements/validate` | Read/check only; no `recordEvent` |
| Entitlement gate | `POST /eligibility/entitlement-gate` | Read gate decision |
| Proof / analytics reads | `GET /ledger-proofs/*`, admin proof summary | Query outbox / events |
| Trace / history / stock / dashboard | `GET /trace/*`, `/lots/:id/history`, `/stock`, `/dashboard/summary` | Evaluate-style / Postgres reads; may call Fabric **evaluate** queries (`GetLotHistory`, etc.) when chain query port present — **not** write proofs |
| Health / metrics / OpenAPI | various | Ops only |
| Beneficiary portal login / profile / lists | `/beneficiary-portal/*` (except surrender) | Auth session; reads proof status only |
| Beneficiary portal OTP | login OTP | Simulation; no ledger event |
| Integration list/health/trace GETs | `/integrations/events`, `/health`, trace | Reads |
| Duplicate / conflicted integration ingest | same POST routes | No new outbox row |
| File/memory-only eligibility or registry (no Postgres pool) | same modules | Repository persist no-ops → **no outbox** |
| Chaincode-only domain APIs with **no Nest controller** | Ration card lifecycle, grievances, entitlement rules, quota rollover | Exist on chaincode/engine only; API never calls them today |

---

## 7. Named chaincode transactions vs API

| Named Fabric op | Still on chaincode? | Called by live Nest Fabric write path? | Notes |
|-----------------|---------------------|----------------------------------------|-------|
| `RecordLedgerProof` | Yes | **Yes — sole write** | Proof storage |
| `RegisterStakeholder`, `CreateCommodityLot`, `DispatchLot`, `ReceiveLot`, `AllocateToFPS`, `RecordFPSReceipt`, `RegisterBeneficiaryHash`, `CreateMonthlyEntitlement`, `RecordDistribution`, `RaiseAuditFlag`, `ResolveAuditFlag` | Yes | **No** (live fabric) | Compatibility; local envelope/invoker map still references them |
| `IssueRationCard`, grievances, entitlement rules, rollover | Yes | **No** | No Nest routes |
| `GetLotHistory`, `GetDistributionHistory`, `GetCurrentStock`, `VerifyDatabaseHash`, … | Yes | Evaluate only (when chain query wired) | Reads |

`FabricGatewayClient.submitLedgerEvent` (sync) still maps via `toFabricTransactionEnvelope` to named ops, but the outbox worker uses **`submitLedgerEventAsync` → always `RecordLedgerProof`**.

---

## 8. Quick reference: enqueue call sites

```
pds-runtime.saveStateChanges          → core ledger mutations
eligibility.repository.insertProof    → eligibility checkpoints + final decisions
beneficiary-registry.repository       → lifecycle events
integration-events.service            → source ingest + reconciliation
FabricGatewayLedgerPort.appendEvents  → dual path when appendEvents used (file fabric / no prior saveStateChanges)
```

Related maintained docs: `docs/implementation/beneficiary-eligibility-proof-outbox-coverage.md`, `AGENTS.md` (architectural rules 2–7).
