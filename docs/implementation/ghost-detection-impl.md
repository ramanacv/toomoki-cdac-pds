# External Ghost-Beneficiary Screening and Review Demo

## Summary

Implement this feature on `feature/ghost-beneficiary-eligibility` as an additive
demo capability. Existing allocation, entitlement, distribution, integration,
and proof flows remain intact.

Add a separately deployable mock eligibility-screening service. During the
demonstration, a department user selects a synthetic beneficiary and runs an
external eligibility check. ViksitPDS consumes the service's status and
privacy-safe evidence, opens or clears a review case, and supports a guided RCMS
decision, appeal, and reinstatement workflow.

The external service detects possible eligibility problems; it never directly
cancels ration cards.

```text
Department UI
    ↓
ViksitPDS API
    ↓ HTTP
External Eligibility Mock Service
    ↓ screening status
ViksitPDS review case
    ↓ authorized department decision
Mock RCMS status and entitlement enforcement
    ↓
Privacy-safe Fabric proof
```

## Implementation changes

### External mock service

- Add `apps/eligibility-mock`, with its own Dockerfile and Docker Compose
  service.
- Expose `GET /health` and `POST /v1/screenings`.
- Configure ViksitPDS with `PDS_ELIGIBILITY_SERVICE_URL`,
  `PDS_ELIGIBILITY_SERVICE_TIMEOUT_MS` (default `3000`), and the uncommitted
  `PDS_ELIGIBILITY_SERVICE_TOKEN`.
- Require a bearer service token.
- Make requests idempotent by `screeningRequestId`; return the original response
  for an identical replay and `409` for conflicting reuse.
- Accept only opaque references:

```json
{
  "screeningRequestId": "SCREEN-DEMO-001",
  "demoBeneficiaryId": "BEN-DEMO-001",
  "subjectRefHash": "beneficiary-demo-001-hash",
  "rationCardHash": "ration-card-demo-001-hash",
  "checks": ["DEATH", "ACTIVITY", "ECONOMIC", "LAND"],
  "schemaVersion": "1.0"
}
```

- Return screening/request IDs, a primary status, source-specific signals,
  recommended action, fictional policy reference, assessment/expiry times,
  evidence digest, response-attestation hash, and schema version.
- Support `CLEAR`, `DEATH_MATCH_REVIEW`, `INACTIVITY_REVIEW`,
  `PORTABILITY_ACTIVITY_FOUND`, `ECONOMIC_ELIGIBILITY_REVIEW`,
  `LANDHOLDING_REVIEW`, and `MULTI_SOURCE_CONFLICT`.
- Simulate death registry, AePDS/ONORC activity, GST/turnover, income-tax,
  employment, land-record, and RCMS sources without returning raw records.
- Never accept or return Aadhaar, PAN, GSTIN, phone, address, full ration-card
  values, tax-return details, land-parcel identifiers, employer details, or
  beneficiary names.

### ViksitPDS consumption and case workflow

- Add a typed client with timeout, schema validation, authentication,
  correlation IDs, retry-safe errors, and an injectable test adapter.
- Add on-demand screening, summary, case detail/list, verification,
  recommendation, decision, appeal, reinstatement, entitlement-gate, and guarded
  demo-reset endpoints under `/eligibility/v1`.
- Department may run screenings and mutate cases. Department, auditor, and
  management may read.
- Clear or portability results close or avoid a case without affecting
  entitlement. Review results create or update a case. Unknown, malformed,
  expired, conflicting, or unavailable responses are quarantined and never
  block benefits.
- Use the case lifecycle from `OPEN` through verification, notice,
  recommendation, decision, appeal, reinstatement, and closure.
- Review and recommendation remain non-blocking. Only an authorized, effective
  `TEMPORARILY_SUSPENDED` or `CARD_CANCELLED` mock RCMS decision blocks
  entitlement validation and distribution.
- Enforce idempotent action replay, conflicting idempotency-key detection,
  optimistic versions, and valid transitions.
- In PostgreSQL mode, commit the final action, decision, card/entitlement
  update, ledger event, and outbox record in one transaction.
- Reinstatement restores the remaining entitlement without restoring lifted
  quantities.

