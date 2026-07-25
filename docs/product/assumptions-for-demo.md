# Near-MVP demo assumptions

- PostgreSQL is the operational source of truth. Fabric proof completion is eventually consistent and does not roll back a valid operation.
- The deployed Fabric network has two organizations and simulates governance; it is not the final consortium.
- Application roles are enforced by the API. Some logical roles submit proofs through the department Fabric identity in this cycle.
- Online demo and Fabric modes use Keycloak OIDC. A static identity adapter is permitted only inside automated tests; generated Fabric crypto remains local-demo material.
- Quantities are positive integer kilograms. Unit conversion and calibrated weighbridge integration are deferred.
- Existing local transactional data is reset and deterministically reseeded; it is not migrated.
- The demo assumes one district and modest transaction volume.
- Single-node components are accepted locally. Backup and recovery are limited to the documented reset/reseed procedure.
- Operational completion and proof completion are distinct UI/API states. Expected Fabric delay must not block normal workflow.
- Proof payloads contain hashes and non-sensitive evidence only; raw beneficiary identity, OTP, biometric, mobile number and full ration-card values are prohibited.
- `demo-fps` is assigned to `FPS-101` in the durable authorization tables; the
  API derives the shop and opaque operator reference from that active
  subject-scope assignment and filters all FPS-facing reads. If an optional
  token shop claim is present, it must match the durable assignment.
- SMART-PDS/RCMS, state-SCM, and AePDS/ePoS records used in the demo are
  provisional fixtures submitted through the canonical integration boundary.
  They are not evidence of a live government integration.
- Maharashtra is the first proposed non-production adapter target. J&K remains
  a separate configuration/mapping exercise after approved contracts exist.

## Controlled-demo persistence waiver

The current PostgreSQL-backed demo still uses the in-memory domain engine and serialized full-state snapshot persistence. Saving operational state and inserting its Fabric-proof outbox event are separate database operations, so a process crash between them can leave a committed operational change without a proof queued for Fabric.

This limitation is accepted only for a controlled demonstration under all of these constraints:

- Run exactly one API replica. Multi-replica and high-availability operation are unsupported.
- Do not run concurrent mutation scripts or permit multiple operators to mutate workflow state concurrently.
- Reset and deterministically reseed immediately before the demonstration.
- Treat the demo as non-crash-safe; restart and repeat the reset lifecycle if the API or database fails during a run.
- After the scripted lifecycle, verify that the PostgreSQL outbox has no `PENDING`, `SUBMITTING`, `FAILED`, or `DEAD_LETTER` rows and that every `COMMITTED` row has a Fabric transaction ID.

This waiver does not mark transactional-command hardening complete. Atomic operational writes and outbox insertion are required before pilot use, multi-user concurrency testing, multiple API replicas, or any reliability/near-MVP production claim.

## Integration and proof completion

- Operational acceptance can be `ACCEPTED`, `QUARANTINED`, or `RECONCILED`
  while the Fabric proof remains `PENDING`, `SUBMITTING`, or retryable `FAILED`.
- An identical source-event replay returns the original operation. Conflicting
  content is rejected and recorded as privacy-safe audit evidence.
- A controlled demonstration is operationally successful only when the
  business lifecycle succeeds. Proof completion must be reported separately;
  it succeeds only when every expected outbox row is `COMMITTED` with a real
  Fabric transaction ID.
## Synthetic eligibility-screening add-on

The eligibility review workspace is an external-service simulation using five
clearly fictional Maharashtra panel profiles and fictional policy
`MH-PANEL-DEMO-2026-V1`. It does not replace SMART-PDS/RCMS, AePDS/ePoS, or a
State's lawful identification and appeal process. Screening and review are
non-blocking. Only a recorded, authorized, effective mock RCMS suspension or
cancellation blocks the synthetic card's entitlement; dependency failure and
invalid evidence preserve benefits. Final decisions take operational effect
independently of asynchronous Fabric proof delivery.
