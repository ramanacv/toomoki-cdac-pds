# Competition Readiness and Pilot Hardening Plan

## Summary

Implement a two-track programme:

- **Next 12 hours:** maximize jury confidence through a stable live Fabric demonstration, Keycloak-based RBAC, secure APIs, visible proof completion, measured performance, reconciled documentation, and a defensible district-pilot commercial package.
- **Next 3 months:** complete transactional/concurrency hardening, organization-scoped authorization, security assurance, government-system adapters, scalable Fabric deployment, and pilot readiness.

Use **Keycloak with OIDC Authorization Code + PKCE**, require authentication by default for every online API mode, and retain unauthenticated role selection only for the offline fixture UI and automated tests. Position the commercial offering as a **paid district pilot that converts into a state-wide annual platform, integration, and support contract**.

Create the maintained tracker at `docs/implementation/challenge-readiness-plan.md`, referencing the findings in `docs/product/initial-evaluation.md`.

## Implementation Changes

### 1. Immediate technical proof and demo stability: hours 0–2

- Fix the PostgreSQL/Fabric admin-console failure by making admin overview and all dependent ledger queries consistently asynchronous.
- Make `/admin/overview`, network, activity, stakeholder summary, and proof summary work in both demo and Fabric modes.
- Resolve the six chaincode lint errors and require build, typecheck, lint, unit tests, and supported HTTP tests to pass before demo packaging.
- Standardize all documentation and UI labels on the actually deployed **Hyperledger Fabric 2.5.15**.
- Verify and document the live channel, chaincode version, sequence, committed endorsement policy, both peers, orderer, CouchDB instances, and submitting MSP.
- Force `VITE_DATA_SOURCE=api` for the jury build. If the API or IAM is unavailable, show a clear failure screen instead of silently falling back to mock data.
- Preserve offline fixtures as an explicitly labelled backup demonstration mode only.
- Remove or narrow documentation claims for audit rules, external adapters, scalability, and security controls that are not implemented.

### 2. Keycloak IAM and complete RBAC: hours 2–7

#### Identity deployment

- Add a Keycloak service under an `iam` Compose profile with a version-pinned image, health check, persistent volume, and realm import.
- Define realm `viksitpds` with:
  - Public web client `pds-web`, Authorization Code flow, PKCE-S256, exact redirect URIs and web origins.
  - Bearer-only API audience `pds-api`.
  - Confidential service clients `pds-metrics` and `pds-benchmark` using client credentials.
- Keep administrator, demo-user, service-account, and client secrets outside the repository. Provision demo accounts through an environment-driven bootstrap script.
- Configure issuer, audience, JWKS URI, allowed clock skew, CORS origins, session duration, password policy, and brute-force protection explicitly.
- Retain the existing static identity provider only as a test adapter. Do not permit static tokens in deployed demo or Fabric modes.

#### Canonical roles

Replace the coarse five-role application model with:

- `management`: read-only dashboards and operational summaries.
- `department`: stakeholder administration, entitlements, movement authorization and allocations.
- `procurement`: lot creation and procurement dispatch.
- `fci`: FCI receipt and onward dispatch.
- `godown`: godown/issue-point receipt, dispatch and FPS allocation.
- `fps`: FPS receipt, simulated beneficiary authentication and distribution.
- `auditor`: trace, proof, reconciliation, alert review and resolution.
- `platform-admin`: IAM-independent application administration views.
- `metrics-reader`: Prometheus metrics only.
- `demo-reset`: destructive reset endpoint only.

Carry optional `pds_org_id`, `pds_stakeholder_id`, and `pds_msp_id` claims so pilot-grade organization scoping can be added without changing token contracts.

#### API authorization policy

- Make authentication independent of ledger mode and secure by default.
- Introduce an explicit public-route marker. Only landing/docs, OpenAPI, liveness, readiness and minimal health responses are public.
- Return:
  - `401` for missing, invalid, expired, wrong-issuer, wrong-audience or unverifiable tokens.
  - `403` for authenticated users without the required role.
