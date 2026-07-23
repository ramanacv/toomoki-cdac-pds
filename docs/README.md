# ViksitPDS Documentation

This documentation describes ViksitPDS as a controlled demonstration and
near-MVP trust, reconciliation, traceability, and immutable-proof layer for the
Public Distribution System.

ViksitPDS complements SMART-PDS/RCMS, IAeSCM and state-SCM, AePDS/ePoS,
procurement, logistics, authentication, and command-centre systems. It does not
replace them and is not production-ready.

## Recommended Reading Order

### Product

1. [Business requirements](product/brd.md)
2. [Product requirements](product/prd.md)
3. [Feature specification](product/feature-spec.md)
4. [Entities, roles, and permissions](product/entities-roles-permissions.md)
5. [Controlled-demo assumptions](product/assumptions-for-demo.md)
6. [J&K/Maharashtra ePoS–SMART-PDS reference](product/jkmaha-epos-smartpds-reference.md)

### Architecture And Design

1. [Technical architecture](technical/architecture.md)
2. [Technical design](technical/design.md)
3. [Technical stack](technical/technical-stack.md)
4. [Deployment guide](../fabric-deployment.md)

### Implementation And Status

1. [Implementation document index](implementation/README.md)
2. [J&K/Maharashtra delivery plan](implementation/jkmaha-epos-smartpds-implementation-plan.md)
3. [MVP hardening plan](implementation/mvp-hardening-plan.md)
4. [Production-readiness work](implementation/production-readiness-todos.md)
5. [Mock data and integration fixtures](implementation/mock-data.md)

### Security, Pilot, And Commercial Preparation

1. [Security and compliance preparation](security/security-compliance-pack.md)
2. [Security remediation register](security/remediation-register.md)
3. [Government pilot engagement kit](commercial/government-pilot-kit.md)
4. [Commercial viability](commercial/commercial-viability.md)

The original MVP plan, sprint backlog, refactor notes, evaluations, and session
reports are retained as dated implementation history. Do not use a historical
status claim instead of the maintained architecture, deployment guide, or
hardening trackers.

## Current Product Boundary

- Browser authentication and distribution controls are explicitly simulations
  of AePDS/ePoS events.
- `demo-fps` is assigned to `FPS-101`; FPS data is identity-scoped and a second
  FPS fixture proves isolation.
- Fixture-backed SMART-PDS/RCMS, state-SCM, and AePDS/ePoS adapters exercise the
  canonical ingestion seam. They are not live or department-approved
  integrations.
- PostgreSQL is authoritative for ViksitPDS operational state.
- Fabric receives privacy-approved proofs asynchronously.
- Operational status and proof status are separate.

Maharashtra is the first planned external non-production contract target. J&K
can use the same state-neutral canonical model through separate approved
configuration and mappings later.

## Persistence Gate

The runtime still uses the in-memory engine and serialized PostgreSQL
full-state snapshots. Snapshot saving and proof-outbox insertion are separate
operations. Therefore the current deployment is single-replica,
reset-before-demo, not crash-safe, not concurrency-safe, and not pilot-ready.

Row-scoped commands must commit accepted events, business mutations,
reconciliation/domain results, and proof intent on one PostgreSQL client and one
transaction before any pilot-ready claim. See the
[MVP hardening plan](implementation/mvp-hardening-plan.md).

## Privacy Rule

Raw Aadhaar, biometrics, OTPs, mobile/phone numbers, full ration-card values,
unmasked beneficiary names or addresses, and device credentials must never
enter responses, logs, PostgreSQL source/dead-letter payloads, or Fabric proofs.
Use privacy-approved hashes and opaque references.

## Source Inputs

- [CDAC problem statement](requirements/cdac-problem-statement.md)
- [Expert solution proposal](product/solution-proposal-gpt.md)
- [Reference presentation](reference/PDS_Blockchain_GrainChain_India.pptx.pdf)

These inputs provide problem and vision context. Advanced or national-scale
claims remain roadmap items unless a maintained status document explicitly
marks them implemented and verified.
