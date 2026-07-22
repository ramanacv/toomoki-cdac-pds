# Challenge Readiness Tracker

This tracker implements the gaps identified in [the initial evaluation](../product/initial-evaluation.md) and the preserved [competition readiness plan](evaluation-gaps-impl.md). Status is evidence-based: **implemented** means code/configuration and automated checks exist; **partial** means a required live or operational gate remains; **planned** is not claimed as a current capability.

## Competition track

| Area | Status | Evidence and remaining gate |
|---|---|---|
| PostgreSQL/Fabric admin queries | Implemented | Admin dashboard, network, activity and stakeholder summaries await operational query results and no longer read stale PostgreSQL-mode memory. |
| Fabric version/topology labels | Partial | Maintained UI/docs and Compose use Fabric 2.5.15, and the expected peers, orderer, CouchDB instances and submitting MSP are documented. The current containers are running but the channel is not bootstrapped, so the committed definition and two-peer behavior are not live-verified; see [live Fabric demo evidence](fabric-demo-evidence.md). |
| Jury web data source | Implemented | Container build fixes `VITE_DATA_SOURCE=api`; API/IAM failures are visible and never trigger automatic fixtures. `VITE_DATA_SOURCE=mock` is the explicitly labelled backup. |
| Keycloak deployment | Implemented | `iam` Compose profile, pinned Keycloak 26.7.0, realm import, persistent volume, health check and environment-driven bootstrap. Secrets are not in the realm or repository. |
| OIDC web login | Implemented | Authorization Code + PKCE-S256 through `oidc-client-ts`; tokens use session storage, roles drive navigation, and logout clears the OIDC session. Browser-flow verification against the running IAM remains a release gate. |
| Secure-by-default API | Implemented | Only explicit `@Public` landing/docs/OpenAPI/liveness/readiness/health routes bypass OIDC. Wrong or missing identity is `401`; insufficient role is `403`. Static identity exists only with `NODE_ENV=test`. |
| Least-privilege RBAC | Implemented | Canonical roles and endpoint policies cover all current controllers; metrics, admin and reset are independent. Organization/stakeholder resource scoping remains a Month 1 gate. |
| HTTP hardening | Implemented | Helmet/CSP, exact-origin CORS, 256 KB JSON limit, bearer-only auth and per-subject/IP read/mutation/reset limits. The limiter is process-local and appropriate only to the controlled single-replica demo. |
| Proof status | Implemented | Per-event and aggregate durable outbox endpoints, safe failure categories, privileged raw errors, admin summary and UI status badges. |
| Proof privacy | Implemented | Recursive normalized alias rejection exists at API and chaincode boundaries with tests. |
| Metrics | Implemented | Normalized route/status labels, business outcomes, outbox state, commit latency, retry/dead-letter and Fabric submission metrics; access requires `metrics-reader` or `platform-admin`. |
| Controlled benchmark | Partial | An authorized live Fabric run is recorded in `benchmark-results.md`: operational success and latency targets passed, but proof-completion gates missed because the run began with a non-empty outbox, and lifecycle concurrency 2 exposed the documented snapshot-persistence limitation. A clean-baseline rerun remains required. |
| Security/compliance pack | Partial | Threat model, data inventory, control matrix, current official-source DPDP/Aadhaar assessment, SBOM/licence generation and scan register exist. External VAPT/ZAP and container scanning remain environment/pilot gates. |
| Commercial/pilot package | Implemented | Paid district-pilot model, cost framework, KPIs, conversion criteria, concept note, discovery guide, data sheet and draft charter are documented without government-endorsement claims. |

## Release evidence checklist

- [x] `npm run build` (web bundle-size warning only)
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test` (343 tests)
- [x] `npm run test:demo-http` on a host that permits loopback listeners (9 tests)
- [ ] Keycloak login/logout, expiry and role-navigation browser test
- [ ] Live Fabric topology/definition verification against both peers
- [ ] Authenticated lifecycle with final outbox state and Fabric transaction IDs
- [ ] Explicitly authorized competition benchmark and maintained sanitized result

Passing this checklist demonstrates a controlled near-MVP competition demo. It does not establish crash atomicity, multi-replica concurrency, HA, government approval or production readiness.

## Three-month track

| Month | Gate | Status |
|---|---|---|
| 1 | Row-scoped transactions, simultaneous-command/crash tests, standalone outbox worker, claim-scoped authorization, evidence baseline and five attributable interviews | In progress; transaction services exist for several commands, but completion requires the hardening-plan gates and interview evidence. |
| 2 | Procurement/FPS/Audit Fabric organizations, managed enrolment/revocation/rotation, HSM/vault design, versioned SMART-PDS/ePoS adapters, retention/export/alerting and validated cost model | Planned |
| 3 | Load/failover/recovery/privacy/penetration tests, multi-node topology, backup/DR/upgrades, deployment automation, monitoring/runbooks/SLAs and formal pilot go/no-go | Planned |

The product remains a complementary trust, reconciliation and audit layer for SMART-PDS, state PDS, ePoS, procurement, logistics and authentication systems.
