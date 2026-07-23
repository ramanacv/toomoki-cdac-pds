# J&K and Maharashtra ePoS/SMART-PDS reference analysis

**Prepared:** 23 July 2026
**Purpose:** Product and implementation guidance for the ViksitPDS controlled PoC and subsequent MVP/pilot
**Systems reviewed:** J&K SMART-PDS, J&K AePDS/ePoS, Maharashtra AePDS, Maharashtra IAeSCM, and the current ViksitPDS repository

## Executive decision

ViksitPDS should **complement**, not replace or reproduce, SMART-PDS, state ration-card systems, IAeSCM, or AePDS/ePoS.

The two states show a consistent separation of responsibilities:

1. **SMART-PDS/RCMS** owns beneficiary, ration-card, FPS master, citizen-service, licensing, and departmental workflows.
2. **IAeSCM or the state supply-chain system** owns allocation, release orders, depot dispatch, stock movement, and FPS receipt operations.
3. **AePDS/ePoS** owns dealer/device-bound last-mile authentication and ration distribution.
4. **ViksitPDS should add a cross-system trust and reconciliation layer**: ingest non-sensitive events from those authoritative systems, correlate custody and distribution, detect mismatches, and asynchronously anchor privacy-safe proofs on Fabric.

Maharashtra makes this boundary especially clear. An August 2025 Lok Sabha answer describes separate digital RCMS, AePDS biometric distribution, and IAeSCM supply-chain/allocation components. It also reports 52,848 ePoS-equipped FPSs and says IAeSCM is being enabled for real-time movement and FPS-delivery monitoring. [Official Lok Sabha answer](https://sansad.in/getFile/loksabhaquestions/annex/185/AS246_3DMZEH.pdf?source=pqals)

The immediate PoC correction is therefore **not simply to add an FPS login button**. The PoC must:

- present separate entry journeys for department, operations, FPS, audit, and platform administration;
- bind the FPS persona to a specific shop and enforce that scope in the API;
- describe local authentication and distribution as an **ePoS event simulation**, not as a replacement for an actual ePoS device;
- show upstream system provenance and cross-system reconciliation;
- keep Aadhaar, biometric, OTP, mobile number, full ration-card values, and other sensitive identity data out of ViksitPDS and Fabric.

Before an MVP/pilot claim, ViksitPDS also needs versioned inbound adapters, identity-to-resource authorization, atomic PostgreSQL command/outbox transactions, concurrency and replay tests, and a validated integration contract with the relevant state/NIC teams.

## Evidence and interpretation

This review uses publicly accessible government pages and documents plus a read-only inspection of the present repository. Public portals reveal visible functions and some operational boundaries, but they do not reveal private APIs, complete role matrices, data-sharing approvals, or internal operating procedures. Recommendations concerning integration contracts are therefore architecture proposals that must be validated with the departments and NIC.

### J&K SMART-PDS

The J&K SMART-PDS login application exposes distinct citizen, authority, and FPS-oriented login journeys. Its browser application includes routes for authority login, Aadhaar/mobile/ration-card login, FPS-ID login, ration-card services, and FPS registration/licensing workflows.

This is broader than an ePoS sales application. It is best treated as the state-facing master, citizen-service, and administrative workflow layer. The public application suggests a granular authority model, but ViksitPDS should not copy every state role before a pilot workflow exercise identifies which roles actually participate in the trust layer.

Reference: [J&K SMART-PDS login](https://jk.smartpds.nic.in/login)

### J&K AePDS/ePoS

The J&K AePDS site exposes public MIS, FPS details and stock, FPS-wise transactions, sales, UIDAI authentication summaries, allotment, Annavitran, and release-order status reports. Its web login uses user ID, password, and captcha. [J&K AePDS login](https://epos.jk.gov.in/login)

The existence of a web login does not mean that the website is the primary ration-sale terminal for every FPS dealer. The AePDS device FAQ states that:

- the dealer receives software updates when switching on the PoS device;
- each FPS is tightly coupled to its allocated device;
- shop transactions are allowed only from the assigned device;
- ration normally cannot be issued to beneficiaries not tagged to that FPS.

Reference: [J&K AePDS FAQ](https://epos.jk.gov.in/docs/FAQ.pdf)

The most defensible user interpretation is:

- **FPS dealer/operator:** primarily works through the mapped ePoS device for beneficiary authentication and ration issue;
- **department/MIS/back-office user:** uses the authenticated web application for operational or administrative functions;
- **public observer:** can view many aggregated reports without an account.

The exact private web-role matrix is not publicly documented and should not be invented.

### Maharashtra AePDS

Maharashtra uses the same recognizable NIC AePDS pattern as J&K. Its portal exposes:

- MIS software-version and active/inactive-shop information;
- FPS details, stock, sales register, transaction abstracts, activity, and non-drawl cards;
- NFSA, date-wise, scheme-wise, and festival-foodgrain sales;
- UIDAI authentication and failure reports;
- allotment reports;
- Annavitran, ONOR/eKYC, grievance, and Shiv Bhojan links;
- an IAeSCM portal link;
- a user-ID/password/captcha web login.

References: [Maharashtra AePDS functions](https://mahaepos.gov.in/FPS_Status.jsp), [web login](https://www.mahaepos.gov.in/login), [FPS-wise transaction report](https://www.mahaepos.gov.in/FPS_Trans_Abstract.jsp)

The FPS-details report separately tracks whether a device, dealer UID, and up to two nominee UIDs are mapped to each shop. This is strong evidence that the operational identity model is **shop + device + authorized dealer/nominee**, not merely a generic `fps` role. [Maharashtra FPS mapping report](https://mahaepos.gov.in/dfso_fps_details)

The Maharashtra FAQ says each shop is tightly coupled to its assigned device and transactions for a shop are allowed only from that device. It also describes dealer-triggered device updates and beneficiary tagging. [Maharashtra AePDS FAQ](https://mahaepos.gov.in/docs/FAQ.pdf)

As with J&K, the defensible user interpretation is:

- **FPS dealer or registered nominee:** performs distribution on the FPS-mapped ePoS device;
- **department/MIS/back-office user:** uses the authenticated AePDS web interface;
- **public observer:** uses the extensive public report pages.

The web portal does not publicly label its complete authenticated role list, so no more specific claim should be made without department/NIC confirmation.

### Maharashtra IAeSCM

Maharashtra also operates a separately branded Integrated Aadhaar enabled Supply Chain Management portal. Its public pages expose shops, depots, release orders, dispatch, receipt, depot stock, and Stage-II stock-movement status. [Maharashtra IAeSCM](https://scm.mahafood.gov.in/), [Stage-II movement report](https://scm.mahafood.gov.in/welfare_ro_status.jsp), [dispatch and receipt report](https://scm.mahafood.gov.in/DISPATCH_ABSTRACT)

This matters directly to ViksitPDS: allocation and movement screens that are useful in the controlled demo may duplicate functions that IAeSCM already owns in a real Maharashtra deployment. They should therefore be represented as:

- simulated source-system operations in the PoC; and
- imported, reconciled events in a pilot.

### National SMART-PDS direction

The Department of Food and Public Distribution describes SMART-PDS as sustaining end-to-end computerization and IM-PDS reforms, strengthening national portability, standardizing technology, integrating with systems such as FCI/CWC/UIDAI, and enabling data-driven decisions. [DFPD SMART-PDS overview](https://dfpd.gov.in/distribution-of-food-grains/en)

This reinforces the integration-first conclusion. A new parallel ration-card or distribution system would increase fragmentation; a proof and reconciliation overlay can instead support the integration and transparency goals.

## Comparative responsibility matrix

| Capability | SMART-PDS/RCMS | IAeSCM/state SCM | AePDS/ePoS | Recommended ViksitPDS responsibility |
|---|---|---|---|---|
| Beneficiary and ration-card master | Authoritative | Reference only | Consumes eligible-card data | Store only opaque/hash references required for correlation |
| Citizen applications and grievances | Authoritative | No | Limited links/reports | Out of scope; link or federate |
| FPS registration/licensing/master | Authoritative | Consumes shop master | Consumes shop/device/dealer mapping | Cache a minimal, versioned FPS reference |
| Allocation and release order | May coordinate | Authoritative where deployed | Displays/consumes | Ingest event and independently reconcile |
| Depot stock and dispatch | Reference/oversight | Authoritative | Displays downstream stock | Ingest custody events and compare quantities |
| FPS stock receipt | State-specific boundary | Usually authoritative | May receive/update stock | Correlate source receipt references and proof |
| Device/dealer mapping | Master or ePoS administration | Reference | Authoritative at transaction time | Consume opaque shop/operator/device attestations only |
| Beneficiary authentication | Identity ecosystem | No | Authoritative | Store only mode, outcome, reason code, and hashed transaction reference |
| Ration sale/distribution | No | Receives downstream status | Authoritative | Ingest and reconcile the ePoS event; do not re-authenticate |
| Public operational MIS | Broad | Supply-chain MIS | Distribution MIS | Cross-system exceptions and proof status |
| Immutable cross-system evidence | Not the main purpose | Not the main purpose | Not the main purpose | Core responsibility |
| Quantity/provenance reconciliation | Within owned workflow | Within supply chain | Within distribution | Cross-boundary reconciliation and audit |

Ownership varies by state and contract. The integration discovery must confirm the authoritative system for every event before pilot implementation.

## Target architecture

```text
SMART-PDS / RCMS
  beneficiary, card, entitlement and FPS master references
                    \
                     \
IAeSCM / state SCM ----> ViksitPDS operational integration layer
  allocation, RO,          PostgreSQL authoritative for imported events,
  dispatch, receipt        correlations, exceptions and proof outbox
                     /
                    /
AePDS / ePoS
  shop/device/operator-bound authentication and distribution events

ViksitPDS outbox ----asynchronously----> Hyperledger Fabric
                                        non-sensitive immutable proofs only
```

The state systems remain authoritative for their business records. PostgreSQL is authoritative for ViksitPDS's imported event state, correlations, reconciliation results, workflow exceptions, and proof-delivery status. Fabric remains an asynchronous proof destination and must not re-execute the upstream business command.

## Current ViksitPDS assessment

> Implementation status, 23 July 2026: the controlled-PoC corrections described
> below are implemented. `demo-fps` is assigned to `FPS-101`; FPS reads and
> mutations are identity-scoped; canonical fixture-backed source events expose
> privacy-approved provenance, replay/quarantine status, reconciliation, and
> source-to-proof trace. These are simulated adapter seams, not evidence of a
> live state-system integration. The pilot gates in this document remain open,
> including approved Maharashtra contracts and row-scoped atomic command
> persistence.

### What already exists

The current application does include an FPS persona:

- `apps/web/src/pages/RoleLoginPage.tsx` offers `demo-fps`;
- `apps/web/src/demo-model.ts` gives the FPS role dashboard, workbench, allocation, distribution, and verification screens;
- the API protects FPS receipt, simulated authentication, and distribution mutations with the `fps` role;
- OIDC token parsing supports `pds_org_id`, `pds_stakeholder_id`, and `pds_msp_id`;
- the Keycloak realm maps those user attributes into tokens;
- the proof model already records event/operation identifiers, actor, application role, submitting organization, payload hash, schema version, entity identifiers, and business timestamp.

These were the foundations at the time of the product assessment. The controlled
PoC now has a credible **FPS account-to-shop security boundary** and a
fixture-backed **state-system integration boundary**. The latter remains
provisional until an authorized state/NIC contract replaces the fixtures.

### Material gaps identified by the assessment

1. **Demo FPS assignment — resolved for the controlled PoC.**
   Keycloak bootstrap and database authorization assignments bind `demo-fps` to
   `FPS-101`.

2. **FPS resource scope — resolved for the controlled PoC.**
   FPS reads derive shop scope from the active assignment. Compatibility identity
   fields on mutations must match that assignment.

3. **Hard-coded shop presentation — resolved.**
   The FPS workspace displays the authenticated assignment and the API remains
   authoritative for scope. A second shop fixture and isolation tests demonstrate
   the boundary.

4. **System-of-entry presentation — resolved for the controlled PoC.**
   Browser authentication and distribution actions are visibly simulations. Pilot
   source events enter through authenticated integration endpoints; AePDS/ePoS
   remains authoritative.

5. **Source provenance — resolved at the canonical fixture seam.**
   Imported records carry source identity, event reference, schema version,
   occurrence/ingestion times, operation ID, privacy-approved payload hash, and
   processing status.

6. **The current persistence architecture is not pilot-safe — still open.**
   The runtime still uses an in-memory engine with serialized full-state snapshot persistence. Operational snapshot saving and proof-outbox insertion are separate operations. It must stay single-replica and controlled-demo only until row-scoped atomic command services replace this path.

## Required PoC changes

These changes are required for an accurate, jury-ready controlled PoC. They do not make the system pilot-ready.

### P0: Correct the product story and entry journeys

Add a clear landing/entry selector:

- **Department / Authority**
- **Supply-chain operations** (procurement, FCI, depot/godown)
- **Fair Price Shop demo**
- **Audit / Management**
- **Platform administration**

These may share the same React application and Keycloak client. Separate cards/routes improve comprehension; they are not a substitute for API authorization.

For the FPS entry, use wording such as:

> Simulated FPS workspace. In a state deployment, shop/device-bound authentication and ration issue remain in the authorized AePDS/ePoS system; ViksitPDS consumes the resulting non-sensitive event.

Do not label ViksitPDS as the Aadhaar authentication provider, ePoS replacement, RCMS replacement, or state supply-chain replacement.

### P0: Bind and enforce the demo shop

- Provision `demo-fps` with `pds_stakeholder_id=FPS-101` and the appropriate organization attribute.
- Reject an FPS token without an active shop assignment.
- Derive the acting `fpsId` from the verified identity for FPS-originated calls.
- If an endpoint retains `fpsId` in its body, require an exact match with the identity assignment and return `403` on mismatch.
- Filter FPS allocation, receipt, stock, authentication, distribution, and verification queries to the assigned shop.
- Check the target allocation belongs to that FPS before receipt.
- Derive the dealer/operator reference from identity or a server-side assignment; do not trust a caller-supplied `dealerId`.

Department, auditor, and management roles may have wider read scopes, but those scopes should be explicit and tested.

### P0: Make provenance visible in the demo

Add a source badge to records:

- `SMART-PDS/RCMS reference`
- `IAeSCM/state SCM event`
- `AePDS/ePoS event`
- `ViksitPDS demo simulation`

Show both statuses:

- **operational/import status**, such as accepted, duplicate, conflicted, or reconciled;
- **Fabric proof status**, such as pending, submitting, committed, retryable failure, or dead letter.

This visually communicates the correct architecture and uses an existing ViksitPDS strength: operational completion is separate from proof completion.

### P0: Refocus the FPS dashboard

The FPS demo should show only the assigned shop:

- shop reference and simulated device-mapping status;
- current imported allocation/stock position;
- pending receipt confirmation;
- recent simulated ePoS distributions;
- delayed/offline sync status;
- shortage or reconciliation exceptions;
- proof status and transaction references.

Do not show raw Aadhaar, biometrics, OTPs, mobile numbers, full ration-card numbers, beneficiary names, or addresses.

### P0: Revise the demo narrative

Use this sequence:

1. Department user views a SMART-PDS/RCMS entitlement or master reference.
2. Godown/operations user imports or simulates an IAeSCM allocation and dispatch.
3. The `demo-fps` user, visibly bound to `FPS-101`, confirms receipt or shortage.
4. The demo imports a clearly labelled simulated AePDS/ePoS distribution event.
5. ViksitPDS correlates allocation, movement, receipt, and distribution.
6. An auditor sees quantity mismatch/exception status and the non-sensitive Fabric proof.
7. The UI demonstrates operational completion before proof commitment and later shows the Fabric transaction ID.

The demo should explain that steps 1, 2, and 4 use fixtures/adapters until a state integration is authorized.

### PoC acceptance checks

- An FPS user cannot read another shop's allocation or distribution.
- An FPS user cannot receipt another shop's allocation.
- An FPS user cannot submit a body containing another `fpsId` or `dealerId`.
- Department/auditor access behaves according to an explicit scope policy.
- The same simulated source event replays idempotently.
- Conflicting reuse of the same source event ID returns `409`.
- No forbidden identity field appears in API responses, logs, proof payloads, or Fabric state.
- Proof lag does not roll back an accepted operational event.
- The controlled-demo persistence warning and single-replica restriction remain visible in documentation.

## Required MVP/pilot changes

The following are release gates, not optional polish.

### P0: Define state-system adapter contracts

Create three versioned integration boundaries, even if one state supplies a combined interface:

1. **SMART-PDS/RCMS reference adapter**
   - FPS master reference and status;
   - scheme/entitlement reference;
   - opaque ration-card/beneficiary references;
   - effective-from/effective-to and source version.

2. **IAeSCM/state-SCM event adapter**
   - allocation/release-order reference;
   - depot/godown dispatch;
   - quantity and commodity;
   - receiving FPS;
   - receipt, shortage, damage, rejection, and adjustment;
   - source business timestamp and movement status.

3. **AePDS/ePoS event adapter**
   - source distribution transaction ID or its approved hash;
   - FPS reference;
   - commodity and positive integer quantity;
   - allocation/distribution month and scheme reference;
   - authentication mode, result, and non-sensitive error/exception code;
   - portability indicator where approved;
   - occurrence time, device sync time, and ingestion time.

Proposed endpoint names, subject to integration discovery:

```text
POST /integrations/smartpds/v1/master-references
POST /integrations/scm/v1/allocation-events
POST /integrations/scm/v1/movement-events
POST /integrations/epos/v1/distribution-events
```

These endpoints should be server-to-server interfaces, not browser calls.

Every inbound envelope should include at least:

```json
{
  "sourceSystem": "MAHA_AEPDS",
  "sourceEventId": "opaque-source-event-reference",
  "schemaVersion": 1,
  "occurredAt": "source business timestamp",
  "idempotencyKey": "source-system:event-id",
  "payloadHash": "sha256-of-canonical-approved-payload"
}
```

Use the original approved opaque reference where operational correlation requires it; use a domain-separated hash before proof submission. Do not put raw authentication or beneficiary identity material in the envelope.

### P0: Enforce resource-scoped authorization

Add durable assignments rather than relying on a single role string:

```text
identity subject
  -> application role
  -> organization/district/office scope
  -> stakeholder assignment
  -> FPS/depot/godown resource scope
```

Required behavior:

- FPS dealer/nominee identities can operate only on assigned active shops.
- Depot/godown users can act only on assigned facilities.
- Department roles are restricted by their authorized geography/office unless explicitly state-wide.
- Auditors receive read-only scopes and separately authorized exception-resolution rights.
- Platform administrators cannot silently gain operational business authority.
- Integration service accounts are restricted by source system, endpoint, and allowed event type.

Use government IAM federation where available. ViksitPDS should not become the system of record for Aadhaar, dealer biometric enrollment, or ePoS device credentials.

### P0: Make ingestion idempotent and order-tolerant

- Place a unique constraint on `(source_system, source_event_id)`.
- Identical replay returns the existing accepted result.
- Conflicting content for an existing source event ID returns `409` and raises an audit exception.
- Preserve source occurrence time separately from receipt and processing time.
- Support delayed batches from offline ePoS devices.
- Do not assume network arrival order equals business order.
- Quarantine events with missing parents and retry correlation when their allocation/movement reference arrives.
- Preserve amendments/reversals as new linked events; never overwrite history silently.
- Authenticate the sending system with mTLS and/or a government-approved signed-token mechanism and rotate credentials.

### P0: Complete transactional PostgreSQL hardening

Before pilot use:

- replace full-state snapshot rewrites with row-scoped repositories and command services;
- commit the imported event, state transition, reconciliation result/domain event, and Fabric outbox row on one PostgreSQL client inside one `BEGIN`/`COMMIT`;
- use row locks, conditional balance updates, unique idempotency constraints, and version checks;
- prevent stock and entitlement double-spend;
- keep the Fabric worker asynchronous, retryable, and independent of business acceptance;
- run simultaneous ingestion, distribution, receipt, and outbox-worker tests;
- demonstrate crash recovery without a committed operation losing its proof intent.

Until this gate passes, run exactly one API replica, reset/reseed before demonstrations, and do not claim concurrent mutation safety, crash atomicity, HA, or pilot readiness.

### P0: Preserve privacy by design

ViksitPDS must not ingest or persist:

- Aadhaar numbers or images;
- biometric samples/templates;
- OTP values;
- mobile/phone numbers;
- full ration-card values;
- unmasked beneficiary names or addresses.

The AePDS portals publicly report Aadhaar/device/dealer mapping and authentication outcomes, but that is not authorization for ViksitPDS to copy the underlying identity data. Store only approved opaque/hash references, result codes, necessary quantities, and provenance metadata.

Apply recursive sensitive-field validation at:

- inbound adapter DTO validation;
- normalized PostgreSQL event payloads;
- application logs and dead-letter errors;
- Fabric proof construction;
- chaincode validation.

### P1: Build cross-system reconciliation

The first useful reconciliation views should answer:

- Does the state allocation equal dispatch plus documented remaining stock?
- Does each movement have a matching receipt, shortage, rejection, or in-transit state?
- Does FPS opening stock plus receipts minus ePoS distributions and explicit adjustments equal closing stock?
- Was a distribution recorded against an active FPS and eligible source reference?
- Are duplicate source transactions, impossible time sequences, unexplained losses, or over-distribution present?
- Did an offline ePoS batch arrive late but reconcile cleanly?
- Does every accepted integration event have a durable proof intent, and does every committed proof have a Fabric transaction ID?

Alerts must not themselves change stock. Shortage, damage, rejection, transit loss, and process loss require explicit quantity-adjustment events.

### P1: Add state configuration without state-specific forks

Use configuration and adapter mappings for:

- J&K versus Maharashtra source-system identifiers;
- scheme and commodity code mappings;
- administrative hierarchy;
- source API versions;
- portability and offline-sync semantics;
- authoritative owner for allocation, receipt, and distribution;
- permitted exception/result codes.

Do not fork the core domain into separate J&K and Maharashtra applications. Preserve a canonical internal event model and retain the original source payload hash/reference for traceability.

### P1: Improve role design without copying every legacy role

For the initial MVP, a practical application-role set is:

- department authority/approver;
- supply-chain operator;
- depot/godown operator;
- FPS viewer/receipt operator where needed;
- auditor;
- management;
- integration service;
- platform administrator.

Granular state roles such as DFSO, TSO, inspector, or nominee should be represented through assignments and permissions after workflow validation. Avoid one application role per job title unless it changes an allowed action.

### P1: Integration operations

Add:

- per-source ingestion health and last-success time;
- accepted, duplicate, conflicted, rejected, and quarantined counters;
- reconciliation lag and unresolved-parent age;
- schema-version monitoring;
- dead-letter inspection with privacy-safe errors;
- manual replay requiring explicit authorization;
- contract-test fixtures supplied/approved by each source-system team;
- end-to-end correlation from source event to PostgreSQL operation and Fabric transaction.

## Keep, change, integrate, or defer

| Current ViksitPDS element | Decision | Reason |
|---|---|---|
| PostgreSQL operational truth + async Fabric proof | **Keep** | Correct boundary for a complementary trust layer |
| Two-organization Fabric demo | **Keep for PoC** | Demonstrates shared evidence governance; not final consortium design |
| FPS role and screens | **Change** | Bind to a shop, scope every resource, and label sale/auth as simulation |
| Mock OTP/simulated biometric | **Keep only as labelled fixture** | Useful for demo flow; must not imply real authentication |
| Caller-provided `fpsId`/`dealerId` | **Remove or validate against identity** | Current resource-authorization risk |
| Hard-coded `FPS-101` | **Keep only in canonical demo fixtures** | Never use as an authorization shortcut |
| Allocation/movement entry | **Simulate in PoC; integrate in pilot** | IAeSCM/state SCM is authoritative where deployed |
| Distribution entry | **Simulate in PoC; ingest in pilot** | AePDS/ePoS is authoritative |
| Ration-card/citizen services | **Defer/integrate** | SMART-PDS/RCMS responsibility |
| Aadhaar/biometric/OTP implementation | **Do not build** | Federate/consume non-sensitive outcome only |
| Cross-system reconciliation | **Build** | Primary differentiator and audit value |
| Proof status and immutable evidence | **Keep and extend** | Primary ViksitPDS value |
| One Fabric organization per FPS | **Do not build** | FPS is an application resource, not automatically a consortium member |

## Pilot discovery questions

The following must be answered with J&K or Maharashtra department/NIC stakeholders before freezing an adapter:

1. Which system is authoritative for FPS master, dealer/nominee mapping, allocation, dispatch, receipt, and final distribution?
2. Are integrations event-driven, file/batch based, or request/response APIs?
3. What stable non-sensitive source identifiers can be shared?
4. How are offline ePoS transactions timestamped, sequenced, amended, and synchronized?
5. How are reversals, failed authentication, supervisor exceptions, portability, and non-drawl represented?
6. Which fields are approved for storage outside the source system and for hashing into a proof?
7. Which service identity, signing, mTLS, IP allow-list, audit, and retention controls are required?
8. Which department roles need ViksitPDS access, at what geographic/resource scope?
9. What reconciliation is currently manual, delayed, or disputed?
10. What evidence is legally and operationally useful in a shortage/diversion investigation?

No production adapter should be presented as validated until these questions are answered and a contract test is run against an authorized non-production source.

## Readiness gates

### Controlled PoC ready when

- the product boundary is corrected in UI and documentation;
- `demo-fps` is assigned and API-scoped to `FPS-101`;
- source provenance and proof status are visible;
- mock authentication/distribution is explicitly labelled;
- two-FPS isolation, replay/conflict, role-denial, and privacy tests pass;
- normal build, typecheck, lint, unit, and demo HTTP checks pass;
- the controlled-demo single-replica and non-crash-safe limitations remain disclosed;
- a reset/reseed and final outbox check are completed immediately before the demonstration.

### MVP/pilot ready only when

- a department/NIC-approved source contract and data-sharing basis exist;
- at least one real non-production adapter path is demonstrated;
- identity-resource assignments are enforced end to end;
- business/event/outbox writes are atomic and row-scoped;
- simultaneous-command and crash tests pass;
- late/offline, duplicate, conflicting, amended, and out-of-order events are handled;
- privacy and security review confirms no prohibited identity data crosses the boundary;
- reconciliation acceptance rules are signed off by operational users;
- proof completion, retry, dead-letter, and recovery are operationally monitored;
- deployment, TLS, secrets, backup/restore, incident response, VAPT, HA/DR, and retention requirements for the agreed pilot are met.

Passing the PoC gate does not satisfy the MVP/pilot gate.

## Recommended implementation order

1. Correct the entry journeys, terminology, and demo source badges.
2. Provision `demo-fps` with `FPS-101`; implement API resource scoping and two-shop tests.
3. Introduce a canonical `SourceEventEnvelope` and fixture-backed AePDS/IAeSCM/SMART-PDS adapter seams.
4. Change the demo workflow to ingest simulated source events rather than presenting every step as native entry.
5. Add source-to-operation-to-proof trace and basic stock/distribution reconciliation.
6. Complete row-scoped atomic PostgreSQL command/outbox hardening.
7. Conduct state/NIC integration discovery and privacy/security review.
8. Implement one authorized non-production adapter and run replay, offline-delay, conflict, crash, and concurrency tests.
9. Expand state configuration and operational monitoring only after the first contract is stable.

## Conclusion

The Maharashtra portal supports, rather than changes, the conclusion from J&K: the FPS distribution function already has a specialized shop/device/dealer-bound AePDS/ePoS system, while ration-card administration and supply-chain management have their own systems.

ViksitPDS's strongest product position is therefore:

> A privacy-preserving, cross-system custody, reconciliation, and immutable-proof layer for PDS—not another ration-card portal, supply-chain system, or ePoS terminal.

The present repository has closed the controlled-PoC shop-scoping,
source-provenance, and last-mile presentation gaps. That makes the PoC story
credible within its documented single-replica, reset-before-demo limitations; it
does not make the system pilot-ready. Pilot readiness still depends on approved
real integration contracts and the documented transactional, concurrency,
security, and operational gates.
