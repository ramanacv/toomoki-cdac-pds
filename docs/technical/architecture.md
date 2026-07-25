# Technical Architecture: ViksitPDS

## Architecture Summary

ViksitPDS is a complementary trust, reconciliation, and immutable-proof layer
for the Public Distribution System. It does not replace SMART-PDS/RCMS,
IAeSCM/state supply-chain systems, AePDS/ePoS, or approved authentication
infrastructure.

PostgreSQL is authoritative for ViksitPDS operational workflow state. Hyperledger
Fabric receives non-sensitive immutable proofs asynchronously. Fabric does not
execute or decide API business commands, and proof delay or failure does not
roll back an accepted PostgreSQL operation.

The repository implements a controlled PoC with fixture-backed state-system
adapters. Maharashtra is the first planned non-production contract target; no
fixture or provisional mapping may be presented as a live government
integration.

## System Context

```text
SMART-PDS/RCMS       IAeSCM/state SCM       AePDS/ePoS
      |                     |                    |
      +---------- authenticated source events --+
                            |
                            v
              Validation and adapter boundary
             privacy | schema | replay | mapping
                            |
                            v
                 Canonical source-event service
                            |
              +-------------+--------------+
              |                            |
              v                            v
   PostgreSQL operational state     Integration operations
   events, assignments, workflow    quarantine, reconciliation,
   reconciliation, proof outbox     health, trace, dead letters
              |
              +------ asynchronous proof outbox ------+
                                                       v
                                      Hyperledger Fabric 2.5.15
                                      non-sensitive proofs only
```

The browser's FPS authentication and distribution controls are simulations of
authoritative AePDS/ePoS events. Pilot traffic enters only through authenticated
server-to-server integration endpoints.

## Trust And Authority Boundaries

- SMART-PDS/RCMS remains authoritative for approved master and entitlement
  references.
- IAeSCM or the approved state-SCM remains authoritative for allocations and
  movements.
- AePDS/ePoS remains authoritative for shop/device authentication and
  distribution events.
- PostgreSQL is authoritative for normalized ViksitPDS operations,
  correlations, reconciliation results, workflow exceptions, authorization
  assignments, and proof-delivery state.
- Fabric is authoritative only for the immutable proof records it has committed.
  A `PENDING`, `FAILED`, or `DEAD_LETTER` proof does not invalidate the accepted
  operational command.

## Integration Architecture

Every adapter normalizes approved input to `SourceEventEnvelope<T>` and
`SourceProvenance`. The provenance records source system, source event ID,
schema version, occurrence and ingestion times, an approved-payload hash,
operation ID, and processing status. Raw upstream payloads are not exposed in
domain responses.

Implemented controlled-PoC adapters are fixture-backed simulations for:

- SMART-PDS/RCMS master references;
- state-SCM allocation and movement events;
- AePDS/ePoS distribution events.

The canonical ingestion seam provides:

- a unique `(source_system, source_event_id)` replay boundary;
- `201` for a new accepted event;
- `200` with the original result for an identical replay;
- `202` for a durably quarantined event with missing parents;
- `409` plus an audit exception for conflicting content;
- linked amendment, reversal, and parent event references;
- recursive prohibited-field rejection before persistence, logging, dead-letter
  storage, or proof construction;
- source health, counters, reconciliation lag, unresolved-parent age, replay,
  and source-to-operation-to-Fabric trace.

Maharashtra identifiers, mappings, and exception semantics belong in adapter
configuration. The normalized domain remains state-neutral so a later J&K
adapter can use the same contracts.

## Backend Business API

The NestJS API owns boundary validation, database-backed authorization,
workflow orchestration, reconciliation, operational persistence, and durable
proof intent.

Main API areas include stakeholders, lots, transfers, FPS allocations, stock,
beneficiaries, authentication simulations, entitlements, distributions, trace,
audit, dashboards, integration ingestion, source operations, proof status, and
administration.

Identity tokens establish the subject. Effective operational authority comes
from active database assignments for application role, organization/geography,
stakeholder, FPS/facility, and integration source. `platform-admin` has
administrative authority but no implied operational authority.

An `integration-service` account is restricted to configured source systems,
endpoint families, event types, and active credentials.

## FPS Authorization Boundary

The controlled PoC assigns `demo-fps` to `FPS-101`.

- Every FPS request requires an active `FAIR_PRICE_SHOP` assignment.
- The API derives effective shop and opaque operator reference from identity and
  database assignments.
- Allocation, receipt, stock, authentication, distribution, dashboard, and trace
  data are scoped to that shop.
