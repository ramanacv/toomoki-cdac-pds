# Beneficiary registry and fraud-detection alignment

## Scope

This document maps the controlled ViksitPDS demonstration to
`docs/requirements/Blockchain-Enabled Beneficiary Registry Management and Fraud Detection for Public Distribution System (PDS).pdf`.

For gap coverage against the draft POC test-case document (TC_BR / TC_FD /
TC_INT / TC_BC / TC_SYNC / TC_PERF), see
[poc-test-case-gap-analysis.md](poc-test-case-gap-analysis.md). For the
facilitator SHOW / REMAP / DEFER runbook, see
[poc-test-case-demo-checklist.md](../demo/poc-test-case-demo-checklist.md).

The source is a problem statement, not a detailed functional specification.
ViksitPDS interprets a **blockchain-enabled beneficiary registry** as:

- an authorized operational registry projection and full workflow history in
  PostgreSQL;
- privacy-safe lifecycle and final-decision proofs delivered asynchronously to
  Hyperledger Fabric;
- no Aadhaar, biometrics, phone number, address, full ration-card value,
  beneficiary name, or raw cross-department record on-chain.

SMART-PDS/RCMS remains the beneficiary and ration-card system of record in a
real deployment. The current adapters, policies, people, districts, evidence,
and cross-registry signals are synthetic.

## Requirement traceability

| Problem need | Demonstrated behavior | Primary implementation | Status |
|---|---|---|---|
| Trusted beneficiary lifecycle | Canonical creation, member change, bifurcation, migration, card transfer, verification, status, and deactivation events | `apps/api/src/modules/beneficiary-registry/` | Controlled demo |
| Immutable and auditable changes | Every accepted authorized lifecycle mutation atomically creates a ledger event and PostgreSQL outbox proof intent | `beneficiary-registry.repository.ts` | Implemented |
| Death and eligibility changes | Death, activity, economic, land, and multi-source screening with guided adjudication | Eligibility mock/API | Implemented simulation |
| Duplicate/fake records | Privacy-safe registry-linkage signal opens a duplicate review; it never deactivates a record automatically | J&K duplicate scenario `BEN-JK-DEMO-001` | Implemented simulation |
| Migration | ONORC activity prevents false inactivity; lifecycle projection records authorized migration | J&K migration scenario and `MIGRATION_RECORDED` | Implemented simulation |
| Birth/death/family change | Member addition/removal and household bifurcation change the registry projection; verified removal changes entitlement | Lifecycle API and eligibility workflow | Implemented simulation |
| Cross-agency validation | Opaque evidence from RCMS, death registry, AePDS/ONORC, tax/turnover, employment, land, and registry linkage | Eligibility external-service contract | Fixture-backed |
| No automatic exclusion | Screening, notice, verification, and recommendation are non-blocking; only an effective authorized RCMS decision gates distribution | Eligibility service and entitlement gate | Implemented |
| Appeal and correction | Corrected evidence, appeal, reinstatement, and remaining-balance restoration | Eligibility case workflow | Implemented |
| J&K context | Fictional J&K duplicate, remote death verification, migration, and delayed household-split evidence scenarios | Eligibility fixtures | Implemented simulation |
| Planning and subsidy effects | UI/API show baseline/current members, rice requirement, allocation delta, and explicitly indicative subsidy delta | Eligibility summary/UI | Implemented simulation |

## Lifecycle API

- `POST /beneficiary-registry/v1/events` — department-only authorized
  lifecycle mutation.
- `GET /beneficiary-registry/v1/summary` — department, management, and auditor
  projection view.

Lifecycle requests contain opaque beneficiary/card hashes, reason and policy
codes, an evidence digest, effective timestamps, optional district code and
household-size delta, and schema version. Reusing an event ID with identical
content is an idempotent replay; conflicting reuse fails.

## Mock integrity and proof completeness (controlled demo)

- Eligibility adjudication checkpoints and all nine registry lifecycle types
  enqueue privacy-safe outbox proofs; Trust Overview reports completeness and
  detectable drift/missing proofs.
- Deterministic mock scoring and `linkageDigest` collisions open human review
  only; chaincode never mutates beneficiary status.
- See [mocks-integrity-proof-completeness-plan.md](mocks-integrity-proof-completeness-plan.md).

## Remaining pilot work

- Obtain approved J&K SMART-PDS/RCMS, AePDS/ePoS, death-registration, migration,
  and field-verification contracts.
- Define government-approved privacy-preserving linkage/tokenization rather
  than the deterministic mock duplicate scenario.
- Validate policy/rule codes, authorization separation, notice periods,
  appellate authority, retention, and correction procedures with the
  department.
- Replace synthetic policy assumptions and indicative subsidy figures with
  approved configuration.
- Complete the broader row-scoped PostgreSQL command-service replacement
  tracked in the MVP hardening plan before any multi-replica or production
  claim (supply-chain snapshot/outbox honesty unlock).
