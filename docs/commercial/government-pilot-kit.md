# Government Pilot Engagement Kit

## Two-page concept note

### Problem and proposition

Public Distribution System operations cross procurement, FCI/state lifting, godowns/issue points, FPS delivery, entitlement and audit systems. Evidence can be fragmented across organizational and system boundaries, slowing reconciliation and exception investigation. ViksitPDS adds an interoperable trust layer: PostgreSQL remains authoritative for operations while a permissioned Hyperledger Fabric network records non-sensitive, immutable proofs asynchronously.

The proposition is deliberately complementary. Existing SMART-PDS, state PDS, ePoS, procurement, logistics and approved authentication systems continue to own their functions. ViksitPDS supplies shared custody proof, visible proof-delivery status, exception reconciliation and audit trace without placing Aadhaar numbers, biometrics, OTP values, mobile numbers or full ration-card values on chain.

### Reference pilot and outcomes

The proposed paid reference pilot covers one district, one commodity, two upstream custody sites, ten FPS sites, department and audit users, and mock/CSV/non-sensitive API integration until formal data approval. An eight-to-twelve-week monitored run follows discovery, deployment, IAM setup, operating-procedure agreement and training.

Outcomes are measured through proof completeness, custody-mismatch detection/investigation time, reconciliation turnaround, manual touches per exception, duplicate/excess attempt detection, user task time, and infrastructure/support cost per site. Pilot evidence includes workload definitions, success rates, latency percentiles, outbox state and limitations—not unsupported scale claims.

### Governance and decision

The department names a pilot owner, data/security contacts and operational representatives. The supplier provides implementation, monitoring, support and evidence reporting. A joint steering group manages scope, risks and change requests. Conversion requires agreed KPI achievement, security review, integration feasibility, operational ownership and an approved funding route.

ViksitPDS is currently a controlled near-MVP demonstration. It has no government endorsement. Production/pilot-readiness claims depend on concurrency, security, privacy, HA/recovery and formal acceptance gates.

## Workflow interview guide

1. Walk through one commodity movement from allocation to FPS receipt; identify every system, handoff, document and approval.
2. Where do quantity, custody, timing or identity records disagree, and who detects the mismatch?
3. What evidence is needed to investigate and close an exception? How long does that take?
4. Which steps are re-keyed, exported to spreadsheets or confirmed by phone/message?
5. Which roles may create, authorize, receive, reconcile and resolve each record? What organizational boundaries apply?
6. What data cannot leave the current system or data centre? What retention and audit requirements apply?
7. What are peak and typical volumes, offline periods, device/network constraints and recovery procedures?
8. Which non-sensitive sandbox/CSV/API interfaces can support a pilot?
9. What would constitute pilot value, unacceptable disruption and a state-rollout decision?
10. May feedback be attributed, and is it informal discovery, formal review or pilot intent?

## Data-requirement sheet

| Dataset/interface | Minimum pilot fields | Exclusions/approval |
|---|---|---|
| Stakeholder directory | Opaque ID, type, district, status, organization mapping | No operator personal identity unless approved and necessary. |
| Lot/custody | Opaque lot ID, commodity, integer kg, source/destination, stage, timestamps, status | No beneficiary data. |
| Allocation/receipt | Opaque allocation/FPS/site IDs, commodity, month, quantity, status | Site mapping approved by department. |
| Entitlement/distribution sandbox | Approved hashes/opaque references, commodity, month, quantity, result | No Aadhaar, biometric, OTP, mobile, name/address or full ration-card value. |
| Exceptions/audit | Opaque entity reference, category, severity, status, timestamps, resolution | Free text must be constrained/redacted. |
| IAM | Subject, application roles, optional organization/stakeholder/MSP claims | Government IAM federation only after security approval. |

For every dataset record owner, source system, legal/policy basis, classification, volume, update frequency, quality rules, retention, permitted environments, encryption, access roles and deletion/export requirements.

## Draft pilot charter

- Objective: test whether non-sensitive shared custody proofs reduce reconciliation and investigation effort without disrupting authoritative systems.
- Scope: reference district configuration above; additions require signed change control.
- Duration: discovery/setup plus eight-to-twelve-week monitored operation.
- Responsibilities: department owns policy/data approvals and operational participation; supplier owns configured platform, training, monitoring, support and evidence report; integrator/NIC roles are agreed separately.
- Security/privacy: approved sandbox data only; Keycloak roles; named access; no real Aadhaar authentication; incident escalation; retention/deletion agreed before ingestion.
- Acceptance: agreed functional cases, proof completeness, KPI method, security review, recovery exercise and unresolved-risk register.
- Commercial: one-time pilot fee; separately approved changes; annual platform/operations/support proposal only after conversion decision.
- Exit: export approved records/evidence, revoke access, return/delete pilot data as agreed, and document outstanding issues.

## Discovery record

No interviews or government validation are recorded yet. Use one row per attributable interaction: date; organization type; participant role; attribution permission; pain points; requested changes; evidence; classification (informal/formal/pilot-related); follow-up owner/date. Do not backfill or infer endorsement.

The competition package should link the live demonstration and short video here only after stable URLs and sharing permission exist.
