# Vyraj Alliance Command Console v2

Next.js App Router migration of the Vyraj Alliance Command Console. Apps Script v1 remains the live fallback tool during v2 rollout.

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

Set `DEV_SUPER_ADMIN_PASSWORD` only if you intentionally run the seed script for initial admin setup. Rotate seeded passwords afterward.

## Production Migration

Run production migrations against the configured production database:

```bash
npm.cmd run prisma:deploy
```

Equivalent:

```bash
npx prisma migrate deploy
```

## Seeding

Local seed:

```bash
npm.cmd run prisma:seed
```

The seed script may create or update the starter Super Admin users:

- `Jason Roderick`
- `EmperorVeles`

Use `DEV_SUPER_ADMIN_PASSWORD` intentionally. Do not leave production users on the placeholder password.

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

Keep Apps Script v1 live during the initial Vercel rollout. Treat v2 as the staged replacement until production smoke tests, officer workflows, and rollback expectations are verified.

See [DATABASE.md](./DATABASE.md) for database setup, migration, seed, rotation, and health-check notes.
