# Fabric Network (2-org demo)

This folder defines the Hyperledger Fabric topology for the PDS-Chain MVP and ships a **Fabric 3.1.x** two-organization demo (Food Department + Godown).

## Topology

- **Orderer:** single Raft orderer with channel participation (no system channel)
- **Org1:** Food and Civil Supplies (`peer0.food.example.com`)
- **Org2:** Godown/Warehouse (`peer0.godown.example.com`)
- **Channel:** `pdschannel`
- **Chaincode:** `pds-chaincode` (TypeScript, `blockchain/chaincode/pds-chaincode`)

## Bootstrap

```bash
./scripts/bootstrap-network.sh
```

Individual steps:

1. `generate-crypto.sh` — dev crypto (`cryptogen` when available)
2. `configtxgen.sh` — channel block for `pdschannel`
3. `generate-connection-profiles.sh` — TLS-aware client profiles
4. Start stack: `docker compose --profile fabric up` from repo root
5. `osnadmin-channel-join.sh` — orderer joins channel
6. `peer-channel-join.sh` — both peers join
7. `deploy-chaincode.sh` — package/install/approve/commit lifecycle
8. `smoke-fabric.sh` — API smoke against running gateway

## API integration

Set `PDS_LEDGER_MODE=fabric` on the NestJS API. The API uses `@hyperledger/fabric-gateway` to submit and evaluate transactions on `pds-chaincode` while continuing to persist operational snapshots in PostgreSQL.

Legacy `PDS_LEDGER_BACKEND=fabric-gateway` is mapped to fabric mode. Demo mode (`PDS_LEDGER_MODE=demo`, default) keeps the in-process `PdsChaincodeInvoker` path.

## Artifacts

- `network-manifest.json` — intended consortium layout (5 orgs documented; 2 orgs deployed in demo)
- `fabric-contract.json` — chaincode operation manifest
- `docker-compose.fabric.yml` — Fabric 3.x services (orderer, peers, CouchDB, CA)
- `connection-profiles/*.json` — client connectivity targets
- `fabric-env.example` — gateway env contract

## Status

The Docker stack and bootstrap scripts are implemented for local demo. Full lifecycle deployment requires Fabric CLI binaries (`peer`, `osnadmin`, `configtxgen`) and enrolled admin identities on your host.