### Synthetic panel scenarios

1. **Asha Patil (Fictional), `BEN-DEMO-001`:** death-match review; verification
   removes one deceased member, changes household size from five to four, and
   changes demo Rice entitlement from 25 kg to 20 kg.
2. **Ravi Shinde (Fictional), `BEN-DEMO-002`:** apparent inactivity is cleared
   by ONORC portability activity with no interruption.
3. **Meera Kulkarni (Fictional), `BEN-DEMO-003`:** corroborated fictional
   economic signals lead through notice and recommendation to authorized RCMS
   cancellation.
4. **Sunita More (Fictional), `BEN-DEMO-004`:** a stale land source is cleared
   by field verification.
5. **Imran Shaikh (Fictional), `BEN-DEMO-005`:** a multi-source conflict
   demonstrates cancellation, appeal, corrected evidence, and reinstatement.

Names and display IDs stay in demo-only operational fixtures/UI. Calls, logs,
proofs, and correlations use opaque hashes. Card references are masked.

### UI

- Add an Eligibility review screen for Control Office, Management, and Auditor,
  with a prominent synthetic external-service simulation banner.
- Show dependency health, last success, latency, screening counts, open cases,
  decisions, appeals, reversals, beneficiary status, signal source/risk,
  entitlement effect, source evidence freshness, policy explanation, next
  action, and correlation/attestation references.
- Department users can screen and perform only valid guided actions.
- Add an entitlement gate demonstration showing that review does not block,
  cancellation does block, and reinstatement restores the remaining balance.
- Management and Auditor are read-only. Offline fixture mode is read-only.
- Dependency failures warn the user and preserve entitlement.
- Show operational decision status separately from Fabric proof status.

### Proof behavior

- Submit only final authorized decisions and reversals through
  `RecordLedgerProof`.
- Include case ID, opaque beneficiary/card hashes, policy/rule IDs,
  outcome/reason codes, effective timestamp, prior/new state, and external
  evidence digest.
- Keep names, display IDs, response bodies, source facts, reviewer material,
  and appeal evidence off-chain.
- Operational RCMS decisions remain effective independently of proof delivery.

## Test and acceptance plan

- Contract-test the API and external service schemas.
- Cover all deterministic statuses, authentication, timeout, malformed and
  expired responses, unknown status, replay, and conflicting request IDs.
- Prove unavailable/invalid responses never suspend or cancel entitlement.
- Cover department mutation permissions and auditor/management read-only views.
- Cover valid and invalid transitions, idempotency, optimistic conflicts,
  simultaneous decisions, and rollback.
- Verify PostgreSQL final-decision atomicity across case, entitlement, history,
  event, and outbox.
- HTTP tests prove review is non-blocking, cancellation blocks real entitlement
  and distribution paths, member removal recalculates quantity, portability
  clears inactivity, and reinstatement preserves consumed balance.
- UI tests cover health, screening, statuses, case actions, role restrictions,
  dependency failure, offline mode, and separate operational/proof status.
- Run `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, and
  `npm run test:demo-http`.
- Run Fabric regression only if the network is already available. Never reset
  Fabric or demo data without separate authorization.

## Defaults and safeguards

- Use a separate service/container and on-demand deterministic screening.
- Use fictional simulation-only policy `MH-PANEL-DEMO-2026-V1`.
- Preserve the dirty worktree; do not discard, reset, stage, or commit unrelated
  changes.
- This is a controlled-demo add-on, not a replacement for SMART-PDS/RCMS,
  AePDS/ePoS, existing workflows, or State eligibility law, and it is not a
  production-readiness claim.
- Do not create a commit unless separately requested.

## Local run

Supply a non-committed service token and enable the opt-in Compose profile:

```sh
PDS_ELIGIBILITY_SERVICE_TOKEN='<local-secret>' \
docker compose --profile eligibility up -d --build eligibility-mock api web
```

The mock service listens on port `3010`. Its health endpoint is public, while
`POST /v1/screenings` requires the bearer service token. Leaving the profile
disabled preserves the existing Compose startup path; the Eligibility review
screen reports the dependency as unavailable and does not change entitlement.
