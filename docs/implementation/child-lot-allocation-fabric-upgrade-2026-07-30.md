# Child-lot allocation review and Fabric 1.1 deployment

**Date:** 2026-07-30
**Scope:** commit `55532ae`, child-lot dispatch/lineage behavior, related web
stock presentation, Fabric compatibility transactions, and local two-peer
deployment.

## Outcome

The partial-dispatch design is sound after the corrections in this review:
the sender retains a reduced parent lot, the dispatched quantity moves on a
child lot with explicit `rootLotId` and `parentLotId`, and pooled stock is
debited only once. The reviewed source plus corrections was deployed locally
as `pds-chaincode` version `1.1`, sequence `2`.

PostgreSQL remains authoritative for operational workflow state. The API
continues to submit immutable proofs through `RecordLedgerProof`; named
chaincode business transactions remain compatibility functions.

## Findings and corrections

### High: Fabric compatibility dispatch could not validate the transporter

`DispatchLot` and `AllocateToFPS` loaded the source/destination stakeholders
but not `transporterId`. Both then called engine validation that requires the
active transporter record. The named transactions could therefore fail with
`Stakeholder TRANS-001 not found`.

**Correction:** load `transporterId` as part of each transaction's selective
world-state input. A contract regression now drives a partial first leg,
receipt, and second-leg dispatch.

### High: later route legs could not resolve a child slice on Fabric

The engine can resolve the slice owned by the next custodian when callers keep
using the root lot ID. `PdsDataContract.DispatchLot`, however, previously
loaded only that root lot, so the engine could not see its received child.

**Correction:** when the requested lot is not owned by `fromOrg`, load the
related lineage range and pass only matching commodity/root records into the
engine. Candidate selection now excludes in-transit or undersized slices and
sorts by `lotId` for deterministic selection.

### Medium: web stock could double-count an in-transit child

The reviewed change used `originalQuantityKg` for every non-transformed lot.
A split child is also non-transformed, so the root's original quantity and the
child's quantity could both enter the baseline before transfer outflow was
subtracted.

**Correction:** only lots without `parentLotId` contribute to the original-lot
baseline. A web regression verifies that a 100 kg root split into 60 kg in
transit and 40 kg retained reports 40 kg at the sender.

### Medium: event replay skipped legitimate transformed-lot stock

The new replay guard skipped stock credit for both split children and
transformed roots. A transformed root created through a legitimate
`CreateCommodityLot` event must open its own stock position.

**Correction:** suppress replay stock credit only when `parentLotId` is
present. A regression credits an 80 kg transformed root and does not
double-credit its 30 kg split child.

### Medium: a child-ID collision could mutate pooled stock before failure

The child collision check originally ran after `consumeStock`. Fabric would
roll back a failed transaction, but the shared in-memory/API engine could
retain the debit before persistence failed.

**Correction:** derive and validate the child lot ID before consuming stock.

### Low: an API architecture test polluted a tracked journal

`cycle.spec.ts` passed relative journal paths to the ledger port and appended
to `apps/api/journal.ndjson` on every suite run.

**Correction:** use a temporary directory and remove it in `finally`. Existing
user/runtime changes in tracked journal and temporary state files were not
discarded.

### High: retained FCI stock was absent from the operator workbench

The workbench rendered only pending workflow-action cards. After FCI completed
a partial Stage-I dispatch, that action card disappeared and the retained
parent balance had no persistent presentation. The balance existed in
`stock_positions` and the general Lots table, but the FCI operator could see
only the downstream workflow state on the workbench.

**Correction:** every role workbench now renders an always-visible,
role-scoped stock section from authoritative stock positions:

- FCI sees only `FCI-001` retained stock;
- Godown sees state- and block-godown holdings as separate positions;
- DSO sees those godown positions read-only for Stage-II oversight;
- BSO sees only block-godown stock available for FPS allotment;
- FPS sees only the authenticated shop's stock;
- Management and Auditor see read-only network-wide stock positions.

