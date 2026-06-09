# Feature Specification: PDS-Chain MVP

## Common Rules

- All write operations must capture actor, timestamp, request ID, and resulting status.
- Ledger writes must return a `ledgerTxId`.
- Beneficiary-sensitive data must be represented by hashes or references.
- Raw Aadhaar number, raw biometric, OTP, mobile number, and full ration card number must not be written on-chain.
- Inactive stakeholders, inactive users, and unauthorized roles must be blocked.

## Stakeholder Registration

Purpose: Register participating PDS actors.

Primary actors: Department Admin, System Admin.

Inputs: `stakeholderId`, `stakeholderType`, `name`, `district`, `licenseNo`, `status`.

Preconditions: Admin is authenticated and authorized.

Main flow:

1. Admin submits stakeholder details.
2. System validates unique stakeholder ID and allowed type.
3. System stores stakeholder in PostgreSQL.
4. System writes stakeholder registration proof to Fabric.
5. System returns stakeholder record and `ledgerTxId`.

Error cases:

- Duplicate stakeholder ID.
- Invalid stakeholder type.
- Unauthorized actor.

Acceptance criteria:

- Registered active stakeholder can participate in permitted workflows.
- Inactive stakeholder is blocked from dispatch, receipt, allocation, and distribution.

## Commodity Lot Creation

Purpose: Create a trackable commodity lot.

Primary actors: Procurement User, Department Admin.

Inputs: `lotId`, `commodity`, `season`, `quantityKg`, `qualityGrade`, `source`, `currentOwner`, `currentLocation`.

Preconditions: Current owner is active and authorized.

Main flow:

1. User creates lot.
2. System validates positive quantity and active owner.
3. System stores lot and stock position.
4. System writes `CreateCommodityLot` ledger event.
5. System returns lot and `ledgerTxId`.

Error cases:

- Duplicate lot ID.
- Invalid quantity.
- Inactive owner.

Acceptance criteria:

- Lot appears in active lot list.
- Lot history includes creation event.

## Dispatch Stock

Purpose: Record stock movement from sender to receiver.

Primary actors: Procurement User, Miller, Godown Operator, Department Admin.

Inputs: `transferId`, `lotId`, `fromOrg`, `toOrg`, `dispatchedQtyKg`, `vehicleNo`, `dispatchTimestamp`.

Preconditions:

- Sender owns or controls sufficient stock.
- Receiver is active.
- Quantity is positive.

Main flow:

1. Sender creates dispatch.
2. System validates stock availability.
3. System marks quantity as in transit.
4. System writes `DispatchLot` ledger event.
5. System returns transfer with status `DISPATCHED`.

Error cases:

- Insufficient stock.
- Invalid receiver.
- Unauthorized sender.

Acceptance criteria:

- Sender available stock is reduced or reserved.
- Transfer appears as pending receipt.

## Receive Stock

Purpose: Confirm receipt and detect shortage.

Primary actors: Receiver, Department Admin.

Inputs: `transferId`, `receivedQtyKg`, `receiveTimestamp`, optional `remarks`.

Preconditions: Transfer exists and is in `DISPATCHED` status.

Main flow:

1. Receiver confirms received quantity.
2. System compares received and dispatched quantities.
3. System updates receiver stock by received quantity.
4. System writes `ReceiveLot` ledger event.
5. If shortage exists, system creates audit alert.

Error cases:

- Transfer not found.
- Transfer already received.
- Received quantity is negative or above allowed tolerance.
- Unauthorized receiver.

Acceptance criteria:

- Equal quantity results in `RECEIVED`.
- Lower quantity results in `RECEIVED_WITH_SHORTAGE` and an open audit alert.

## FPS Allocation

Purpose: Allocate stock from block godown to FPS.

Primary actors: Department Admin, Block Godown Operator.

Inputs: `allocationId`, `fpsId`, `commodity`, `allocatedQtyKg`, `month`, `sourceGodownId`.

Preconditions:

- FPS is active.
- Source godown has sufficient stock.

Main flow:

1. Admin creates FPS allocation.
2. System validates stock availability.
3. System reserves or dispatches allocated stock.
4. System writes `AllocateToFPS` ledger event.
5. System returns allocation status.

Error cases:

- Allocation exceeds stock.
- FPS inactive.
- Duplicate allocation ID.

Acceptance criteria:

- Allocation cannot exceed block godown stock.
- FPS stock is not distributable until FPS receipt is confirmed.

## FPS Receipt

Purpose: Confirm stock received by FPS.

Primary actors: FPS Dealer.

