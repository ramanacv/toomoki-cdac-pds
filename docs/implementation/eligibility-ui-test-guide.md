# Eligibility Review UI Test Guide

## Scope

This document identifies the user-interface elements added for the external
eligibility-screening demonstration and explains which parts belong to the
ViksitPDS React application versus the separately deployed
`@pds/eligibility-mock` service.

## Finding

The browser UI is implemented entirely in the ViksitPDS web application at the
`/eligibility` route. The `eligibility-mock` application has no HTML or browser
interface; it is an HTTP simulation service used by the ViksitPDS API.

The **Eligibility review** navigation item is available to these roles:

- Control Office: interactive when the web application uses the API data
  source.
- Management: read-only.
- Auditor: read-only.

When the web application uses offline fixture mode, the screen remains
read-only and external screening actions are disabled.

## UI elements in the ViksitPDS application

### Simulation notice and dependency status

- An amber **External-service simulation using synthetic beneficiaries**
  notice explains that the records and policy are fictional.
- The notice states that external signals only open human review and never
  cancel a ration card automatically.
- A warning or error alert displays dependency failures and confirms that the
  current entitlement remains unchanged.
- Summary cards display:
  - external service status;
  - open case count;
  - decision and appeal counts;
  - reversal and quarantine counts.

### Registry and planning panels

- **Registry lifecycle** shows active registry records, household members,
  lifecycle events, and pending proofs.
- Depending on registry state, it offers:
  - **Register lifecycle record**;
  - **Record migration**;
  - **Record family bifurcation**.
- **Planning impact · simulation** shows the current and baseline monthly rice
  quantity, allocation change, and indicative subsidy change.

### Synthetic beneficiary selection and screening

- A table lists synthetic beneficiaries with:
  - fictional beneficiary name and demo ID;
  - masked ration-card reference;
  - eligibility status;
  - case ID, when present;
  - primary signal source and risk;
  - remaining entitlement.
- Clicking a table row selects the beneficiary and highlights the row.
- **Run external eligibility check** calls the mock screening service through
  the ViksitPDS API.
- **Entitlement gate check** tests whether distribution is currently allowed
  for the selected synthetic beneficiary.

### Screening response

After a successful screening, the screen displays:

- primary screening status;
- recommended review action;
- policy rule IDs and response expiry;
- screening ID and request ID;
- source-specific signal cards containing source, status, risk, fact code, and
  observation date;
- the privacy-safe evidence digest and response attestation hash.

### Guided review-case actions

Only actions valid for the selected case's current state are displayed:

- **Issue notice**;
- **Record verification**;
- **Recommend ineligible**;
- **Recommend eligible**;
- **Authorize member removal** for the member-death scenario;
- **Authorize cancellation** for applicable card-level scenarios;
- **Keep active**;
- **Accept appeal** after a decision;
- **Reinstate** after an accepted appeal.

The panel also displays the case state, operational RCMS status, Fabric proof
status, and optimistic version.

### Entitlement result

After an entitlement-gate check, a result card displays:

- **Distribution allowed** or **Distribution blocked**;
- the reason;
- RCMS status;
- available balance;
- quantity already lifted.

## What the eligibility mock exposes

`apps/eligibility-mock` exposes only:

- public `GET /health`;
- bearer-token-protected `POST /v1/screenings`.

It has no direct form, page, dashboard, or test console. Interactive testing is
performed from the ViksitPDS **Eligibility review** screen; service-boundary
testing is performed through its HTTP endpoints or automated tests.

## Suggested manual UI test

1. Start the eligibility-enabled API, web app, and mock service with the
   required service token.
2. Sign in as **Control Office** and open **Eligibility review**.
3. Confirm the external service summary reports a healthy state.
4. Select a synthetic beneficiary and run **Run external eligibility check**.
5. Inspect the returned signal source, risk, evidence digest, and attestation.
6. Run **Entitlement gate check** and confirm review alone does not block an
   entitlement.
7. Advance an opened case using only the guided buttons shown for each state.
8. For a cancellation scenario, confirm the entitlement gate becomes blocked.
9. Accept the appeal and reinstate the record, then confirm that the remaining
   balance is restored without restoring quantities already lifted.
10. Sign in as **Management** or **Auditor** and confirm mutation controls are
    disabled.

## Automated UI coverage

`apps/web/test/eligibility-review.test.tsx` covers:

- external screening and rendering of source evidence and attestation;
- dependency-failure messaging and entitlement preservation;
- entitlement-gate results;
- state-valid guided actions and optimistic-version submission;
- read-only behavior for Management and Auditor.

`apps/web/test/app-shell.test.tsx` covers navigation access to the Eligibility
review screen for oversight roles.

## Runtime verification on 2026-07-23

At 19:17 IST on branch `feature/ghost-beneficiary-eligibility`, the rebuilt
eligibility stack was not fully available:

- `eligibility-mock` was running and healthy; `GET /health` on port 3010
  returned HTTP 200.
- The API container had exited with status 1. Its log reported PostgreSQL error
  `42P01`: relation `eligibility_cases` does not exist.
- The web container was in `created` state and had never started because it
  depends on the API health check.
- Direct probes of ports 3000 and 4173 could not connect.
- A read-only PostgreSQL catalog query found none of the expected eligibility
  and beneficiary-registry tables.
- The required table definitions are present in `infra/postgres/schema.sql`,
  but an existing PostgreSQL data volume skips initialization scripts on
  container restart. The maintained schema therefore needs to be applied to
  that existing database before restarting the API and web services.

This evidence confirms the current API failure and missing-schema diagnosis. It
does not independently prove the earlier historical statement that services
were reachable on ports 3000 and 4173 before the rebuild, because those prior
containers and listeners are no longer present.

### Resolution

The retained-volume failure was corrected by adding a transactional one-shot
`schema-migrate` Compose service that must complete successfully before the API
starts. After applying it, API, web, and eligibility-mock health checks passed,
the `/eligibility` route returned HTTP 200, and the required tables were present
without resetting or reseeding the database.

## Evidence inspected

- `apps/web/src/pages/workspace/EligibilityReviewPage.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/demo-model.ts`
- `apps/web/test/eligibility-review.test.tsx`
- `apps/web/test/app-shell.test.tsx`
- `apps/eligibility-mock/src/server.ts`
- `docs/implementation/ghost-detection-impl.md`
