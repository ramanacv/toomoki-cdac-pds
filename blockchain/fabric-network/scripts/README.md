# Fabric Scaffold Scripts

Scripts for the PDS Fabric network lifecycle. The network targets Fabric 2.5.15
(`hyperledger/fabric-peer:2.5.15`, `hyperledger/fabric-tools:2.5.15`) with a
2-org deployment (`FoodAndCivilSuppliesMSP`, `GodownWarehouseMSP`) on the
`pdschannel` channel; the remaining 3 orgs (procurement, FPS, audit) are
documented as future peers — see `connection-profiles/` and
`validate-fabric-artifacts.mjs`.

## Bootstrap & lifecycle

- `bootstrap-fabric-full.sh` — full bootstrap: pulls Fabric 2.5.15 tool images,
  generates crypto material, the channel artifact, and joins peers. End-to-end
  entry point for standing up the 2-org network.
- `bootstrap-network.sh` — documents the planned bootstrap sequence for the
  MVP (network topology + channel + chaincode).
- `generate-crypto.sh` — generates MSP material with `cryptogen` via the
  `fabric-tools:2.5.15` image.
- `configtxgen.sh` — generates the channel genesis / configtx block.
- `osnadmin-channel-join.sh` — joins the orderer through the channel
  participation API.
- `peer-channel-join.sh` — joins peers to `pdschannel`.
- `generate-connection-profiles.sh` — emits the per-org client connection
  profiles under `../connection-profiles/`.

## Chaincode

- `package-chaincode-bundle.sh` — produces a self-contained chaincode package
  (`dist/src/server.js` entrypoint) for Fabric external builders. Fixtures are
  excluded from the bundle (not needed on the Fabric runtime path).
- `deploy-chaincode.sh` — packages and deploys `pds-chaincode` to the channel
  using the `fabric-tools:2.5.15` image.
- `smoke-fabric.sh` — smoke-tests a running network (query/invoke sanity).

## Validation

- `validate-fabric-artifacts.mjs` — validates the scaffold artifacts
  (manifest, contract, compose, env, connection profiles) and aligns with the
  2-org deployment: deployed-org profiles must reference peers present in
  `docker-compose.fabric.yml`; future-org profiles are validated for shape and
  skipped from the deployed-peer check with a warning. Run with
  `node validate-fabric-artifacts.mjs`.

## Notes

- `bootstrap-fabric-full.sh` resets in-container Fabric ledger state. It is
  destructive and must not be used as an ordinary test or without explicit
  authorization. Individual lifecycle scripts are idempotent where practical,
  but callers must still inspect the deployed channel and chaincode definition.
- Chaincode changes require a new sequence, identical packages on both peers,
  approval from both organizations, commit-readiness verification, and a
  two-peer regression.
- The exact deployed Godown MSP ID is `GodownWarehouseMSP`.
- CouchDB credentials for the peer state database are sourced from
  environment variables in `../docker-compose.fabric.yml` — do not hardcode
  them in scripts.