- An individual resource belonging to another shop returns `404`.
- Legacy mutation bodies may temporarily include `fpsId` or `dealerId`; a
  mismatch returns `403`. The maintained web client omits those fields.
- Department, management, and auditor reads are deliberately wider where their
  assignment permits. Platform administration alone grants no operational read
  or mutation access.

The second shop fixture (`FPS-202`) exists to demonstrate isolation, not merely
assert it.

## PostgreSQL Operational Model

PostgreSQL stores current workflow and stock state, source events and attempts,
authorization assignments, correlations, reconciliation results, audit
exceptions, proof-outbox state, and dashboard projections.

The target command architecture writes each accepted source event, normalized
business mutation, reconciliation/domain event, and Fabric outbox record on one
PostgreSQL client inside one transaction. It uses row locks, conditional stock
and entitlement changes, idempotency constraints, and optimistic versions.

That target is not yet the repository-wide runtime. The controlled demo still
uses the in-memory engine plus serialized full-state snapshots, and snapshot
saving and outbox insertion are separate operations. Consequently it is:

- single replica only;
- reset and deterministically reseeded before a demonstration;
- not crash-atomic;
- not evidence of concurrent mutation safety;
- not pilot- or production-ready.

The mandatory replacement is tracked in
[MVP hardening plan](../implementation/mvp-hardening-plan.md).

## Fabric Proof Architecture

`RecordLedgerProof` is the API's Fabric submission boundary. Named business
transactions in chaincode are compatibility functions, not new API integration
points.

An accepted API operation creates durable proof intent. The PostgreSQL outbox
worker then submits the privacy-approved proof asynchronously and records the
actual Fabric transaction ID only after commit status succeeds.

Outbox states are:

- `PENDING`: ready or scheduled;
- `SUBMITTING`: claimed by one worker;
- `COMMITTED`: Fabric commit confirmed;
- `FAILED`: retryable, with next-attempt and safe error detail;
- `DEAD_LETTER`: retry limit exhausted and requiring authorized manual retry.

Every proof includes event ID, operation ID, actor, application role, submitting
organization, payload hash, schema version, entity identifiers, and
API-generated business timestamp. Identical proof replay succeeds; conflicting
content for an existing event ID fails.

Fabric mode uses a two-organization Hyperledger Fabric 2.5.15 network with Food
and Civil Supplies and Godown/Warehouse peers, channel `pdschannel`, chaincode
`pds-chaincode`, CouchDB world state, and a single-node Raft orderer. Changes to
endorsement or discovery must be verified through both peers.

## Privacy Boundary

Recursive boundary validation rejects raw Aadhaar, biometrics, OTPs, mobile or
phone numbers, full ration-card values, unmasked beneficiary names or addresses,
and device credentials.

Those fields may not enter responses, application logs, PostgreSQL event or
dead-letter payloads, or Fabric proofs. Approved opaque references include
`rationCardHash`, `beneficiaryRefHash`, transaction-reference hashes, and
server-derived operator references.

## Reconciliation

Reconciliation compares:

- allocation against dispatch and remaining stock;
- movement against receipt or an explicit quantity adjustment;
- FPS opening stock plus receipts minus distributions and adjustments against
  closing stock.

Alerts report an exception; they never change quantity. Late, offline,
out-of-order, amended, and reversed events retain distinct occurrence,
device-sync, ingestion, and processing times and linked source-event history.

## User Experience

The React application provides separate Department, Supply-chain Operations,
Fair Price Shop Demo, Audit/Management, and Platform Administration journeys.
The FPS workspace shows assigned shop, simulated device mapping, stock and
allocation position, pending receipts, recent simulated distributions,
reconciliation exceptions, provenance, operational status, proof status, and
Fabric transaction reference.

`VITE_DATA_SOURCE=api` uses the REST API. `VITE_DATA_SOURCE=mock` is an explicitly
labelled fixture workspace; there is no automatic fallback.

## Deployment Posture

The maintained deployment is Docker Compose for local controlled demonstrations:
PostgreSQL, Keycloak/OIDC, API, web application, and optional Fabric profile.
Exactly one API replica is permitted under the current persistence design.

Future pilot topology requires approved contracts, TLS and secrets management,
backup/restore and recovery exercises, observability, privacy/security review,
row-scoped atomic commands, and state/NIC acceptance. Kubernetes, government
cloud/data-centre topology, HSM-backed keys, multi-node ordering, and HA/DR are
deployment decisions for that approved pilot—not properties of this PoC.

See [Deployment guide](../../fabric-deployment.md) and
[J&K/Maharashtra implementation plan](../implementation/jkmaha-epos-smartpds-implementation-plan.md).
