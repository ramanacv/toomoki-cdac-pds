# Current PoC Evaluation

Re-evaluated on **22 July 2026** against [the C-DAC PoC evaluation template](PoC_evaluation_template_inputs.pdf), using the current repository, automated checks, and read-only inspection of the running local stack.

> 23 July documentation addendum: the controlled-PoC now has durable
> database authorization assignments, `demo-fps` → `FPS-101` scoping,
> two-shop isolation, fixture-backed canonical integrations, provenance,
> replay/conflict/quarantine handling, reconciliation, and source-to-proof
> trace. These additions resolve the PoC-level resource-scope and adapter-seam
> findings below. They do not change this dated 35/50 scoring snapshot or close
> its external-contract, crash-atomicity, concurrency, security, recovery, or
> government-validation gates.

## Bottom line

The current evidence-based estimate is **35/50**, up from the **26/50** midpoint in the [initial evaluation](gpt56sol-initial-evaluation.md).

The application has materially improved. The earlier admin failure and lint errors are fixed; the release checks are green; Keycloak/OIDC, secure-by-default API authorization, explicit least-privilege roles, proof-status visibility, improved privacy validation, security evidence, and a district-pilot commercial package are now implemented. The running environment also provides credible live Fabric evidence.

The score is not yet in the 40s because the repository still has no completed controlled performance report, government validation, measured business outcomes, reviewed cost/price model, external integration, VAPT, HA/failover evidence, or crash-safe multi-replica persistence. Team credentials and jury presentation quality also cannot be established from source code.

## Revised score

| Jury criterion | Initial | Current | Change | Assessment |
|---|---:|---:|---:|---|
| Technical Proof & Implementation Viability | 11/15 | **13/15** | +2 | A working NestJS/PostgreSQL/React/Fabric system, two live Fabric organizations, deterministic and idempotent proof chaincode, durable proof delivery, trace/exception UI, and a substantially stronger automated test base. The snapshot-persistence and atomicity limitation remains a serious pilot-readiness deduction. |
| Security, Performance & Compliance | 5/10 | **7/10** | +2 | Keycloak OIDC, PKCE, service identities, secure-by-default API authentication, least-privilege roles, HTTP hardening, privacy validation, safe metrics, SBOM/licence inventory, dependency audit, threat model, and DPDP/Aadhaar preparation now exist. No controlled benchmark, VAPT, production TLS/at-rest evidence, HSM/key lifecycle, retention process, or incident-response exercise exists. |
| Stakeholder Alignment & Scalability Potential | 5/10 | **6/10** | +1 | The PDS workflow, buyer/users, five-organization target consortium, government engagement kit, pilot scope, and scale limitations are documented honestly. There are still no recorded government interviews, real SMART-PDS/ePoS integrations, multi-district tests, multi-node ordering, HA, DR, or capacity evidence. |
| Commercial Viability | 2/10 | **5/10** | +3 | The project now defines the economic buyer, users, reference paid district pilot, deliverables, commercial structure, KPIs, and conversion gates. It still lacks customer validation, market sizing, a reviewed cost model, price scenarios, quantified baseline/ROI, procurement evidence, and a committed pilot route. |
| Team Capabilities (Presentation & Clarity) | 3/5 | **4/5 provisional** | +1 | The architecture, limitations, security posture, pilot proposition, and verification discipline are much clearer, and all static release checks pass. Team composition, domain credentials, delivery ownership, live presentation, and Q&A performance remain outside repository evidence. |
| **Total** | **26/50** | **35/50** | **+9** | Strong controlled PoC and credible competition demonstration; not yet pilot- or production-ready. |

A reasonable jury range is **34–37/50**, depending on the live presentation and any team, government, or commercial evidence held outside the repository. **35/50** is the defensible repository-backed score, not an optimistic ceiling.

## What improved materially

### 1. Technical implementation

