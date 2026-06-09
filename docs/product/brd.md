# Business Requirements Document: PDS-Chain

## Executive Summary

PDS-Chain is a blockchain-enabled trust and audit layer for the Public Distribution System. It creates an immutable, privacy-preserving, and verifiable record of high-risk PDS events across commodity procurement, milling, godown movement, Fair Price Shop allocation, beneficiary authentication, entitlement validation, and ration delivery.

The 2-week MVP demonstrates a complete rice distribution journey using mock data and simulated integrations. The platform is not intended to replace SMART-PDS, state PDS systems, or ePoS devices. It provides an independent audit trail and reconciliation layer that can later integrate with those systems.

## Business Problem

The Public Distribution System handles large-scale movement and distribution of subsidized food grains and essential commodities. Existing operational challenges include:

- Leakage and diversion during transport or storage.
- Stock manipulation at godown or FPS level.
- Duplicate or excess beneficiary claims.
- Weak cross-organization auditability.
- Paper or mutable digital records that can be altered after the fact.
- Delayed detection of shortages and mismatches.
- Privacy risk if beneficiary identity data is copied into multiple systems.

The core requirement is to enhance transparency, accountability, and efficiency by creating an immutable shared transaction record from procurement to delivery.

## Business Objectives

- Improve traceability of commodity movement from procurement to beneficiary delivery.
- Reduce opportunities for leakage, diversion, duplicate claims, and stock manipulation.
- Provide a tamper-evident audit trail for critical PDS transactions.
- Enable faster detection of shortages, delayed receipts, over-distribution, and DB-ledger mismatches.
- Preserve beneficiary privacy by keeping sensitive identity and authentication data off-chain.
- Provide a demo-ready platform that can evolve toward district/state pilot integration.

## Stakeholders

- Food and Civil Supplies Department.
- Procurement centre.
- Miller.
- Transporter.
- State godown.
- Block godown.
- Fair Price Shop dealer.
- Beneficiary.
- Inspector or auditor.
- System administrator.
- Future integration owners for SMART-PDS, state PDS, ePoS, and authentication systems.

## Proposed Solution

PDS-Chain will maintain:

- Operational state in PostgreSQL for current stock, workflows, users, dashboard queries, and mock beneficiary records.
- Immutable transaction proofs and custody history in Hyperledger Fabric.
- Rule-based audit alerts for mismatches, duplicate claims, shortages, delayed receipt, unauthorized actions, and tampering.
- API-first integration adapters for demo data, CSV imports, batch feeds, and future SMART-PDS/state system events.

## MVP Scope

The MVP demonstrates one complete commodity journey:

```text
Procurement Centre -> Miller -> State Godown -> Block Godown -> FPS -> Beneficiary -> Audit
```

MVP example:

- Commodity: Rice.
- Procurement lot: `LOT-RICE-2026-001`.
- Procured quantity: `10,000 kg`.
- Processed quantity: `9,700 kg`.
- FPS allocation: `1,000 kg`.
- Beneficiary entitlement: `25 kg`.
- Delivered quantity: `25 kg`.

MVP business capabilities:

- Register participating stakeholders.
- Create and track commodity lots.
- Dispatch and receive stock with dual confirmation.
- Detect shortage between dispatched and received quantity.
- Allocate stock to FPS.
- Simulate beneficiary authentication.
- Validate monthly entitlement.
- Prevent duplicate monthly lifting.
- Record privacy-preserving distribution receipt on blockchain.
- Generate verification ID or QR trace.
- Show command-centre audit dashboard.

## Out Of Scope For MVP

- Real Aadhaar/UIDAI integration.
- Real biometric capture or verification.
- Real SMART-PDS or ePoS integration.
- PFMS/DBT integration.
- IoT-GPS hardware integration.
- AI/ML model training.
- Offline Android FPS application.
- Production security certification.
- National-scale deployment.

## Success Metrics

- The full commodity journey can be demonstrated with seeded data.
- Every critical transaction has a blockchain transaction reference.
- Duplicate monthly beneficiary claim is blocked.
- Short receipt creates an audit alert.
- DB-ledger mismatch creates an audit alert.
- FPS cannot distribute more stock than available.
- QR/verification ID can show lot or distribution trace.
- No raw beneficiary PII or authentication secret is written on-chain.

## Risks And Mitigations

- Integration unavailable: use mock APIs, CSV imports, and adapter abstractions for MVP.
- Privacy concerns: write only hashes and references to blockchain.
- Blockchain complexity: keep MVP chaincode focused on core proofs and custody events.
- Overclaiming outcomes: separate MVP demonstration from pilot and production roadmap.
- Authentication failure scenarios: include a simulated supervisor-approved exception path with audit logging.

## Expected Benefits

- Shared source of truth for high-risk PDS events.
- Tamper-evident audit trail across multiple organizations.
- Faster detection of leakage and stock mismatch.
- Better accountability for dispatch and receipt events.
- Privacy-preserving beneficiary delivery proof.
- Clear path toward district/state pilot integration.
