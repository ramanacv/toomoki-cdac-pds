# Historical Jury Score Snapshot

> This 26/50 estimate predates the current evaluation and is retained only as
> historical evidence. Its editor-local scorecard is not part of this
> repository. See [current evaluation](gpt56sol-current-evaluation.md).

### Jury scorecard

| Criterion | Score | Honest cut |
|---|---:|---|
| i. Technical Proof & Implementation Viability | **11/15** | Real 2-org Fabric + NestJS + React + proofs + outbox + workflows. Cut for 2-of-5 orgs, admin `/overview` Promise bug, Fabric **3.1 docs vs 2.5.15 compose**, hardening phases 2–5 still blocked |
| ii. Security, Performance & Compliance | **5/10** | Strong privacy/hash/MSP design. No measured latency/throughput, no VAPT, stub/dev tokens, no HSM/OIDC |
| iii. Stakeholder Alignment & Scalability | **5/10** | Strong PDS modelling + “complements SMART-PDS” story. No gov meeting evidence in-repo; mocked integrations; single-replica demo |
| iv. Commercial viability | **2/10** | Problem/buyer plausible; almost no commercial package in the repo |
| v. Team Capabilities | **3/5** | Engineering quality is visible; team roster/presentation cannot be scored from code alone |
| **Total** | **26/50** | |

### What is actually demonstrable (§6)

- **Fully demoable:** Immutable ledger, smart contracts (PoC), audit trail, data integrity  
- **Partial:** Digital identity, RBAC, API integration (internal REST yes; SMART-PDS/ePoS/UIDAI **mocked**)

### Biggest honesty flags

1. Controlled-demo persistence waiver — not crash-safe / not multi-replica  
2. No published performance or business ROI numbers  
3. No government interaction evidence in the repository  
4. Commercial section is nearly empty for a 10-mark criterion  

If you have off-repo gov meetings, a pilot commercial one-pager, and team bios, the realistic upside after packaging (not new features) is roughly **32–36/50**. Overclaiming production readiness would hurt more than the current candid gaps.
