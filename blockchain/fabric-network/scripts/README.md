# Fabric Scaffold Scripts

Scripts for the PDS Fabric network lifecycle. The network targets Fabric 3.1.x
(`hyperledger/fabric-peer:3.1.5`, `hyperledger/fabric-tools:3.1.5`) with a
2-org deployment (`FoodAndCivilSuppliesMSP`, `GodownWarehouseMSP`) on the
`pdschannel` channel; the remaining 3 orgs (procurement, FPS, audit) are
documented as future peers — see `connection-profiles/` and
`validate-fabric-artifacts.mjs`.

## Bootstrap & lifecycle

- `bootstrap-fabric-full.sh` — full bootstrap: pulls Fabric 3.1.x tool images,
  generates crypto material, the channel artifact, and joins peers. End-to-end
  entry point for standing up the 2-org network.
- `bootstrap-network.sh` — documents the planned bootstrap sequence for the
  MVP (network topology + channel + chaincode).
- `generate-crypto.sh` — generates MSP material with `cryptogen` via the
  `fabric-tools:3.1.5` image.
- `configtxgen.sh` — generates the channel genesis / configtx block.
- `osnadmin-channel-join.sh` — joins the orderer to the channel via the
  osnadmin channel-participation API (Fabric 3.x pattern).
- `peer-channel-join.sh` — joins peers to `pdschannel`.
- `generate-connection-profiles.sh` — emits the per-org client connection
  profiles under `../connection-profiles/`.

## Chaincode

- `package-chaincode-bundle.sh` — produces a self-contained chaincode package
  (`dist/src/server.js` entrypoint) for Fabric external builders. Fixtures are
  excluded from the bundle (not needed on the Fabric runtime path).
- `deploy-chaincode.sh` — packages and deploys `pds-chaincode` to the channel
  using the `fabric-tools:3.1.5` image.
- `smoke-fabric.sh` — smoke-tests a running network (query/invoke sanity).

## Validation

- `validate-fabric-artifacts.mjs` — validates the scaffold artifacts
  (manifest, contract, compose, env, connection profiles) and aligns with the
  2-org deployment: deployed-org profiles must reference peers present in
  `docker-compose.fabric.yml`; future-org profiles are validated for shape and
  skipped from the deployed-peer check with a warning. Run with
  `node validate-fabric-artifacts.mjs`.

## Notes

- These scripts do not launch containers by themselves in CI (no Docker is
  available in the build environment). They are safe, non-destructive, and
  idempotent where possible.
- CouchDB credentials for the peer state database are sourced from
  environment variables in `../docker-compose.fabric.yml` — do not hardcode
  them in scripts.
