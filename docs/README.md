# PDS-Chain Documentation

This documentation pack defines the product and technical baseline for a 2-week MVP of **PDS-Chain**, a blockchain-enabled trust, traceability, audit, and authenticated-delivery layer for the Public Distribution System.

PDS-Chain is designed to complement SMART-PDS, state PDS systems, ePoS systems, procurement platforms, godown systems, and command-centre dashboards. It does not replace those systems.

## Source Inputs

- [CDAC problem statement](requirements/cdac-problem-statement.md)
- [Expert solution proposal](product/solution-proposal-gpt.md)
- [Reference presentation](reference/PDS_Blockchain_GrainChain_India.pptx.pdf)

The problem statement and solution proposal are treated as the primary inputs. The reference presentation is used as vision material; national-scale claims and advanced integrations are documented as roadmap items unless explicitly included in the MVP.

## Reading Order

1. [Business Requirements Document](product/brd.md)
2. [Product Requirements Document](product/prd.md)
3. [Feature Specification](product/feature-spec.md)
4. [Technical Architecture](technical/architecture.md)
5. [Technical Design](technical/design.md)
6. [Technical Stack](technical/technical-stack.md)
7. [Mock Data and Fixtures](implementation/mock-data.md) — for developers editing demo/seed data

## MVP Positioning

The MVP demonstrates one complete commodity journey:

```text
Procurement Centre
  -> Miller
  -> State Godown
  -> Block Godown
  -> Fair Price Shop
  -> Beneficiary Authentication
  -> Entitlement Validation
  -> Commodity Delivery
  -> Blockchain Receipt
  -> Audit Trail
```

The MVP uses mock data and simulated integrations. Real Aadhaar/UIDAI, SMART-PDS, ePoS, PFMS/DBT, IoT-GPS, AI/ML, and offline mobile integrations are future roadmap capabilities.

### Mock data and live switching

Canonical mock and seed data lives in the repository `mock/` folder and is loaded through `@pds/fixtures`. The web UI supports explicit data modes via `VITE_DATA_SOURCE` (`api`, `mock`, or `auto`).

See [Mock data and fixtures](implementation/mock-data.md) for layout, regeneration commands, and switching guidance.

## Core Privacy Rule

Sensitive beneficiary data must remain off-chain. Aadhaar numbers, biometric templates, raw fingerprint/iris/face data, OTPs, mobile numbers, and full ration card numbers must not be written to the blockchain. Ledger records should contain only privacy-preserving hashes, references, transaction IDs, and audit proofs.
