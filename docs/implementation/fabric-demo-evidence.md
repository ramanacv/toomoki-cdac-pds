# Live Fabric Demo Evidence

Evidence refreshed on **2026-07-30** from the local controlled-demo
environment. Refresh this file immediately before a jury demonstration; it is
not a production or availability certificate.

## Container topology observed

| Component | Observed image | State |
|---|---|---|
| Food peer | `hyperledger/fabric-peer:2.5.15` | Running |
| Godown peer | `hyperledger/fabric-peer:2.5.15` | Running |
| Orderer | `hyperledger/fabric-orderer:2.5.15` | Running |
| Food CA | `hyperledger/fabric-ca:1.5.15` | Running |
| Godown CA | `hyperledger/fabric-ca:1.5.15` | Running |
| Food CouchDB | `couchdb:3.4` | Running |
| Godown CouchDB | `couchdb:3.4` | Running |

The configured submitting MSP is `FoodAndCivilSuppliesMSP`. The live channel is
`pdschannel`, the chaincode is `pds-chaincode`, and the committed validation
policy requires both `FoodAndCivilSuppliesMSP` and `GodownWarehouseMSP`.

## Current live-verification result

Both peers independently returned this committed definition:

- version `1.1`;
- sequence `2`;
- approvals from `FoodAndCivilSuppliesMSP` and `GodownWarehouseMSP`;
- identical validation-policy bytes on both peers;
- endorsement plugin `escc` and validation plugin `vscc`.

Both peers also reported the identical installed package:

`pds-chaincode_1.1:a3f15750cc0383bad9c3408ad12078534ddca85faeee78f5160c67e49f55e334`

The version-1.1 chaincode containers registered successfully with both peers.
No bootstrap or ledger reset was performed.

## Two-peer proof regression

An opaque `RecordLedgerProof` deployment probe was submitted with both peer
addresses and both TLS roots:

- event ID: `EVT-CC-UPGRADE-1-1-20260730`;
- original Fabric transaction:
  `df4e950faa738d80937e71d89def59cf5bed375cff3bf0c30290f43907fb181f`;
- commit status: `VALID` at both peers;
- identical replay transaction:
  `74152101ec1021fc7a5b20218ca893895515721f53cd9464daa58f324b4f4d59`;
- replay result: `duplicate: true`, retaining the original Fabric transaction
  ID, and `VALID` at both peers.

Both version-1.1 peer runtimes logged successful execution for the original
proof and its replay.

## Remaining demo verification

The maintained authenticated API smoke was not run in this shell because
`PDS_BENCHMARK_CLIENT_SECRET` / `PDS_E2E_ACCESS_TOKEN` was not supplied.
This does not invalidate the direct two-peer chaincode regression, but a final
demo rehearsal should still run `npm run regression:fabric` with a short-lived
credential.

The PostgreSQL outbox snapshot after deployment was:

- `COMMITTED=579`;
- `DEAD_LETTER=95`;
- no `PENDING`, `SUBMITTING`, or `FAILED` rows were returned.

The deployment is therefore operational, but historical proof completion is
not clean. The dead-letter rows require explicit review/manual retry; they were
not bulk-retried as part of this upgrade. Do not treat the evidence above as
crash-atomicity, concurrent-command-safety, or production-readiness proof.
