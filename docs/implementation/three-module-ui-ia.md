# Three-module UI information architecture

## Scope

This change reframes the ViksitPDS web workspace as four top-level demo modules
instead of landing every operational persona on the supply-chain workbench:

1. **Supply chain** — simulated state SCM / IAeSCM custody
2. **Card & eligibility** — simulated SMART-PDS/RCMS integrity review
3. **FPS authentication** — simulated AePDS/ePoS shop issue
4. **Trust & reconcile** — ViksitPDS overview, alerts, and verification

Platform administration remains separate at `/admin`. Trust & reconcile is the
fourth workspace module for oversight; the Role Login chooser also includes
Platform admin as a separate non-PDS entry.

## Module map

| Module | Path | Existing screens | Typical personas |
| --- | --- | --- | --- |
| Supply chain | `/m/supply-chain` | workbench, lots, transfers, allocations | FCI, godown, DSO (RO), BSO |
| Card & eligibility | `/m/eligibility` | eligibility-review | DSO eligibility journey, management, auditor |
| FPS authentication | `/m/fps` | workbench, allocations, distribution | FPS dealer |
| Trust & reconcile | `/m/trust` | dashboard (sample Fabric proof analytics), stakeholders, audit-alerts, verify | auditor, management |

Legacy flat routes (`/workbench`, `/lots`, `/eligibility`, `/distribution`, and
so on) remain the canonical screen URLs. Module homes are launchpads only.

## Entry journey

`/role-login` is module-first:

1. Choose a module card.
2. Choose a Keycloak persona for that module.
3. Continue with a module return URL (`/m/...` or `/admin/overview`).

The department username `demo-department` has two journeys:

- Supply chain → Stage-II RO authorization (`/m/supply-chain`)
- Card & eligibility → eligibility officer (`/m/eligibility`)

## Defaults

| Role | Default path |
| --- | --- |
| FCI / Godown / Control Office / Block Office | `/m/supply-chain` |
| FPS | `/m/fps` |
| Auditor / Management | `/m/trust` |

Forbidden screens and modules redirect to the role’s default module home.
Operational roles see proof status alongside their own workflow records; they do
not receive the cross-system Trust & reconcile module.

## Demo script order

1. Supply chain — move stock toward FPS and open workbench actions.
2. Card & eligibility — open a synthetic case; optional mock RCMS decision.
3. FPS authentication — confirm receipt and simulate auth/distribution.
4. Trust & reconcile — inspect Overview Fabric analytics (pipeline health, module-bucketed proofs, privacy-safe envelopes), alerts, and verify views.

### Trust Overview Fabric analytics

The Trust **Overview** (`/dashboard`) loads durable proof analytics from
`GET /ledger-proofs/analytics` (PostgreSQL `ledger_outbox`, not a live Fabric
scan). It shows pipeline status counts, proof volumes for supply chain /
eligibility / FPS, event-type breakdown, and recent envelope fields
(`eventId`, `fabricTxId`, `payloadHash`, entity refs, status). Management and
Auditor can open `GET /ledger-proofs/:eventId/detail` for a privacy-safe
`proofPayload` drawer. Mock/offline mode shows an explicit empty state instead
of inventing Fabric transaction IDs.

## Mock services

See [`three-module-mock-services.md`](./three-module-mock-services.md):

- Supply chain → in-app ops + `STATE_SCM` integration fixtures (no `scm-mock` app)
- Card & eligibility → existing `apps/eligibility-mock`
- FPS authentication → `apps/epos-auth-mock` (Aadhaar-format auth simulation; hash-only)

## Out of scope

- Live UIDAI / SMART-PDS / state SCM connectivity
- Splitting workbench action engines by module
- Live Fabric world-state browsers / chaincode list-all-proofs APIs
- Fabric network resets

## Code touchpoints

- `apps/web/src/lib/modules.ts`
- `apps/web/src/pages/workspace/OverviewPage.tsx`
- `apps/web/src/components/FabricAnalyticsPanel.tsx`
- `apps/api/src/modules/proofs/proofs.service.ts`
- `apps/web/src/pages/RoleLoginPage.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/pages/workspace/ModuleHomePage.tsx`
- `apps/web/src/pages/workspace/ModuleGuard.tsx`
- `apps/web/src/pages/workspace/ScreenGuard.tsx`
- `apps/web/src/demo-model.ts` (`CONTROL_OFFICE` includes `eligibility-review`)
- `apps/epos-auth-mock/` (Aadhaar-format FPS auth mock)
- `apps/api/src/modules/auth/epos-auth-client.ts`
