# ViksitPDS Implementation Docs

This folder contains implementation guidance derived from the product and technical documentation.

## Documents

- [MVP implementation plan](mvp-implementation-plan.md)
- [NestJS 11 + Fabric Gateway refactor](fabric-gateway-plus-refactor.md) — completed implementation plan
- [Sprint backlog](sprint-backlog.md)
- [Mock data and fixtures](mock-data.md)
- [J&K/Maharashtra ePoS–SMART-PDS implementation plan](jkmaha-epos-smartpds-implementation-plan.md)
- [Near-MVP hardening tracker](mvp-hardening-plan.md)
- [External ghost-beneficiary screening and review implementation](ghost-detection-impl.md)
- [Beneficiary registry and fraud-detection alignment](beneficiary-registry-alignment.md)
- [POC test-case gap analysis (all 14 draft TCs)](poc-test-case-gap-analysis.md)
- [Application → Fabric payload inventory](fabric-proof-submission-inventory.md)
- [User-case Fabric payloads](../usercases/application-to-fabric-payloads.md) — exact `RecordLedgerProof` envelopes by use case
- [Demo docs](../demo/README.md) — final VM blockchain script + POC test-case checklist
- [Provenance badge wiring (2026-07-30)](provenance-badge-wiring-2026-07-30.md)
  — auth/allocation/entitlement/distribution `ledgerTxId` → `ProvenanceBadges`
- [Mocks-only integrity + proof completeness](mocks-integrity-proof-completeness-plan.md)
  — includes `npm run test:beneficiaries` and `npm run live:beneficiaries` for the
  fraud-prevention / lifecycle focus shift
- [Three-module mock services](three-module-mock-services.md)
  — eligibility-mock + epos-auth-mock; includes `npm run live:fps-auth` for FPS
  authentication success/failure coverage

## Intended Use

For the maintained current-state path, start with the J&K/Maharashtra plan and
the near-MVP hardening tracker. The original MVP plan and sprint backlog are
retained as implementation history. `mock-data.md` is the source for fixture
layout and regeneration; `production-readiness-todos.md` captures additional
deployment and assurance work beyond the integration and transactional gates.
