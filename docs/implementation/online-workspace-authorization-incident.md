# Online workspace authorization incident

## Scope

This analysis covers the repeated online workspace failure reported as:

> Online service unavailable  
> Your authenticated role is not permitted to perform this operation.

It assesses the initial workspace reads, Keycloak identities, durable
authorization rows, FPS shop scoping, integration-service contracts, and the
error presented by the React application.

## Evidence

- The API health endpoint remained healthy while the UI displayed the outage
  message.
- API request logs showed the `demo-fps` subject and `fps` role passing the
  route guard for `/dashboard/summary`, `/auth/transactions`,
  `/distributions`, `/stock`, and `/fps-allocations`.
- Those requests then returned HTTP 403 from FPS shop-scope enforcement.
- PostgreSQL contained an active `FPS:FPS-101` scope for the subject, but the
  access token did not contain `pds_stakeholder_id`.
- The web application converted every HTTP 403 into the same generic role
  message and treated any rejected member of the parallel initial load as an
  online service outage.
- The persisted Keycloak realm also had bootstrap-administrator credential
  drift. Recreating only the local Keycloak volume restored deterministic
  administration without changing PostgreSQL or Fabric ledger state.

## Root cause

The API required both an active durable FPS scope and a matching
`pds_stakeholder_id` token claim. In database authorization mode this made an
optional, mapper-dependent claim a second mandatory source of shop identity.
The route role check succeeded, but controller-level FPS scoping failed when
the claim was absent.

The incident message was misleading because the API was online and the role
itself was accepted. A scope failure in one parallel workspace request rejected
the complete workspace load.

The bootstrap also performed enough sequential Keycloak operations to exceed a
single five-minute admin access token. Without periodic reauthentication,
late-stage assignments or validation could fail even after earlier work had
succeeded.

## Changes

- In database authorization mode, FPS scope is derived from exactly one active
  `subject_scope_assignments` row for the authenticated subject.
- A supplied token shop claim is still checked and rejected if it conflicts
  with the durable assignment.
- Missing, multiple, inactive, non-FPS, and conflicting assignments continue to
  fail closed.
- Integration-service source contracts use the durable source, endpoint,
  event-type, and credential assignments in database authorization mode.
- The IAM bootstrap now reconciles existing OIDC mapper definitions,
  reauthenticates between long provisioning phases, and validates every seeded
  demo user's Keycloak role and durable database role. It additionally validates
  the FPS-101 scope.
- The web application now reports the denied endpoint and API reason, labels
  authorization failure as incomplete workspace access, and offers a fresh
  sign-in action for denied or expired sessions.

## Verification

- `npm run test:iam`: passed, 7 tests.
- Focused API tests for FPS scope and integration events: passed, 10 tests.
- Focused web role/error tests: passed, 3 tests.
- API and web TypeScript checks: passed.
- Repaired IAM bootstrap: completed with its all-user validation marker.
- Rebuilt API and web containers: healthy.
- Live online workspace endpoint probe using a short-lived OIDC service token:
  all 11 initial workspace endpoints returned HTTP 200.

The live endpoint probe confirms operational API completion in demo ledger
mode. It is not a live Fabric proof-completion test and does not change the
repository's controlled-demo persistence limitations.

## User action after the IAM reset

Existing browser sessions reference the replaced local realm and must not be
reused. Sign out and sign in again to obtain a token issued by the repaired
realm. The error screen now provides this action.

## Recommended follow-up

- Keep `npm run test:iam` in the release gate.
- Treat durable database assignments as authoritative whenever
  `PDS_AUTHORIZATION_MODE=database`.
- Retain token claim mappers for interoperability, but do not make an optional
  claim the sole source of a durable scope.
- Add a browser-level OIDC role-login matrix when an automated authorization
  code + PKCE test harness is introduced.