- Apply explicit least-privilege policies:
  - Stakeholder creation: `department`.
  - Lot creation: `procurement`.
  - Dispatch: `procurement`, `fci`, or `godown`.
  - Transfer receipt: `fci` or `godown`.
  - Stage-II authorization: `department`.
  - FPS allocation: `department` or `godown`.
  - FPS receipt, mock authentication and distribution: `fps`.
  - Entitlement creation/update: `department`.
  - Entitlement validation: `department` or `fps`.
  - Reconciliation and alert resolution: `auditor`.
  - Admin reads: `platform-admin`.
  - Reset: `demo-reset`, additionally requiring `PDS_ALLOW_RESET=true`.
  - Metrics: `metrics-reader` or `platform-admin`.
- Restrict beneficiary-linked reads:
  - Authentication transactions: `fps`, `department`, or `auditor`.
  - Entitlements: `fps`, `department`, or `auditor`.
  - Distributions: `fps`, `department`, `auditor`, or read-only `management`.
- Keep general supply-chain and trace reads available to authenticated operational roles.
- Record subject, roles, organization claims, route, decision, status and request ID in security audit logs; never log tokens, OTP values, biometric values or unmasked beneficiary data.

#### Web authentication

- Replace manual operator-name, role selection, development-token storage and admin-token entry with Keycloak login.
- Use Authorization Code + PKCE and keep access tokens in session storage or in-memory storage, never long-lived local storage.
- Derive the UI persona and allowed navigation from validated token roles.
- Support token expiry, silent renewal where possible, explicit logout, unauthorized and forbidden states.
- Preserve manual role selection only when the user deliberately chooses offline fixture mode.
- Remove `PDS_DEV_AUTH_TOKEN`, `PDS_ADMIN_TOKEN`, `VITE_DEV_AUTH_TOKEN` and `VITE_ADMIN_TOKEN` from deployed configuration and documentation after migration.

### 3. Secure API baseline and demonstrable proof depth: hours 5–9

#### API hardening

- Add security headers with Helmet, including frame protection, content-type protection and a practical Content Security Policy.
- Replace permissive `cors: true` with an environment-controlled exact-origin allowlist.
- Limit JSON request bodies to 256 KB.
- Apply rate limits:
  - 120 authenticated reads per minute per subject/IP.
  - 30 mutations per minute per subject/IP.
  - 3 reset requests per 15 minutes.
- Keep bearer tokens in the `Authorization` header; do not introduce authentication cookies, avoiding a new CSRF surface.
- Reduce public readiness output to health state only; do not expose internal entity counts publicly.
- Add OpenAPI bearer-auth documentation, role requirements, and `401`/`403` responses.
- Strengthen proof privacy validation to reject normalized aliases such as `aadhaarNumber`, `customer_aadhaar`, `phoneNumber`, `mobileNo`, `otpValue`, biometric payloads and full ration-card values at both API and chaincode boundaries.

#### Proof-status interfaces

Add shared response contracts and authenticated endpoints:

- `GET /ledger-proofs/:eventId`
  - Returns `eventId`, `operationId`, proof status, Fabric transaction ID, retry count, creation/submission/commit timestamps and safe failure category.
  - Available to operational roles for events they can already view.
  - Raw worker errors remain limited to `auditor` and `platform-admin`.
- `GET /admin/proofs/summary`
  - Returns counts by `PENDING`, `SUBMITTING`, `COMMITTED`, `FAILED` and `DEAD_LETTER`, oldest outstanding age, commit success percentage and recent committed transaction IDs.
  - Available to `platform-admin` and `auditor`.
- Extend the UI with separate badges for:
  - Operational transaction committed.
  - Blockchain proof pending.
  - Blockchain proof committed with Fabric transaction ID.
  - Retryable failure.
  - Dead letter requiring intervention.

Do not imply that operational success waits for Fabric. Keep PostgreSQL authoritative and the proof pipeline asynchronous.

#### Metrics

- Normalize route labels to prevent high-cardinality IDs in Prometheus.
- Add:
  - API request count and duration by normalized route, method, plane and status class.
  - Business-operation success/failure counters.
  - Outbox gauge by state.
  - Proof enqueue-to-commit histogram.
  - Retry and dead-letter counters.
  - Fabric submission duration and result.
