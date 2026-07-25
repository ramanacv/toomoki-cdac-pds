# Beneficiary Eligibility Integrity and Review Simulator

## Purpose

This feature is a panel-facing innovation for identifying potentially deceased,
inactive, duplicate, migrated, or economically ineligible PDS beneficiaries. It
should be presented as a privacy-preserving **Eligibility Integrity and Review
Service**, not as an automated “ghost beneficiary deletion” engine.

The service correlates simulated signals, applies transparent state-configured
rules, routes uncertain cases through verification and appeal, and records the
final authorized RCMS decision. It does not replace SMART-PDS/RCMS, AePDS/ePoS,
or the State's legal eligibility process.

## Policy boundary

NFSA beneficiary identification and exclusion criteria are determined by the
States/UTs. The Department of Food and Public Distribution describes the
process as continuous: eligible households may be added, while fake, duplicate,
dead, migrated, or otherwise ineligible records may be removed. State policy
must therefore define the actual thresholds for income, GST/turnover,
employment, landholding, household composition, and inactivity.

The demo must label its thresholds as fictional simulation rules unless a
specific State policy has been supplied. A GST registration, tax filing,
employment record, landholding match, or lack of local lifting is a signal—not
by itself proof that a household should lose food security benefits.

Official references:

- [DFPD: Implementation of NFSA](https://dfpd.gov.in/implementation-of-nfsa/en)
- [NFSA: State responsibility for identifying eligible households](https://nfsa.gov.in/portal/Coverage_Entitlements_NFSA_AA)
- [DFPD: ONORC FAQ](https://dfpd.gov.in/faqs/en)
- [TPDS Control Order, 2015: appeal provision](https://upload.indiacode.nic.in/showfile?actid=AC_CEN_21_28_00003_195510_1517807320439&filename=41-gsr_213e_20-3-2015.pdf&type=order)

## Core lifecycle

```text
External risk signal
  -> deterministic eligibility rule
  -> review case
  -> notice / field verification
  -> authorized RCMS decision
  -> entitlement suspension or recalculation
  -> appeal / reinstatement
  -> privacy-safe audit proof
```

The system should not cancel a card merely because a signal was received.
`UNDER_REVIEW` should normally leave entitlement available. Distribution should
be blocked only after an authorized and effective RCMS decision, or under a
separately authorized temporary-hold policy.

## Simulated signals

| Signal | Meaning | Initial outcome |
| --- | --- | --- |
| `DEATH_REGISTRY_MATCH` | A member may be deceased | Member verification case |
| `HOUSEHOLD_DECEASED` | All recorded members appear deceased | High-priority field review |
| `NO_LIFT_ACTIVITY` | No observed distribution for a configured period | Review; check portability first |
| `DUPLICATE_HOUSEHOLD_MATCH` | A person may occur on multiple cards | Identity-resolution review |
| `GST_REGISTRATION_MATCH` | A member has a GST registration | Economic review, not automatic cancellation |
| `INCOME_TAX_THRESHOLD_MATCH` | Verified income condition exceeds policy | Potential disqualification |
| `LANDHOLDING_THRESHOLD_MATCH` | Land records exceed policy threshold | Potential disqualification |
| `FORMAL_EMPLOYMENT_MATCH` | Employment conflicts with policy | Potential disqualification |
| `MIGRATION_SIGNAL` | Household may have permanently moved | Transfer/update review |
| `PORTABILITY_ACTIVITY_FOUND` | Household lifted through ONORC elsewhere | Clear inactivity suspicion |
| `SOURCE_DATA_CONFLICT` | Sources disagree or are stale | Manual reconciliation |

Economic rules should use the criterion actually specified by the State. GST
registration alone is a weak indicator; turnover, income, employment category,
or corroborating signals may be required.

## Member-level versus household-level decisions

- Death of one member should normally remove that member and recalculate the
  household entitlement.
- Death of the head of household should initiate succession/member update, not
  automatic household cancellation.
- Whole-household cancellation requires evidence that the entire household is
  deceased or ineligible.
- Migration may require FPS/state transfer or record update rather than
  deletion.
- Inactivity must include portability and household-level lifting checks before
  a case is escalated.

## Case and decision states

Case states:

```text
OPEN
-> AWAITING_DATA
-> AWAITING_FIELD_VERIFICATION
-> NOTICE_ISSUED
-> REVIEW_READY
-> RECOMMENDED_ELIGIBLE | RECOMMENDED_INELIGIBLE
-> DECIDED
-> APPEALED
-> REINSTATED | CLOSED
```

Possible decisions:

- `NO_CHANGE`
- `MEMBER_REMOVED`
- `HOUSEHOLD_SIZE_RECALCULATED`
- `TRANSFER_REQUIRED`
- `TEMPORARILY_SUSPENDED`
- `CARD_CANCELLED`
- `REINSTATED`

Every decision should retain the policy version, source evidence hashes,
reviewer, effective date, reason, notice status, and appeal deadline.

## Proposed service boundary

```text
Mock death/tax/GST/land/payroll/ePoS sources
                    |
                    v
       Eligibility Integrity Service
                    |
                    v
        Officer review and decision
                    |
                    v
     Mock SMART-PDS/RCMS decision event
                    |
                    v
ViksitPDS entitlement/distribution enforcement
                    |
                    v
        Asynchronous Fabric proof
```

SMART-PDS/RCMS remains authoritative for the approved ration-card and
entitlement state. PostgreSQL stores local cases, correlations, decisions, and
proof-delivery status. Fabric stores only an immutable proof of the approved
decision; it must not contain raw beneficiary identity or external tax,
employment, land, or death records.

This fits the existing repository boundaries:

- [Architecture authority boundaries](../technical/architecture.md) already
  identify SMART-PDS/RCMS as authoritative for master and entitlement
  references.
- `RationCardStatus` already supports `ACTIVE`, `SUSPENDED`, and `CANCELLED` in
  [shared types](../../packages/shared-types/src/index.ts).
- Distribution already validates ration-card and entitlement state before
  issuing stock.
- Existing source-event ingestion provides idempotency, provenance,
  conflicting-replay detection, quarantine, and privacy validation.
- Existing Fabric proof validation rejects Aadhaar, phone, address, OTP,
  biometric, full ration-card, and unmasked-name fields.

## Suggested API surface

```text
POST /eligibility/v1/signals
POST /eligibility/v1/evaluations
GET  /eligibility/v1/cases
GET  /eligibility/v1/cases/:caseId
POST /eligibility/v1/cases/:caseId/verification
POST /eligibility/v1/cases/:caseId/recommendation
POST /eligibility/v1/cases/:caseId/decision
POST /eligibility/v1/cases/:caseId/appeals
POST /eligibility/v1/cases/:caseId/reinstate
GET  /eligibility/v1/cases/:caseId/explanation
```

Example privacy-safe signal:

```json
{
  "signalId": "SIG-ITR-2026-001",
  "sourceSystem": "MOCK_INCOME_TAX",
  "subjectRefHash": "opaque-household-ref-hash",
  "rationCardHash": "demo-ration-card-hash",
  "signalType": "INCOME_TAX_THRESHOLD_MATCH",
  "observedAt": "2026-07-23T10:00:00Z",
  "policyFacts": {
    "thresholdBand": "ABOVE_DEMO_POLICY_LIMIT",
    "assessmentYear": "2025-26"
  },
  "sourceAttestationHash": "sha256-value",
  "schemaVersion": "1.0"
}
```

The service must not accept PAN, Aadhaar, GSTIN, tax returns, names, addresses,
exact parcel details, employer details, phone numbers, or raw ration-card
values. Production matching would require a department-approved tokenization or
HMAC-based identity-resolution service; ordinary unsalted hashes of predictable
identifiers are not sufficient.

## Versioned policy-as-code

```json
{
  "policyId": "MH-PANEL-DEMO-2026-V1",
  "jurisdiction": "DEMO_MAHARASHTRA",
  "effectiveFrom": "2026-07-01",
  "simulationOnly": true,
  "rules": [
    {
      "ruleId": "ECON-ITR-01",
      "signalType": "INCOME_TAX_THRESHOLD_MATCH",
      "action": "OPEN_REVIEW",
      "requiredCorroboration": 1
    },
    {
      "ruleId": "INACTIVE-12M-01",
      "signalType": "NO_LIFT_ACTIVITY",
      "action": "CHECK_PORTABILITY_AND_FIELD_VERIFY"
    }
  ]
}
```

Each explanation shown to an officer should state which rule fired, the policy
version, source freshness, match confidence, corroborating/contradicting
signals, required verification steps, and why automatic cancellation did not
occur. Deterministic rules should make the legal/review reason explicit. ML may
prioritize cases, but should not be the reason for exclusion.

## Panel demonstration storyline

1. **Confirmed deceased member:** a death signal is verified; the member is
   removed and the household entitlement recalculated while the family card
   remains active.
2. **Inactive migrant household:** local inactivity opens a case; an ONORC lift
   elsewhere clears it without benefit interruption.
3. **Economic ineligibility:** tax plus GST/turnover signals satisfy the
   fictional policy; an officer approves the RCMS cancellation and a later
   entitlement validation is blocked.
4. **Stale land record:** verification finds the ownership changed before the
   policy date; the case closes as a false positive.
5. **Appeal and reinstatement:** corrected evidence reverses a cancellation and
   restores entitlement with a complete decision history.

The migrant and reinstatement cases are essential: they demonstrate leakage
reduction without turning stale data or technical failures into food denial.

## Dashboard and success measures

Show signals by source, cases by reason and age, field-verification backlog,
recommended versus authorized decisions, member removals versus household
cancellations, stale sources, appeals, reversals, and RCMS/Fabric status
separately.

Do not use “beneficiaries removed” as the primary success metric. Better measures
are confirmed-ineligible rate, false-positive rate, appeal-reversal rate, time
to verification, no-unauthorized-denial rate, and eligible households included
after verified capacity is released.

## Delivery increments

1. Add shared contracts, fictional policy fixtures, mock source fixtures, rule
   evaluation, case APIs, and privacy/idempotency tests.
2. Add the department review console with notice, verification, decision,
   appeal, and explanation views.
3. Add mock RCMS decision ingestion, entitlement enforcement, asynchronous
   proof, and the five-case panel script.

## Panel positioning

> ViksitPDS does not decide who deserves food. It correlates authoritative
> signals, applies transparent State-configured rules, routes uncertain cases
> through human verification and appeal, and creates a tamper-evident record of
> the final authorized decision.
