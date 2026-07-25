# Transport leg evidence

## Model

The transport leg is the dual-confirm movement record. There is no separate Transport entity.

| Leg | Record | Shipped | Sent at | Received | Received at | Transporter |
|---|---|---|---|---|---|---|
| Stage-I / Stage-II godown hops | `TransferOrder` | `dispatchedQtyKg` | `dispatchTimestamp` | `receivedQtyKg` | `receiveTimestamp` | `transporterId` + snapshotted `transporterName`, `vehicleNo` |
| Block → FPS doorstep | `FPSAllocation` | `allocatedQtyKg` | `dispatchTimestamp` | `receivedQtyKg` | `receiveTimestamp` | `transporterId` + snapshotted `transporterName`, `vehicleNo` |

In-transit signal:

- Godown hop: `TransferStatus.DISPATCHED`
- Doorstep: allocation `status === 'ALLOCATED'`

Shortage:

- Godown: `dispatchedQtyKg - receivedQtyKg` → `RECEIVED_WITH_SHORTAGE` + `SHORT_RECEIPT` alert
- FPS: `allocatedQtyKg - receivedQtyKg` → `RECEIVED_WITH_SHORTAGE` + alert

## Authorization split

- **DSO** RO-lites Stage-II State Godown → Block Godown.
- **BSO** allotment-authorizes Block Godown → FPS and binds doorstep transporter evidence.
- **TRANSPORTER** remains a passive evidence party (no stock-holding workflow login).

## Server rules

- `transporterId` is required on dispatch and FPS allotment.
- Engine resolves an active `StakeholderType.TRANSPORTER` and snapshots `transporterName` from `stakeholder.name` at ship time.
- Client-supplied transporter names are not trusted; name always comes from the stakeholder directory.

## Out of scope

- GPS / VLTS / geofencing
- Transporter login / custody UI
- Explicit in-transit stock pool separate from `DISPATCHED` / `ALLOCATED`

## Acceptance checks

1. Dispatch without `transporterId` is rejected.
2. Non-transporter or inactive `transporterId` is rejected.
3. Successful dispatch/allotment stores matching `transporterName`.
4. Transfers and Allocation panels show transporter ID + name, vehicle, shipped/received qty, both timestamps, and shortage.
5. Seed fixtures include transporter evidence on Stage-I, Stage-II, and FPS allotments.