Each position identifies the commodity, quantity, and owning organization. UI
regressions cover all seven roles, verify FPS-101/FPS-202 isolation, and confirm
that a 7,000 kg Wheat position after a 1,000 kg dispatch shows 6,000 kg at FCI
without including the downstream 1,000 kg.

### High: one DSO approval card appeared to release every commodity

Every Stage-II approval card used `RO-DSO-POC-001` as both its RO reference
and React action identity. Clicking one commodity sent an API request for only
that transfer, but the shared UI identity caused every commodity card to render
as completed and disabled. This falsely represented a cross-commodity release.

A read-only live PostgreSQL check confirmed that authorization evidence
remained transfer-scoped: the latest click created only
`AuthorizeMovement` for the Wheat Stage-II transfer. The transfer table did not
contain newly approved Stage-II orders for the other pending commodities.

**Correction:** authorization card IDs now derive from the transfer ID, and
new RO references are unique per Stage-II leg and commodity. The original Rice
POC reference remains compatible with the canonical fixture. Dispatch also
reuses the RO reference stored in any existing authorization event so approvals
created before this correction remain traceable. Regressions verify that all
commodity approval IDs and RO references are unique and that clicking Rice
leaves Wheat runnable.

## Verification

Local verification after the corrections:

- chaincode: 4 files, 81 tests passed;
- API: 65 files, 331 tests passed;
- web workflow/action panel: 2 files, 35 tests passed;
- chaincode, API, and web typechecks passed;
- chaincode, API, and web lint passed;
- chaincode and web production builds passed;
- `git diff --check` passed.

The web build retained its existing large-chunk warning; it did not fail.

## Fabric deployment evidence

Before upgrade, both peers reported version `1.0`, sequence `1`. The upgrade:

- packaged version `1.1`;
- installed identical package ID
  `pds-chaincode_1.1:a3f15750cc0383bad9c3408ad12078534ddca85faeee78f5160c67e49f55e334`
  on both peers;
- approved sequence `2` from both organizations;
- retained
  `AND('FoodAndCivilSuppliesMSP.peer','GodownWarehouseMSP.peer')`;
- committed the definition successfully to `pdschannel`;
- independently verified version, sequence, approvals, and identical policy
  bytes from both peers.

The first install attempt stopped before approval/commit because the peer-side
`hyperledger/fabric-nodeenv:2.5` builder image was not present. The existing
version-1.0 runtimes remained healthy and the committed definition remained at
sequence 1. After the pinned builder image became available, the same
version-1.1/sequence-2 deployment completed.

The direct two-peer proof regression and idempotent replay are recorded in
[Live Fabric Demo Evidence](fabric-demo-evidence.md).

## Application deployment

The API and web images were rebuilt from the reviewed workspace and only those
two Compose services were recreated with `--no-deps`. PostgreSQL, Keycloak,
peers, orderer, CouchDB, and Fabric ledger state were not recreated.

After replacement:

- API container health: healthy;
- `GET /health`: `{"ok":true}`;
- web container health: healthy;
- web root: HTTP 200;
- API/web startup logs contained no fatal errors.

The subsequent DSO card-identity correction required only a web rebuild and
replacement. The API and Fabric services were not rebuilt or recreated. The
healthy web container serves the corrected `index-BpF7hV6s.js` bundle.

The API log retains an existing PostgreSQL deprecation warning about calling
`client.query()` while a client is already executing a query; it did not block
startup but should be addressed separately.

The post-deployment outbox snapshot was `COMMITTED=579` and
`DEAD_LETTER=95`, with no other states returned. This is not full proof
completion.

## Remaining actions

1. Run `npm run regression:fabric` with
   `PDS_BENCHMARK_CLIENT_SECRET` or a short-lived `PDS_E2E_ACCESS_TOKEN`.
2. Review and explicitly retry or resolve the 95 historical dead-letter
   proofs; confirm new API operations reach `COMMITTED` with Fabric transaction
   IDs.
3. Commit the reviewed source and documentation so the deployed package is
   reproducible from repository history.
4. Do not infer crash atomicity, multi-replica concurrency safety, or
   production readiness from this controlled-demo deployment.
