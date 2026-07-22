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

## Controlled-demo persistence waiver

The current PostgreSQL-backed demo still uses the in-memory domain engine and serialized full-state snapshot persistence. Saving operational state and inserting its Fabric-proof outbox event are separate database operations, so a process crash between them can leave a committed operational change without a proof queued for Fabric.

This limitation is accepted only for a controlled demonstration under all of these constraints:

- Run exactly one API replica. Multi-replica and high-availability operation are unsupported.
- Do not run concurrent mutation scripts or permit multiple operators to mutate workflow state concurrently.
- Reset and deterministically reseed immediately before the demonstration.
- Treat the demo as non-crash-safe; restart and repeat the reset lifecycle if the API or database fails during a run.
- After the scripted lifecycle, verify that the PostgreSQL outbox has no `PENDING`, `SUBMITTING`, `FAILED`, or `DEAD_LETTER` rows and that every `COMMITTED` row has a Fabric transaction ID.

This waiver does not mark transactional-command hardening complete. Atomic operational writes and outbox insertion are required before pilot use, multi-user concurrency testing, multiple API replicas, or any reliability/near-MVP production claim.
