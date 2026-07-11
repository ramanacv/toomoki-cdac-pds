# Production-readiness todos

| Priority | Work | Rationale |
|---|---|---|
| P0 before pilot | Replace runtime snapshot persistence with row-scoped transactional command services and repositories | Full-table truncate/rebuild can lose concurrent updates and makes multiple API replicas unsafe. Controllers should remain thin; command services should use row locks or optimistic concurrency. |
| P0 before pilot | Commit each operational mutation, workflow transition, domain event, and proof-outbox insertion in one PostgreSQL transaction | Prevents a process crash from committing operational state without durably recording the corresponding Fabric proof intent. |
| P0 before pilot | Extract the proof poller into an independently runnable worker with manual dead-letter retry and operational metrics | Decouples proof delivery from API availability while retaining PostgreSQL `SKIP LOCKED` coordination. |
| P0 before pilot | Deploy Procurement, FPS and Audit organizations; approve endorsement and private-data policies | The two-org demo is not sufficient governance separation. |
| P0 before pilot | Real OIDC/IAM, organization-scoped Fabric identities, enrollment, revocation and HSM keys | Demo tokens and generated identities are not production credentials. |
| P0 before pilot | Multi-node Raft, redundant peers, persistent backups, disaster recovery and zero-downtime chaincode upgrades | Removes accepted single-node failure modes. |
| P0 before pilot | Schema migration tooling that preserves pilot transactions | Reset/reseed is intentionally demo-only. |
| P0 before pilot | Load, failover, penetration, privacy and formal quantity-invariant testing | Required evidence before handling real beneficiaries or stock. |
| P1 | Decimal units, weighbridge evidence, quality inspection, multi-source transformations, returns and reversals | Integer kilograms and simple one-source movements are cycle constraints. |
| P1 | Event signing, key rotation, secrets management, SIEM, alert SLOs, retention policy and privacy impact review | Required operational security and accountability controls. |
| P1 | Kubernetes deployment, capacity planning and controlled rollout automation | Needed for scalable, repeatable operations. |
| P1 | SMART-PDS, ePoS, authentication, logistics and external reconciliation adapters | Demo integrations are fixtures, not production system contracts. |