- `npm run build`, `npm run typecheck`, and `npm run lint` now pass.
- `npm test` passes **345 tests** across the API, web app, fixtures, shared contracts, and chaincode.
- `npm run test:demo-http` passes **9 HTTP tests**.
- The earlier asynchronous PostgreSQL/Fabric admin-summary defect is covered by current admin service/module tests.
- The UI uses explicit API or offline-fixture modes and does not silently fall back during a jury API build.
- Proof delivery exposes `PENDING`, `SUBMITTING`, `COMMITTED`, `FAILED`, and `DEAD_LETTER`, with retry and privileged error visibility.
- The API submits `RecordLedgerProof`, waits for Fabric commit status, records the real Fabric transaction ID, and keeps operational completion distinct from proof completion.

### 2. Live Fabric credibility

Read-only inspection on 22 July 2026 verified:

- Fabric peer/orderer images at 2.5.15, two peer organizations, two CouchDB instances, two CAs, PostgreSQL, Keycloak, API, and web containers running.
- Both `peer0.food.example.com` and `peer0.godown.example.com` joined to `pdschannel`.
- `pds-chaincode` committed at **version 1.1, sequence 2**, with approvals recorded for `FoodAndCivilSuppliesMSP` and `GodownWarehouseMSP` on both peers.
- Chaincode containers running on both peers.
- PostgreSQL outbox snapshot: **1,017 COMMITTED**, **1,017 with Fabric transaction IDs**, **1,017 distinct Fabric transaction IDs**, and no remaining pending, submitting, failed, or dead-letter rows.

This is strong proof-completion evidence. It is not a controlled throughput benchmark, a fresh lifecycle run attributable to this review, or proof of crash atomicity and multi-replica safety.

### 3. Security and compliance preparation

- Online modes use Keycloak-issued RS256 tokens with issuer, audience, expiry, not-before, JWKS, and signature validation.
- The browser uses Authorization Code + PKCE and session-scoped OIDC state.
- API routes are authenticated unless explicitly public; missing/invalid identity returns 401 and insufficient roles return 403.
- Role policies separate operational, auditor, platform-admin, metrics-reader, and demo-reset authority.
- Helmet/CSP, exact-origin CORS, request-size limits, rate limits, normalized audit routes, and identifier-safe metric labels are implemented.
- Recursive proof privacy checks reject normalized Aadhaar, phone/mobile, OTP, biometric, and unsafe ration-card aliases at API and chaincode boundaries.
- A threat model, data inventory, control matrix, DPDP/Aadhaar preparation, SBOM, licence inventory, dependency audit, and remediation register now exist under `docs/security`.

### 4. Commercial and stakeholder clarity

- [Commercial viability](../commercial/commercial-viability.md) identifies the State/UT Food and Civil Supplies Department as buyer and defines users/influencers.
- The reference offering is a paid one-district, one-commodity, ten-FPS pilot with an eight-to-twelve-week monitored run.
- The package defines one-time implementation/integration fees, recurring platform/operations/support fees, separately scoped integrations, pilot KPIs, and conversion gates.
- The [government pilot kit](../commercial/government-pilot-kit.md) includes a concept note, workflow interview guide, data requirements, and draft charter.
- The documentation correctly says there is no current government validation or endorsement.

## Why marks are still being lost

### Technical viability: 2 marks withheld

- PostgreSQL runtime still serializes full in-memory state and saves the operational snapshot separately from proof-outbox insertion.
- The application must remain single-replica and should not claim concurrent mutation safety or crash atomicity.
- The outbox poller remains embedded in the API.
- Only two Fabric organizations are deployed; the wider five-organization model is documentation, not current governance.
- No fresh two-peer regression was run as part of this review.

### Security, performance, and compliance: 3 marks withheld

- The controlled benchmark script exists, but there is no maintained benchmark result with workload, success rate, p50/p95/p99, proof latency, and final outbox state.
- The benchmark's default lifecycle concurrency must not be treated as safe evidence while snapshot persistence remains the authoritative runtime.
- No independent VAPT, ZAP result, container-image scan, failover test, or incident-response exercise exists.
- FPS resource ownership is database-enforced for the controlled PoC. Broader
  organization/geography/facility enforcement and pilot contract authorization
  remain release gates.
- Production TLS, database/storage encryption, secrets management, certificate rotation/revocation, and HSM-backed keys are not demonstrated.
- Retention/deletion, privacy-impact, and formal legal/compliance approval remain future work.

### Stakeholder alignment and scalability: 4 marks withheld