Inputs: `allocationId`, `receivedQtyKg`, `receiveTimestamp`.

Preconditions: Allocation exists and is pending receipt.

Main flow:

1. FPS dealer confirms received quantity.
2. System updates FPS stock.
3. System writes `RecordFPSReceipt` ledger event.
4. System creates shortage alert if received quantity is lower than allocated quantity.

Acceptance criteria:

- FPS stock increases by received quantity.
- Unconfirmed FPS receipt remains visible as pending.

## Mock Beneficiary Authentication

Purpose: Simulate authentication before distribution.

Primary actors: FPS Dealer, Beneficiary, Supervisor for exception.

Inputs: `beneficiaryRefHash`, `authMode`, `authResult`, `authTxnRefHash`.

Supported modes:

- `MOCK_OTP`.
- `SIMULATED_BIOMETRIC`.
- `SUPERVISOR_EXCEPTION`.

Main flow:

1. FPS dealer initiates authentication.
2. System simulates success or failure.
3. System records authentication transaction in PostgreSQL.
4. System writes only authentication hash/reference to ledger if needed for distribution proof.

Error cases:

- Beneficiary not found.
- Authentication failed.
- Supervisor exception missing approval.

Acceptance criteria:

- Failed authentication blocks distribution.
- Supervisor exception allows distribution only with auditable reason and approver.

## Entitlement Validation

Purpose: Ensure beneficiary is eligible and has monthly balance.

Primary actors: FPS Dealer.

Inputs: `rationCardHash`, `commodity`, `month`, `requestedQtyKg`.

Preconditions:

- Authentication is successful or exception-approved.
- Ration card is active in mock registry.

Main flow:

1. System checks ration card status.
2. System checks monthly entitlement.
3. System checks already lifted quantity.
4. System checks FPS stock.
5. System approves or rejects requested quantity.

Error cases:

- Inactive ration card.
- No entitlement for month.
- Duplicate claim.
- Requested quantity exceeds balance.
- FPS stock insufficient.

Acceptance criteria:

- Same beneficiary cannot lift the same monthly entitlement twice.
- Distribution cannot exceed available balance or FPS stock.

## Distribution Recording

Purpose: Record commodity delivery to beneficiary.

Primary actors: FPS Dealer.

Inputs: `distributionId`, `fpsId`, `rationCardHash`, `beneficiaryRefHash`, `commodity`, `deliveredKg`, `authMode`, `authResult`, `authTxnRefHash`, `dealerId`.

Preconditions:

- Authentication passed or exception-approved.
- Entitlement validation passed.
- FPS has sufficient stock.

Main flow:

1. FPS dealer confirms distribution.
2. System reduces FPS stock.
3. System updates monthly lifted quantity.
4. System stores distribution in PostgreSQL.
5. System writes `RecordDistribution` receipt to Fabric.
6. System returns citizen receipt and verification ID.

Acceptance criteria:

- Distribution receipt includes `distributionId` and `ledgerTxId`.
- Citizen receipt masks beneficiary identity.
- Distribution cannot be edited without creating a mismatch during audit.

## QR And Trace Verification

Purpose: Verify lot or distribution history.

Primary actors: Auditor, Department Admin, FPS Dealer, Beneficiary.

Inputs: `lotId` or `distributionId`.

Main flow:

1. User scans QR or enters verification ID.
2. System fetches operational record.
3. System fetches ledger history or transaction proof.
4. System returns trace, verification status, and tamper status.

Acceptance criteria:

- Valid lot returns full custody chain.
- Valid distribution returns masked receipt and ledger verification status.
- Mismatched DB and ledger data returns tamper warning.

## Audit Alert Creation And Resolution

Purpose: Detect and manage exceptions.

Primary actors: Audit Engine, Auditor, Department Admin.

Alert types:

- `DB_LEDGER_MISMATCH`.
- `SHORT_RECEIPT`.
- `FPS_OVER_DISTRIBUTION`.
- `DUPLICATE_CLAIM`.
- `IN_TRANSIT_DELAY`.
- `UNAUTHORIZED_TRANSACTION`.
- `FPS_CLOSING_STOCK_MISMATCH`.
- `DISTRIBUTION_TAMPERED`.

Main flow:

1. Audit engine evaluates rules.
2. System creates alert with risk level and evidence.
3. Auditor reviews alert.
4. Authorized user resolves alert with remarks.
5. Resolution is written to ledger.

Acceptance criteria:

- Alerts have status `OPEN`, `IN_REVIEW`, or `RESOLVED`.
- High-risk alerts appear on dashboard.
- Resolution requires authorized actor and remarks.
