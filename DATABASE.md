# Database and Deployment Notes

Vyraj Alliance Command Console v2 uses Postgres through Prisma. Google Sheets remains the live v1 system during migration, but it is not the long-term primary database for v2.

## Required Environment

Create a local `.env` or `.env.local` from `.env.example`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
AUTH_SESSION_SECRET="replace-with-a-long-random-32-character-minimum-secret"
AUTH_COOKIE_NAME="vyraj_officer_session"
SESSION_DURATION_HOURS="6"
DEV_SUPER_ADMIN_PASSWORD="VyrajDev!ChangeMe123"
```

Do not commit `.env` files or production secrets.

`DATABASE_URL` should point to Neon/Postgres.

`AUTH_SESSION_SECRET` is used to HMAC-hash random session tokens before they are stored in Postgres. The raw token is only sent to the browser as an HTTP-only cookie. Use a long random value and do not reuse an officer/admin password.

Officer passwords are stored with a salted Node.js `scrypt` hash. This does not preserve the old Apps Script SHA-256 format.

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

## Seed Sample Data

```bash
npm.cmd run prisma:seed
```

The seed script creates sample corps, starter Alliance Hub content, a small EVE type lookup set, and the starter Super Admin officers:

- `Jason Roderick`
- `EmperorVeles`

By default both dev Super Admin accounts use:

```text
VyrajDev!ChangeMe123
```

Override this before seeding:

```bash
DEV_SUPER_ADMIN_PASSWORD="your-local-only-password" npm.cmd run prisma:seed
```

Warning: the seed script may create or update the starter Super Admin password hashes depending on environment values. Run seeds in production only when intentionally setting up initial admins, then rotate those passwords.

## Reset Dev Super Admin Password Safely

1. Set a temporary local seed password:

```bash
DEV_SUPER_ADMIN_PASSWORD="new-temporary-local-password" npm.cmd run prisma:seed
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