- No attributable government, district, FPS, auditor, NIC/integrator, or department interviews are recorded.
- Government-system study is document-based rather than validated through a department workflow exercise.
- SMART-PDS/RCMS, state-SCM, and AePDS/ePoS now have fixture-backed canonical
  adapters, but no department/NIC-approved external contract or live connection
  exists.
- There is no measured capacity model, wide-area test, multi-district tenancy evidence, multi-node Raft, redundant peers, backup/restore proof, DR exercise, or Kubernetes deployment.

### Commercial viability: 5 marks withheld

- No reviewed low/base/high delivery cost model or rupee pricing exists.
- No market sizing, competitive procurement analysis, tender/system-integrator route evidence, or sales pipeline is documented.
- No baseline measurements support time-saved, cost-reduction, or manual-effort claims.
- No customer discovery, letter of interest, pilot sponsor, budget owner, or willingness-to-pay evidence exists.
- The KPIs and conversion model are well framed but remain hypotheses.

### Team capabilities: 1 mark withheld

- The repository does not establish founder/team names, relevant government/PDS/blockchain/security experience, ownership by workstream, availability, or jury presentation quality.
- Two maintained evidence documents are slightly stale: the Fabric evidence file still reports no joined channel, and the readiness tracker reports 343 rather than the currently observed 345 tests. This should be reconciled before submission.

## Honest status of the seven demonstration features

| Requested feature | Current status |
|---|---|
| Immutable Ledger | **Demonstrable** through committed Fabric proofs, transaction IDs, and history queries. |
| Smart Contracts | **Demonstrable** through deterministic proof validation, MSP authorization, privacy enforcement, and replay/conflict behavior. |
| Digital Identity | **Partial but materially improved**: Keycloak application identities and Fabric x.509 organization identities exist; production government IAM federation and managed Fabric identity lifecycle do not. |
| Audit Trail | **Demonstrable** through trace/history, security decisions, audit alerts, proof status, and Fabric transaction correlation. |
| Role-based Access | **Demonstrable for the competition** through OIDC, database role assignments, FPS-101 ownership enforcement, and integration-source assignments; wider pilot geography/facility contracts remain incomplete. |
| API Integration | **Demonstrable through canonical fixture adapters** with provenance, replay, quarantine, reconciliation, and trace; external government contracts remain unapproved and simulated. |
| Data Integrity | **Demonstrable** through canonical hashing, privacy-safe proofs, identical/conflicting replay behavior, committed transaction IDs, and DB-ledger verification paths. |

## Fastest path to 40/50

1. Run and publish a controlled sequential Fabric benchmark with exact environment, denominators, p50/p95/p99, success rate, proof latency, and final outbox state. Do not use concurrent mutations until transactional persistence is safe.
2. Refresh the live Fabric evidence after a scripted lifecycle and two-peer regression, including exact endorsement policy and proof-completion results.
3. Record at least three to five attributable workflow-validation interviews, without implying government endorsement.
4. Complete a reviewed pilot cost model, pricing scenarios, market/procurement route, and baseline-to-target ROI measurement plan.
5. Add a concise team-capability section with roles, relevant experience, ownership, and a rehearsed end-to-end jury narrative.
6. Reconcile stale evidence documents and keep the controlled-demo persistence limitation visible.

## Verification performed

- `npm run build`: passed; web bundle warning remains at 583.31 kB minified.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero warnings.
- `npm test`: passed, **345 tests**.
- `npm run test:demo-http`: passed, **9 tests**.
- Running containers: inspected read-only.
- Both peer channel memberships: verified read-only.
- Committed chaincode definition on both peers: verified read-only.
- PostgreSQL outbox status and unique Fabric transaction-ID counts: verified read-only.
- Not run: reset/reseed, live lifecycle, competition benchmark, destructive Fabric bootstrap, chaincode upgrade, VAPT, failover, or Fabric regression.

## Final assessment

ViksitPDS is now a **strong, credible controlled PoC** with a defensible blockchain boundary and substantially better security and commercial framing. The improved score is **35/50**. The next marks will come less from adding features and more from producing controlled performance evidence, external stakeholder validation, commercial numbers, and a polished team presentation while preserving honest pilot-readiness limitations.
