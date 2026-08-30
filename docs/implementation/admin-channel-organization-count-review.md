# Admin channel organization count review

## Scope

This review checks the Platform Admin **Network & health → Channel
organizations** panel, which currently displays five organizations.

## Finding

The five displayed entries are not the membership of the currently deployed
`pdschannel`. The maintained local Fabric demo deploys two organizations:

1. `FoodAndCivilSuppliesMSP`
2. `GodownWarehouseMSP`

The Procurement, Fair Price Shop, and Audit MSPs shown by the console are
documented future consortium organizations. They do not currently have
deployed peers joined to the channel.

## Cause

`AdminService.buildStakeholderSummary()` populates `fabricOrgMapping` by loading
every organization from
`blockchain/fabric-network/network-manifest.json`. That manifest intentionally
describes the planned five-organization consortium.

`AdminNetworkPage` renders `overview.stakeholders.fabricOrgMapping` under the
title **Channel organizations**. It does not filter the manifest to deployed
organizations or query the live channel configuration. It also renders this
planned mapping independently of whether the API is in demo or Fabric ledger
mode.

The source documentation already distinguishes the two concepts:

- `blockchain/fabric-network/README.md`: five organizations documented, two
  deployed in the demo;
- `blockchain/fabric-network/scripts/README.md`: Procurement, FPS, and Audit
  remain future peers;
- `docs/implementation/production-readiness-todos.md`: deploying those three
  organizations remains deferred work.

## Risk

Calling all five entries “Channel organizations” can cause operators to
incorrectly conclude that:

- five MSPs are members of `pdschannel`;
- five peers participate in endorsement or discovery;
- the planned five-organization governance model has been deployed.

None of those conclusions is supported by the current two-peer network.

## Implemented correction

The admin response and UI now separate:

- **Deployed channel organizations** — two, derived from maintained deployed
  topology metadata;
- **Planned consortium organizations** — three future organizations, alongside
  the two deployed members in the five-organization design manifest.

Every organization in `network-manifest.json` now declares
`deploymentStatus: DEPLOYED | PLANNED`. The admin API returns that status, the
UI renders separate **2 deployed** and **3 planned** panels, and
`validate-fabric-artifacts.mjs` fails if the deployed MSP list diverges from the
maintained two-organization topology.

A live channel-configuration query remains a future improvement. The displayed
deployed count currently represents the maintained deployment manifest, not a
runtime discovery result.
