# Live Fabric Demo Evidence

Evidence captured on **2026-07-22** from the local controlled-demo environment. Refresh this file immediately before a jury demonstration; it is not a production or availability certificate.

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

The configured submitting MSP is `FoodAndCivilSuppliesMSP`. The intended channel is `pdschannel`, the intended chaincode is `pds-chaincode`, and the maintained deployment policy requires endorsement by `FoodAndCivilSuppliesMSP` and `GodownWarehouseMSP`.

## Current live-verification result

`peer channel list` on `peer0.food.example.com` returned no joined channels. Consequently, `peer lifecycle chaincode querycommitted --channelID pdschannel --name pds-chaincode` returned `channel 'pdschannel' not found`.

Therefore the following are **not currently live-verified**:

- channel membership on both peers;
- committed chaincode version and sequence;
- committed endorsement policy;
- two-peer query/endorsement behavior;
- authenticated lifecycle and proof completion.

The containers being healthy is not sufficient evidence of a working Fabric demonstration. The destructive full bootstrap was not run because no reset authorization was given. Before the jury run, explicitly authorize the reset, bootstrap the network, query the committed definition from both peers, run the two-peer regression, and confirm that every lifecycle proof is `COMMITTED` with a Fabric transaction ID.