- Protect `/metrics` with the `pds-metrics` Keycloak service account or expose it only on an internal network.
- Do not include beneficiary, ration-card, transaction or lot identifiers in metric labels.

### 4. Performance, security and compliance evidence: hours 8–11

#### Controlled benchmark

Create a repeatable benchmark script using the Keycloak `pds-benchmark` service account. It must:

- Refuse to run unless Fabric mode, PostgreSQL persistence and an explicit benchmark flag are enabled.
- Require separate authorization before reset/reseed because the benchmark mutates demo data.
- Generate unique idempotency keys and entity IDs.
- Measure:
  - 200 authenticated reads at concurrency 1, 5 and 10.
  - 20 complete lifecycle sequences at controlled concurrency.
  - Operational API success rate and p50/p95/p99 response time.
  - Proof submission success and p50/p95 enqueue-to-Fabric-commit latency.
  - Final outbox counts and Fabric transaction-ID completeness.
- Write raw evidence only under `/tmp`.
- Generate a sanitized maintained summary with environment specifications, workload, results and limitations.

Competition acceptance targets:

- 100% expected-request success for the controlled lifecycle.
- 100% of generated proofs reach `COMMITTED` with unique Fabric transaction IDs within 60 seconds.
- Zero remaining `PENDING`, `SUBMITTING`, `FAILED` or `DEAD_LETTER` rows.
- Local read p95 below 250 ms.
- Local operational mutation p95 below 500 ms, excluding asynchronous Fabric commit.
- Fabric proof commit p95 below 5 seconds.

If a target is missed, report the actual result and root cause rather than suppressing it.

#### Security and compliance pack

Produce:

- A threat model covering API impersonation, role escalation, token theft, proof tampering, replay, sensitive-data leakage, malicious peer behavior, outbox failure and administrator misuse.
- A data inventory showing on-chain, PostgreSQL, log, metric and transient authentication data.
- An implemented/partial/planned control matrix for authentication, authorization, encryption, privacy, key management, audit logging, retention, incident response and data protection.
- A DPDP/Aadhaar alignment assessment based only on current authoritative sources, explicitly labelled as technical preparation rather than legal certification.
- An SBOM and open-source licence inventory.
- Results from dependency audit, secret scanning, container-image scanning and an OWASP ZAP baseline where the environment permits.
- A remediation register with severity, owner, due date and accepted PoC limitations.

### 5. Commercial viability package: hours 10–12 and continuing

Position ViksitPDS as a **complementary trust, reconciliation and audit layer**, not a replacement for SMART-PDS, state PDS or ePoS.

Create a commercial-viability document containing:

- Economic buyer: State/UT Food and Civil Supplies Department.
- Influencers: district administration, NIC/state IT teams, audit/inspection authorities and government system integrators.
- Users: department officers, godown/issue-point operators, FPS dealers and auditors.
- Reference paid pilot:
  - One district.
  - One commodity.
  - Two upstream custody sites.
  - Ten FPS sites.
  - Department and audit users.
  - Mock, CSV or non-sensitive API integration only until formal data approval.
- Pilot deliverables:
  - Workflow and integration discovery.
  - Hosted or state-data-centre deployment.
  - IAM and role configuration.
  - Training and operating procedures.
  - Eight-to-twelve-week monitored run.
  - KPI and pilot-conversion report.
- Commercial structure:
  - One-time pilot implementation and integration fee.
  - Recurring annual platform, hosting/operations and support fee.
  - Separately priced custom integrations and change requests.
- Do not publish rupee prices until a cost model has been completed. Build low/base/high scenarios from engineering days, cloud/infrastructure, security assurance, travel/training and annual support obligations.
- Pilot value KPIs:
  - Proof completeness.
  - Time to detect and investigate custody mismatches.
  - Reconciliation turnaround time.
  - Manual touches per exception.
  - Duplicate/excess claim attempts detected.
  - User task completion time.
  - Infrastructure and support cost per participating site.
