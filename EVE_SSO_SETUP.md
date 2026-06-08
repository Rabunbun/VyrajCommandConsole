# EVE SSO Setup Notes

Phase 1A/1B status: EVE SSO is not active yet.

Manual officer login remains the only active login method. The `Login with EVE`
button is intentionally disabled until OAuth start/callback routes are
implemented in a later phase.

## Security Principle

EVE SSO verifies character identity. Vyraj Postgres records still control access,
permissions, officer assignments, corp assignments, and module visibility. EVE
corporation or alliance membership must not grant officer/admin access by
itself.

## Future Environment Variables

Required before OAuth can be enabled:

- `EVE_SSO_CLIENT_ID`
- `EVE_SSO_CLIENT_SECRET`
- `EVE_SSO_CALLBACK_URL`

Optional/readiness variables:

- `EVE_SSO_SCOPES`
- `EVE_SSO_BASE_URL`
- `EVE_ESI_BASE_URL`
- `EVE_ESI_COMPATIBILITY_DATE`

These variables are optional in Phase 1A/1B. The app should boot and manual login
should work when they are missing.

## EVE Developer App Checklist

1. Create or open the EVE developer application.
2. Record the client ID for `EVE_SSO_CLIENT_ID`.
3. Store the client secret in `EVE_SSO_CLIENT_SECRET`.
4. Configure the callback URL in the EVE developer app.
5. Set `EVE_SSO_CALLBACK_URL` to the exact same callback URL.
6. In production, use the deployed Vercel domain for the callback URL.
7. In local development, use localhost only if the EVE developer app allows it,
   or create a separate development EVE app.
8. Keep scopes minimal. Identity-only login should start with no extra ESI
   scopes unless a later feature explicitly needs them.

Do not display the client secret or callback URL in application UI. System Health
should only show configured/missing status.

## Vercel Environment Checklist

Set future EVE SSO values in Vercel Project Settings for the environments where
OAuth will eventually be enabled:

- Production
- Preview, if testing EVE SSO on preview deployments
- Development, if using Vercel-pulled env values locally

After updating Vercel environment variables, redeploy or restart the app so
server functions see the new values.

## Current Non-Goals

Phase 1A/1B does not:

- implement `/api/auth/eve/start`
- implement `/api/auth/eve/callback`
- exchange OAuth authorization codes
- validate EVE JWTs
- call ESI
- store EVE access tokens
- store EVE refresh tokens
- auto-link officers
- grant permissions from EVE identity
- change manual officer login
- change existing app sessions

No EVE tokens are stored in Phase 1A/1B.
