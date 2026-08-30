# FPS access to Trust & reconcile

## Scope

Review whether the **Trust & reconcile** module should appear for an authenticated
FPS dealer, and whether the screens and data currently exposed there match the
shop-bound FPS security boundary.

## Current behavior and evidence

- `apps/web/src/lib/modules.ts` explicitly includes `FPS` in the roles for the
  `trust` module.
- `apps/web/test/modules.test.ts` asserts that FPS receives both `fps` and
  `trust` module navigation.
- `docs/implementation/three-module-ui-ia.md` describes Trust & reconcile as an
  oversight module for auditor and management, with secondary access for
  operational roles.
- Within Trust & reconcile, the FPS role receives the `dashboard` and `verify`
  screens through `apps/web/src/demo-model.ts`.
- The dashboard contains useful FPS-scoped summary information, but it also
  embeds `FabricAnalyticsPanel`, which displays aggregate pipeline health,
  cross-module proof counts, proof event types, and recent proof envelopes.
- `GET /ledger-proofs/analytics` is authorized for all operational roles by
  `ProofsController` and its response is not scoped to the assigned FPS.
- Full proof detail and hash-keyed proof search are correctly hidden from FPS
  in the UI and restricted to auditor, management, and platform administration
  in the API.
- The Verify screen builds lot and movement traces from the workspace's lot,
  transfer, and distribution collections. Lot and transfer read endpoints are
  currently available to all operational roles and are not FPS-assignment
  scoped.
- Actual audit reconciliation and alert resolution endpoints are auditor-only.
  An FPS dealer therefore cannot perform the “reconcile” part implied by the
  module title.

## Finding

The menu entry is **intentional in the current implementation**, but it is not
the right final information architecture or least-privilege boundary for FPS.

An FPS dealer has a valid need to see:

- proof status for that dealer's own receipt and distribution operations;
- the assigned shop's reconciliation exceptions;
- a privacy-safe verification view for the assigned shop's transactions.

An FPS dealer should not receive:

- network-wide proof-pipeline analytics;
- proof counts or recent envelopes from other modules and organizations;
- unrestricted lot and transfer trace exploration;
- audit/reconciliation wording or controls reserved for oversight roles.

The current UI hides privileged proof detail, but aggregate and trace data remain
broader than the assigned-shop boundary. Hiding controls alone is insufficient;
the API response must also be scoped or access-restricted.

## Risk

- **Authorization/least privilege:** a shop-bound identity can inspect
  cross-organization operational metadata.
- **Role confusion:** “Trust & reconcile” suggests that the FPS dealer owns an
  oversight or reconciliation duty that the API correctly reserves for the
  auditor.
- **Demo clarity:** the separate top-level module distracts from the FPS journey
  of receipt, authentication, distribution, and proof confirmation.

## Recommendation

1. Remove `FPS` from the top-level Trust & reconcile module.
2. Keep proof visibility inside the FPS module as a shop-scoped **Proof status**
   or **Receipts & proofs** screen/panel.
3. Scope every FPS proof-status response server-side to the FPS assignment
   derived from the authenticated identity; do not accept an arbitrary shop ID
   from the client.
4. Keep cross-module analytics, recent proof envelopes, audit alerts, and
   reconciliation with auditor/management roles.
5. Add UI navigation tests and API authorization/scope tests proving that
   FPS-101 cannot view FPS-202 or network-wide proof and trace records.

## Recommended decision

Do not keep the current **Trust & reconcile** menu entry for FPS. Preserve the
underlying trust value by presenting only assigned-shop proof status within the
FPS authentication module.

## Resolution

Implemented on 2026-07-31:

- Trust & reconcile is now restricted to Management and Auditor in the web
  module access matrix.
- FCI, Godown, DSO, BSO, and FPS no longer receive the Trust dashboard or
  Verify screens through legacy deep links.
- `GET /ledger-proofs/analytics` is restricted to auditor, management, and
  platform-admin identities.
- Operational workflow proof-status badges remain available for the records
  those roles create or receive.