- Define conversion criteria from district pilot to state rollout: agreed KPI achievement, security review, integration feasibility, operational ownership and approved funding route.

Because there is no government validation yet:

- State this honestly in the competition submission.
- Prepare a two-page government concept note, demonstration link/video, workflow interview guide, data-requirement sheet and draft pilot charter.
- In the first month, target at least five attributable discovery interviews across department, district, FPS, audit and system-integrator perspectives.
- Record dates, roles, pain points, requested changes and whether feedback is informal, formal or pilot-related.
- Do not imply endorsement without written permission.

## Three-Month Execution

- **Month 1 — Engineering and evidence hardening**
  - Complete row-scoped transactional commands so business state, workflow event and outbox intent commit in one PostgreSQL transaction.
  - Add simultaneous-command, worker-race, crash-point and idempotency tests.
  - Extract the outbox worker into an independently runnable process.
  - Enforce token organization/stakeholder claims on mutation resources.
  - Complete performance baseline, threat model, compliance matrix and government discovery interviews.
- **Month 2 — Pilot integration and consortium expansion**
  - Add Procurement, FPS and Audit Fabric organizations and validate endorsement from every required peer.
  - Introduce managed enrolment, revocation, key rotation and HSM/vault integration design.
  - Define and test versioned SMART-PDS/ePoS adapter contracts using non-sensitive sandbox data.
  - Add configurable retention, audit export and operational alerting.
  - Validate the reference district pilot scope and cost model with prospective stakeholders.
- **Month 3 — Pilot readiness**
  - Run load, failover, recovery, privacy and penetration testing.
  - Add multi-node ordering/peer topology, backups, disaster recovery and zero-downtime chaincode upgrade procedures.
  - Produce deployment automation, monitoring dashboards, incident runbooks and support SLAs.
  - Complete pilot training material, acceptance criteria, commercial proposal and formal go/no-go review.
  - Continue to describe the system as pilot-ready only after critical security and concurrency gates pass.

## Test and Acceptance Plan

- IAM tests:
  - Valid Keycloak token and role accepted.
  - Missing, expired, bad-signature, wrong-issuer and wrong-audience tokens return `401`.
  - Valid token with insufficient role returns `403`.
  - Every mutation is exercised once with an allowed and denied role.
  - Admin, metrics and reset privileges remain independent.
  - Reset fails unless both `demo-reset` and `PDS_ALLOW_RESET=true` are present.
  - Web tokens are absent from local storage and removed on logout.
- Security tests:
  - Exact CORS allowlist, headers, body limit and rate limits.
  - No bearer token or sensitive field appears in logs, metrics or error responses.
  - Nested and aliased prohibited identity fields are rejected by API and chaincode.
  - Identical proof replay succeeds; conflicting replay fails.
- Technical tests:
  - Admin screens work with PostgreSQL and Fabric.
  - Proof status transitions are visible from enqueue through commit.
  - Worker retry, stale claim, dead letter and manual recovery remain correct.
  - Both Food and Godown peers endorse and return deterministic results.
- Release checks:
  - `npm run build`
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run test:demo-http` on a host that permits loopback listeners.
  - Authenticated live lifecycle and controlled performance benchmark.
  - Final outbox-state and Fabric transaction-ID verification.

## Assumptions and Defaults

- Keycloak is the competition and pilot-development IAM, with later federation to an approved government IAM through standard OIDC.
- Online demo and Fabric modes are secure by default; only tests and explicitly selected offline fixtures bypass IAM.
- No formal government interaction currently exists, so no endorsement or customer-validation claim will be made.
- The commercial model is paid district pilot followed by state-wide annual platform, integration and support contracting.
- No raw secrets, realm administrator passwords, demo-user passwords, private keys, benchmark evidence or local `.env` files will be committed.
- Benchmark reset/reseed and live lifecycle execution require explicit authorization.
- The controlled demo remains single-API-replica and non-production until transactional, concurrency, HA and security gates are completed.
- Existing unrelated worktree changes and generated journals remain untouched.
