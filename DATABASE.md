# Database and Deployment Notes

Vyraj Alliance Command Console v2 uses Postgres through Prisma. Google Sheets v1
export tooling remains available for reference, but production v2 starts from a
clean baseline instead of importing old operational test data.

## Required Environment

Create a local `.env` or `.env.local` from `.env.example`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
AUTH_SESSION_SECRET="replace-with-a-long-random-32-character-minimum-secret"
AUTH_COOKIE_NAME="vyraj_officer_session"
SESSION_DURATION_HOURS="6"
DEV_SUPER_ADMIN_PASSWORD="VyrajDev!ChangeMe123"
# Optional one-time production baseline password override:
# SEED_SUPER_ADMIN_PASSWORD="temporary-production-setup-password"
```

Do not commit `.env` files or production secrets.

`DATABASE_URL` should point to Neon/Postgres.

`AUTH_SESSION_SECRET` is used to HMAC-hash random session tokens before they are stored in Postgres. The raw token is only sent to the browser as an HTTP-only cookie. Use a long random value and do not reuse an officer/admin password.

Officer passwords are stored with a salted Node.js `scrypt` hash. This does not preserve the old Apps Script SHA-256 format.

EVE SSO environment variables are optional for boot, manual login, migrations,
and builds. EVE SSO identity-only login is enabled only when the required EVE
SSO values are configured.

## Install

```bash
npm install
```

The `postinstall` script runs Prisma Client generation:

```bash
npm run postinstall
```

## Generate Prisma Client

```bash
npm.cmd run prisma:generate
```

## Local Migration

For local development:

```bash
npm.cmd run prisma:migrate -- --name init
```

This creates or updates the v2 schema in the configured development database.

## Production Migration

For deployed environments, use Prisma migrate deploy:

```bash
npm.cmd run prisma:deploy
```

Equivalent:

```bash
npx prisma migrate deploy
```

Run this against the production `DATABASE_URL` before expecting the deployed app to use new tables or columns.

## Fresh Production Baseline Seed

The v2 production baseline is intentionally clean. It does not import v1
operations, attendance, doctrine readiness submissions, SRP requests,
recruitment applicants, loot splits, loot split participants, old audit logs, or
prototype/test rows.

Run the production baseline against the intended production `DATABASE_URL`:

```powershell
$env:SEED_SUPER_ADMIN_PASSWORD="temporary-production-setup-password"; npm.cmd run prisma:seed:prod
```

The production baseline creates or updates only:

- Corp Registry records:
  - `totality-squad`
  - `abyssal-construction-and-extraction`
  - `pochven-police-department`
  - `striking-distance`
- Starter Super Admin officers:
  - `Jason Roderick`
  - `EmperorVeles`
- Starter Alliance Hub content.
- The preserved starter EVE Type Lookup hull list.

It does not create extra officers. Create future officers through Officer
Management after logging in as a Super Admin.

The production seed refuses to use the default dev password. The setup password
is temporary; rotate/reset Super Admin passwords immediately after first login.

## Local Dev Seed

```bash
npm.cmd run prisma:seed
```

Equivalent:

```bash
npm.cmd run prisma:seed:dev
```

The local/dev seed uses the same baseline records and may create or update the starter Super Admin officers:

- `Jason Roderick`
- `EmperorVeles`

By default both dev Super Admin accounts use:

```text
VyrajDev!ChangeMe123
```

Override this before seeding:

```powershell
$env:DEV_SUPER_ADMIN_PASSWORD="your-local-only-password"; npm.cmd run prisma:seed
```

Warning: the seed script may create or update starter Super Admin password hashes depending on environment values. Run seeds in production only when intentionally setting up initial admins, then rotate those passwords.

## Reset Operational Test Data

Use this only when you intentionally want to clear module/test operations data
without removing registry or admin setup:

```powershell
$env:CONFIRM_RESET_OPERATIONAL_DATA="YES"; npm.cmd run prisma:reset:operational-data
```

The reset command first prints row counts, then deletes only:

- `OperationAttendance`
- `Operation`
- `DoctrineFitReadiness`
- `DoctrinePilot`
- `DoctrineFit`
- `SrpRequest`
- `RecruitmentApplicant`
- `LootSplitParticipant`
- `LootSplit`

It preserves corps, officers, officer permissions, officer corp assignments,
Alliance Hub content, EVE Type Lookup, and audit logs. It refuses to run unless
`CONFIRM_RESET_OPERATIONAL_DATA` is exactly `YES`, and it never runs from
postinstall, build, deploy, or seed scripts.

## EVE SSO Identity Foundation

Phase 1A adds the `LoginProvider` enum and `EveIdentity` table for EVE SSO
identity/linking support. Phase 1B adds clearer System Health readiness checks
and admin setup documentation. Phase 1C adds identity-only OAuth start/callback,
state validation, server-side authorization-code exchange, JWT validation, and
`EveIdentity` create/update. The table can store verified EVE character,
corporation, and alliance identity metadata, plus optional links to an internal
`Officer` and member `Corp`.

Phase 2A adds `CorpEveIdentityConfig` for manual Corp Registry mapping to EVE
corporation/alliance IDs and names, plus a stored future `syncEnabled` flag.
This config is edited through Corp Management and summarized in System Health.
Phase 2B refreshes `EveIdentity` corporation/alliance metadata during EVE SSO
login using public, unauthenticated ESI lookups after the EVE JWT identity is
validated.

Manual officer login remains active. EVE SSO creates officer access only when a
verified identity is already linked to an active Officer. No ESI calls are made,
no EVE access or refresh tokens are stored, no officers are auto-linked, and no
permissions are granted from EVE identity or EVE corp/alliance membership.

Phase 2B still does not store EVE tokens, request new scopes, run background
sync, sync corp stats, auto-route members, or auto-grant officer/admin access.
Public ESI enrichment is non-authoritative for access. When a character's EVE
corporation ID matches `CorpEveIdentityConfig.eveCorporationId`,
`EveIdentity.memberCorpId` may be updated as informational future routing
foundation only.

Phase 2C extends `CorpEveIdentityConfig` with a saved public ESI corporation
profile cache: EVE ticker, CEO, member count, tax rate, founding date, public
description, URL, public sync timestamp/status/error, and refreshed alliance
metadata. Super Admins refresh this manually from Corp Management. Public pages
read stored values only and do not call ESI during render.

Phase 2C still does not store EVE access tokens, store refresh tokens, request
new scopes, call authenticated corporation/director ESI, auto-route members, or
grant permissions from EVE profile data.

Phase 2C.5 extends `EveTypeLookup` for cached ship profile metadata used by
Doctrine selection: EVE Type ID, type name, group name, category name, generated
render/icon URLs, published status, and refresh timestamp. Populate or refresh
the full published EVE Ship category with:

```bash
npm.cmd run eve:refresh-ship-types
```

The refresh uses public, unauthenticated ESI and writes only cached lookup rows.
Normal app pages read saved rows and do not call ESI during render.

Phase 2C.5 also adds Super Admin-only officer deletion guardrails. Deletion is
blocked for self-delete, the last active Super Admin, and officers linked to an
EVE identity. Allowed deletion removes only the officer plus officer-owned
sessions, permissions, and corp assignments; corps, `EveIdentity` rows, and
audit logs are preserved.

## Phase 2C.6 Operational Checklist

After applying migrations in an environment:

```bash
npm.cmd run prisma:deploy
npm.cmd run eve:refresh-ship-types
```

Confirm these routes before moving on to Smart SRP or identity-aware member
landing:

- `/admin/system-health`
- `/admin/officers`
- `/admin/corps`
- `/corp/[corpId]/doctrine`
- `/`

System Health should show cached ship type rows and a recent lookup refresh.
Doctrine should allow cached ship selection without making ESI calls during page
render.

See [EVE_SSO_SETUP.md](./EVE_SSO_SETUP.md) for the future EVE developer app,
callback URL, and Vercel environment variable checklist.

Apply the schema foundation in environments with:

```bash
npm.cmd run prisma:deploy
```

Then regenerate Prisma Client when developing locally:

```bash
npm.cmd run prisma:generate
```

## Reset Dev Super Admin Password Safely

1. Set a temporary local seed password:

```powershell
$env:DEV_SUPER_ADMIN_PASSWORD="new-temporary-local-password"; npm.cmd run prisma:seed
```

2. Login with the temporary password.
3. Use Officer Management to set or rotate account access as needed.
4. Do not keep shared placeholder passwords in production.

## Rotate Neon Database Password

1. In Neon, rotate or create a new database role/password.
2. Update `DATABASE_URL` in Vercel Environment Variables.
3. Update local `.env.local` if needed.
4. Redeploy or restart the app so server functions use the new value.
5. Confirm `/api/dev-health` reports database connected.

## Rotate AUTH_SESSION_SECRET

1. Generate a new long random secret.
2. Update `AUTH_SESSION_SECRET` in Vercel Environment Variables.
3. Redeploy or restart the app.
4. Existing officer sessions will be rejected because token hashes can no longer be recomputed with the old secret.
5. Officers should log in again.

## Prisma Studio

```bash
npm.cmd run db:studio
```

## Dev Health

Start the app:

```bash
npm.cmd run dev
```

Then check:

```text
http://localhost:3000/api/dev-health
```

Expected without `DATABASE_URL`:

```json
{
  "ok": true,
  "database": {
    "configured": false,
    "status": "not_configured"
  }
}
```

Expected with a reachable `DATABASE_URL`:

```json
{
  "ok": true,
  "database": {
    "configured": true,
    "status": "connected"
  }
}
```

If `DATABASE_URL` is present but the database cannot be reached, the endpoint returns `ok: false` with the database error message.
