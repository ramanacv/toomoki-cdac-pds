# Fabric Network Scaffold

This folder defines the intended Hyperledger Fabric topology for the PDS-Chain MVP.

It is a scaffold, not a live consortium deployment. The goal is to make the network shape explicit so the runtime can later swap from the local envelope adapter to real Fabric connectivity without changing product logic.

## Topology

- Org1: Food and Civil Supplies Department.
- Org2: Procurement/Miller.
- Org3: Godown/Warehouse.
- Org4: Fair Price Shop.
- Org5: Auditor/Inspection Authority.

## Planned Components

- Single PDS channel for the MVP.
- One peer per organization.
- One orderer for demo bootstrap.
- Fabric CA for identities.
- CouchDB world state for each peer.
- TypeScript chaincode package at `blockchain/chaincode/pds-chaincode`.

## Local Bootstrap Artifacts

- `network-manifest.json` captures the intended network topology.
- `fabric-contract.json` captures the intended chaincode client contract.
- `docker-compose.fabric.yml` captures the intended local Fabric deployment topology.
- `fabric-env.example` captures the expected runtime env contract.
- `connection-profiles/*.json` define client connectivity targets.
- `scripts/bootstrap-network.sh` is a demo bootstrap entrypoint.
- `scripts/generate-connection-profiles.sh` regenerates the client profiles.
- The API-side route-to-operation plan is kept in sync through tests, not by a live Fabric deployment.

## Status

The files in this directory are used as contract artifacts for development and testing. They intentionally avoid hard dependency on a live Fabric installation.
