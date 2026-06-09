# Vyraj Alliance Command Console v2

Next.js App Router rebuild of the Vyraj Alliance Command Console. Apps Script v1 export tooling remains available for reference, but v2 production starts from a clean Postgres baseline.

Current v2 scope includes public Alliance Hub and Corp Portals, officer auth with HTTP-only cookies, Super Admin tools, audit logging, Attendance, Doctrine, SRP, Recruitment, Loot Splits, Corp Dashboard, and Alliance Hub summaries.

## Local Development Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` or `.env.local`.

3. Set required local values:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
AUTH_SESSION_SECRET="replace-with-a-long-random-32-character-minimum-secret"
AUTH_COOKIE_NAME="vyraj_officer_session"
SESSION_DURATION_HOURS="6"
DEV_SUPER_ADMIN_PASSWORD="VyrajDev!ChangeMe123"
# Optional one-time production baseline password override:
# SEED_SUPER_ADMIN_PASSWORD="temporary-production-setup-password"
```

4. Generate Prisma Client:

```bash
npm.cmd run prisma:generate
```

5. Run migrations locally:

```bash
npm.cmd run prisma:migrate -- --name init
```

6. Seed local data if desired:

```bash
npm.cmd run prisma:seed
```

7. Start local dev:

```bash
npm.cmd run dev
```

## Neon Setup

Create a Neon Postgres project and copy the pooled or direct connection string into `DATABASE_URL`.

Use a dedicated database/password for production. Keep local development credentials separate from production credentials when possible.

## Environment Variables

Required:

- `DATABASE_URL`: Neon/Postgres connection string.
- `AUTH_SESSION_SECRET`: long, random, production-safe secret for HMAC hashing session tokens. This must be 32+ characters and must not match any officer/admin password.
- `AUTH_COOKIE_NAME`: cookie name, usually `vyraj_officer_session`.
- `SESSION_DURATION_HOURS`: officer session duration, usually `6`.
- `DEV_SUPER_ADMIN_PASSWORD`: seed password for local/dev Super Admin accounts, or an intentional initial setup value only.
- `SEED_SUPER_ADMIN_PASSWORD`: optional clearer name for a one-time production baseline seed password. If set, it takes precedence during seeding.

Optional EVE SSO variables:

- `EVE_SSO_CLIENT_ID`
- `EVE_SSO_CLIENT_SECRET`
- `EVE_SSO_CALLBACK_URL`
- `EVE_SSO_SCOPES`
- `EVE_SSO_BASE_URL`
- `EVE_ESI_BASE_URL`
- `EVE_ESI_COMPATIBILITY_DATE`

These EVE variables are not required for the app to boot. EVE SSO identity-only
login is enabled only when required values are configured. No ESI calls are made,
no EVE tokens are stored, and manual officer login remains active. See
[EVE_SSO_SETUP.md](./EVE_SSO_SETUP.md) for the EVE developer app and Vercel
environment checklist.

Never commit real `.env` files. Production values belong in Vercel Environment Variables.

## GitHub Setup

Before pushing:

- Confirm `.env`, `.env.local`, and `.env.*.local` are not tracked.
- Confirm `.env.example` contains only placeholders.
- Confirm `npm.cmd run build` passes.
- Confirm `npm.cmd run prisma:generate` passes.

## Vercel Setup

1. Import the GitHub repository into Vercel.
2. Set the required environment variables in Vercel Project Settings.
3. Confirm the Vercel build command remains the default:

```bash
npm run build
```

4. Prisma Client generation is handled by:

```bash
npm run postinstall
```

## Required Vercel Environment Variables

Set these for Production, Preview, and Development as appropriate:

- `DATABASE_URL`
- `AUTH_SESSION_SECRET`
- `AUTH_COOKIE_NAME`
- `SESSION_DURATION_HOURS`

Set `SEED_SUPER_ADMIN_PASSWORD` or `DEV_SUPER_ADMIN_PASSWORD` only if you intentionally run the seed script for initial admin setup. Rotate seeded passwords afterward.

## Production Migration

Run production migrations against the configured production database:

```bash
npm.cmd run prisma:deploy
```

Equivalent:

```bash
npx prisma migrate deploy
```

## Production Baseline Seed

The v2 production baseline is intentionally fresh. It does not import v1 operations,
attendance, doctrine readiness submissions, SRP requests, recruitment applicants,
loot splits, loot split participants, old audit logs, or prototype test data.

Production baseline seed:

```powershell
$env:SEED_SUPER_ADMIN_PASSWORD="temporary-production-setup-password"; npm.cmd run prisma:seed:prod
```

The production baseline creates or updates only:

- Corp Registry records for `totality-squad`, `abyssal-construction-and-extraction`, `pochven-police-department`, and `striking-distance`.
- Super Admin officers `Jason Roderick` and `EmperorVeles`.
- Starter Alliance Hub content.
- The preserved starter EVE Type Lookup hull list.

It does not seed extra officers. Create future officers through Officer Management.
The setup password is temporary; rotate/reset Super Admin passwords immediately
after first login.

Local/dev seed uses the same baseline data and allows the local fallback password:

```bash
npm.cmd run prisma:seed
```

Equivalent:

```bash
npm.cmd run prisma:seed:dev
```

## Operational Data Reset

To clear local or test operational module data while preserving registry/admin
setup, use:

```powershell
$env:CONFIRM_RESET_OPERATIONAL_DATA="YES"; npm.cmd run prisma:reset:operational-data
```

This deletes only operations, attendance, doctrine fits/readiness/pilots, SRP
requests, recruitment applicants, loot splits, and loot split participants. It
preserves corps, officers, officer permissions, officer corp assignments,
Alliance Hub content, EVE Type Lookup, and audit logs. The command refuses to run
unless `CONFIRM_RESET_OPERATIONAL_DATA` is exactly `YES`.

## EVE SSO / ESI Foundations

Phase 1A/1B added database, configuration, and admin-readiness foundations for
future EVE SSO identity linking. Phase 1C adds identity-only OAuth start/callback
routes, state protection, server-side token exchange, EVE JWT validation, and
`EveIdentity` create/update.

EVE SSO verifies character identity. It creates a normal Vyraj officer session
only when that EVE identity is already linked to an active Officer. The app does
not call ESI, store EVE access tokens, store EVE refresh tokens, auto-link
officers, or grant permissions from EVE corp/alliance membership. Internal Vyraj
permissions still control access.

Phase 2A adds manual Corp EVE identity mapping in Corp Management:

- EVE corporation ID/name.
- EVE alliance ID/name.
- Future sync-enabled flag.
- System Health counts for corp EVE mapping readiness.

No ESI calls are made in Phase 2A. The sync flag is stored for future use only;
it does not sync data, route members, or grant access.

Phase 2B enriches `EveIdentity` during successful EVE SSO login using public,
unauthenticated ESI lookups for current character corporation/alliance metadata.
If public ESI enrichment fails, login still proceeds after JWT identity
validation and previous corp/alliance values are preserved.

Phase 2B does not store EVE access tokens, store refresh tokens, request new
scopes, run background sync, auto-link officers, auto-route members, or grant
permissions from EVE corporation/alliance membership.

## Deployment Checklist

Before deployment:

- `npm.cmd run build` passes.
- `npm.cmd run prisma:generate` passes.
- `.env` is not tracked.
- `.env.example` is safe.
- `DATABASE_URL` is set in Vercel.
- `AUTH_SESSION_SECRET` is set in Vercel.
- `AUTH_COOKIE_NAME` is set in Vercel.
- `SESSION_DURATION_HOURS` is set in Vercel.
- Production migration has been run.
- Seed has been run only if intentionally setting up initial admins.

After deployment:

- Open `/`.
- Open `/api/dev-health`.
- Open `/login`.
- Login as Super Admin.
- Open `/admin/super`.
- Open `/admin/officers`.
- Open `/admin/corps`.
- Open `/admin/alliance-hub`.
- Open `/admin/audit-log`.
- Open `/corp/totality-squad`.
- Open `/corp/totality-squad/attendance`.
- Open `/corp/totality-squad/doctrine`.
- Open `/corp/totality-squad/srp`.
- Confirm public/member users cannot see officer/admin navigation.
- Confirm officer/admin data is not visible while logged out.
- Confirm forms still submit.
- Confirm audit logs write.

## Rollout Note

Apps Script v1 export and validator tooling remains in the repo as optional future reference, but v1 operational data is not part of the v2 production baseline. Treat v2 as a fresh operational start after production smoke tests and officer workflow checks pass.

See [DATABASE.md](./DATABASE.md) for database setup, migration, seed, rotation, and health-check notes.
