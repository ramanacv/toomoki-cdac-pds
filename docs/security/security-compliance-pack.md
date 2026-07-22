# Security and Compliance Preparation Pack

This document is technical preparation for a controlled demonstration and prospective district pilot. It is not legal advice, certification, an Aadhaar approval, a VAPT report or government authorization.

## Threat model

| Threat | Current controls | Residual risk / next action |
|---|---|---|
| API impersonation | Keycloak RS256 validation against pinned issuer, API audience, expiry/not-before and JWKS; bearer header only | Protect IAM/TLS and validate browser/service flows in the deployed environment. |
| Role escalation | Canonical realm roles plus explicit controller policies; `401` and `403` are distinct; admin/metrics/reset roles are independent | Enforce `pds_org_id` and `pds_stakeholder_id` against every mutation resource. |
| Token theft | Authorization Code + PKCE; five-minute access tokens; session-storage web state; explicit logout; no auth cookie | Session storage remains readable by injected script; complete CSP review, dependency remediation and penetration testing. |
| Proof tampering | SHA-256 canonical payload hash, immutable Fabric record, deterministic chaincode and conflicting replay rejection | Key/certificate compromise and peer collusion require managed enrolment, revocation and HSM-backed keys. |
| Replay | Event/idempotency uniqueness; identical proof replay succeeds, conflicting reuse fails | Extend idempotency enforcement consistently to every API command and adapter. |
| Sensitive-data leakage | Hash/opaque references; recursive normalized proof denylist; no token/error body in request logs; identifier-free metric labels | Complete field-level data-flow review, retention policy and log sink inspection. |
| Malicious peer | Two-organization endorsement for proof writes and deterministic execution | Current two-org consortium is limited; add required organizations and validate policies against every peer. |
| Outbox failure | PostgreSQL durable states, `SKIP LOCKED`, bounded retry, stale-claim recovery, dead letter and visible proof status | Embedded worker shares API fate; extract it and add paging/alerting/runbooks. |
| Administrator misuse | Separate `platform-admin` and `demo-reset`; reset also requires `PDS_ALLOW_RESET=true`; security decision logs | Centralize immutable admin audit export, dual control for destructive pilot actions and periodic access review. |

## Data inventory

| Location | Data | Explicit exclusions / handling |
|---|---|---|
| Fabric | Event/operation IDs, entity references, actor subject/role/MSP, payload hash, schema version, API business timestamp and privacy-validated proof payload | No Aadhaar number/image, biometric, OTP, mobile/phone, name/address or full ration-card value. |
| PostgreSQL | Operational stakeholder, lot, movement, entitlement, hashed beneficiary/card references, simulated-auth result, distribution, alert, event and outbox state | Controlled demo dataset; row-scoped retention/deletion and pilot data classification remain required. |
| Logs | Request ID, subject, roles, organization claims, normalized route, decision, status, duration and safe error category | No bearer token, OTP, biometric, raw beneficiary identity or unmasked card value. |
| Metrics | Normalized route, method, plane, status class, operation/result and aggregate proof state/latency | No beneficiary, ration-card, transaction, event, lot or stakeholder identifier labels. |
| Transient authentication | Browser OIDC code/verifier and access/refresh session state; simulated authentication inputs at API boundary | Browser state is session-scoped. Real Aadhaar PID/OTP/biometric capture is not implemented and must not be introduced without formal approval and compliant architecture. |

## Control matrix

| Domain | State | Evidence / gap |
|---|---|---|
| Authentication | Implemented for competition | Keycloak OIDC, PKCE and client credentials; future federation to approved government IAM. |
| Authorization | Partial | Least-privilege roles are implemented; organization/resource scope is planned. |
| Encryption | Partial | Cryptographic token/proof validation exists; production TLS, database/storage encryption and key ownership need deployment evidence. |
| Privacy | Partial | Proof denylist and hashes are implemented; DPIA, retention and approved pilot data mapping remain. |
| Key management | Planned | Local Fabric demo crypto is not pilot key management; vault/HSM, enrolment, rotation and revocation are required. |
| Audit logging | Partial | Structured access decisions and Fabric proofs exist; central tamper-evident retention/export and review workflow remain. |
| Retention/deletion | Planned | Define record classes, legal basis, retention schedule, deletion/archival and litigation/audit hold procedures with the department. |
| Incident response | Planned | Create contacts, severity model, containment/recovery, breach assessment/notification and evidence-preservation runbooks. |
| Assurance | Partial | Automated unit/lint/build/security inventory; independent VAPT, ZAP, container scanning and pilot acceptance remain. |

## DPDP Act and Rules alignment

The Digital Personal Data Protection Act, 2023 is published on [India Code](https://www.indiacode.nic.in/indiacode/handle/123456789/22037). India Code records phased commencement from 13 November 2025, with a number of core processing provisions scheduled eighteen months later; the implementation team must re-check commencement immediately before a pilot rather than assuming every provision has the same effective date. MeitY published the [Digital Personal Data Protection Rules, 2025 and enforcement timeline](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa).

Technical preparation therefore includes purpose and data-flow documentation, minimum necessary fields, role/organization controls, accuracy and correction workflows, security safeguards, processor terms, retention/erasure configuration, incident response, notice/consent or other lawful-use analysis, data-principal request handling and child-data assessment. The State/UT department and qualified counsel must determine controller/fiduciary roles, lawful purpose, applicable exemptions, notices, retention and notification duties for the selected pilot.

## Aadhaar alignment

ViksitPDS currently simulates authentication and is not an AUA/KUA, Aadhaar authentication client or approved government integration. UIDAI states that Aadhaar numbers should not become domain-specific identifiers and that biometric/OTP authentication data must not be stored permanently; PID must be encrypted at capture and not sent in clear text ([UIDAI requesting-entity requirements](https://www.uidai.gov.in/en/ecosystem/authentication-ecosystem/authentication-requesting-agency.html), [UIDAI authentication-device requirements](https://uidai.gov.in/en/ecosystem/authentication-devices-documents/)). Current regulations and amendments must be checked through [UIDAI’s updated regulations](https://uidai.gov.in/en/about-uidai/legal-framework/updated-regulation) and the [Good Governance Rules material](https://www.uidai.gov.in/en/about-uidai/legal-framework/updated-rules-en/16332-aadhaar-authentication-for-good-governance-social-welfare-innovation-knowledge-rules-2020.html).

Consequently, no real Aadhaar number, PID, biometric or OTP may enter this system, its logs, PostgreSQL or Fabric during the competition or an unapproved pilot. Any future integration requires the appropriate government/UIDAI route, requesting-entity arrangements, certified devices and security controls, exception handling that avoids denial due to technology limitations, formal data approval and independent compliance review.
