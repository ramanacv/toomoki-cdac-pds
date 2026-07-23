# Beneficiary Distribution And FPS Demo Notes

## Product Boundary

The repository implements an end-to-end last-mile demonstration, but the
browser authentication and distribution controls are simulations. In an
authorized state integration, AePDS/ePoS remains the system of entry for
shop/device-bound authentication and ration issue. ViksitPDS consumes the
approved, non-sensitive event for correlation, reconciliation, and immutable
proof.

ViksitPDS is not an Aadhaar authentication provider, ePoS terminal, ration-card
system, or beneficiary registry.

## Controlled-PoC Flow

```text
FPS allocation and receipt
  -> simulated authentication
  -> entitlement-reference validation
  -> simulated distribution
  -> PostgreSQL operational acceptance
  -> asynchronous Fabric proof
  -> audit and trace
```

Supported simulation modes are mock OTP, simulated biometric, and approved
supervisor exception. The UI must label each mode as a simulation and must not
collect a real Aadhaar number, OTP, biometric, phone number, or full ration-card
value.

## FPS Authorization

`demo-fps` is assigned to `FPS-101`.

- The API requires an active `FAIR_PRICE_SHOP` assignment.
- It derives shop and opaque operator references from authenticated identity and
  database assignments.
- Allocation, stock, receipt, authentication, entitlement, distribution,
  dashboard, and trace data are scoped to that shop.
- Another shop's individual resource returns `404`.
- A legacy mutation `fpsId` or `dealerId` that conflicts with the assignment
  returns `403`; the maintained browser omits both fields.
- `FPS-202` fixtures and tests demonstrate isolation.

## Source And Proof Status

Pilot AePDS/ePoS distribution events use:

```text
POST /integrations/epos/v1/distribution-events
```

Fixture-backed Maharashtra events exercise this seam but are not a real
integration. Distribution views may include source provenance: source system,
source event ID, schema version, occurrence/ingestion times, approved-payload
hash, operation ID, and processing status.

An accepted distribution has a stable event and operation reference. Fabric
proof submission is asynchronous:

- operational acceptance means PostgreSQL accepted the command or source event;
- proof completion means the outbox status is `COMMITTED` and a real
  `fabricTxId` is recorded;
- `PENDING`, `FAILED`, or `DEAD_LETTER` proof state does not erase the
  operational result.

## Privacy

The boundary recursively rejects:

- Aadhaar numbers or images;
- biometric material;
- OTP values;
- phone/mobile values;
- full ration-card values;
- unmasked beneficiary names or addresses;
- device credentials.

Responses, logs, PostgreSQL event/dead-letter payloads, and Fabric proofs use
approved values such as `rationCardHash`, `beneficiaryRefHash`,
authentication-transaction reference hashes, and server-derived operator
references.

## Demonstration Checklist

1. Sign in through the Fair Price Shop Demo journey.
2. Confirm the workspace displays assigned shop `FPS-101` and simulated device
   mapping.
3. Review the assigned allocation, stock, and pending receipt.
4. Execute the visibly simulated authentication and distribution path.
5. Confirm the receipt is privacy-preserving and scoped to `FPS-101`.
6. Inspect source provenance where present.
7. Show operational status and proof status separately.
8. Display the Fabric transaction reference only after `COMMITTED`.

Run one API replica and use an explicitly authorized reset/reseed before a
controlled demonstration. This flow does not prove crash atomicity, concurrent
command safety, or pilot readiness.
