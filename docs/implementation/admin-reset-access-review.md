# Admin reset access review

## Scope

This note explains why **All commodities (full reset)** is disabled for a user
who signed in with the `platform-admin` role.

## Evidence

- `apps/web/src/pages/admin/AdminToolsPage.tsx` enables the reset control only
  when the API is online and the current token contains `demo-reset`.
- `apps/api/src/modules/admin/admin.controller.ts` protects
  `POST /admin/reset` with `@Roles('demo-reset')`.
- The same controller also requires `PDS_ALLOW_RESET=true`; otherwise it
  returns `403 Demo reset is disabled`.
- `docker-compose.yml` and `.env.example` default `PDS_ALLOW_RESET` to `false`.
- `scripts/iam/bootstrap-keycloak.sh` creates `platform-admin` and `demo-reset`
  as separate realm roles and separate demo users.

## Finding

The disabled control is intentional least-privilege behavior, not a commodity
selection problem. `platform-admin` grants access to application
administration views but does not imply permission to destroy and reseed demo
operational data.

The web control has three disable conditions:

1. the API is offline;
2. a reset is already in progress;
3. the access token does not contain `demo-reset`.

For a normally loaded Platform Admin screen, the third condition is the likely
cause. The page renders **The independent demo-reset role is required** below
the control.

There is a second, server-side safety gate. If an authorized `demo-reset`
operator reaches the endpoint while `PDS_ALLOW_RESET` is not exactly `true`,
the API still rejects the reset. This server flag does not currently disable
the button in advance because the web health/context response does not expose
reset availability.

## Authorized ways to enable a controlled reset

- Sign in as the dedicated `demo-reset` operator, or have an IAM administrator
  deliberately add `demo-reset` to the intended operator's Keycloak roles.
- Start/recreate the API with `PDS_ALLOW_RESET=true`.
- Sign out and sign in again after a role assignment so the new access token
  carries `demo-reset`.

Do not make `platform-admin` automatically imply `demo-reset`. Keeping the
roles independent reduces accidental destructive resets. If the current UX is
too surprising, improve the page by displaying both prerequisites explicitly:
**Reset role: missing/present** and **Server reset switch:
disabled/enabled/unknown**.

## Operational caution

A full reset clears and reseeds controlled demo operational data. It is not a
Fabric-network bootstrap and does not erase the Fabric channel ledger. The API
emits a new reset series and proof events so Fabric identities are not reused.
Run the live lifecycle afterward only when reset/reseed has been explicitly
authorized, and verify that every resulting outbox row reaches `COMMITTED`.

