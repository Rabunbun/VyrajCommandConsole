# EVE SSO Setup Notes

Phase 2B status: EVE SSO identity-only login is available when required
configuration is present. EVE login also performs best-effort public enrichment
of the verified character's current corporation/alliance identity.

Manual officer login remains active. `Login with EVE` verifies character
identity only; it creates a normal Vyraj officer session only when the verified
EVE identity is already explicitly linked to an active Officer record.

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

These variables remain optional for app boot. Manual login works when they are
missing. `Login with EVE` is enabled only when the required variables are
present.

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

Phase 1C implements:

- `/api/auth/eve/start`
- `/api/auth/eve/callback`
- OAuth state protection with an HTTP-only cookie
- server-side authorization-code exchange
- EVE JWT validation
- `EveIdentity` create/update for verified characters
- normal OfficerSession creation for identities already linked to active
  Officers
- unlinked identity explanation state for verified characters without linked
  officer access

Phase 1C does not:

- call ESI
- store EVE access tokens
- store EVE refresh tokens
- auto-link officers
- grant permissions from EVE identity
- change manual officer login
- change existing app sessions

No EVE tokens are stored in Phase 1C.

## Corp EVE Identity Mapping

Phase 2A adds manual Corp EVE identity configuration in Corp Management:

- EVE corporation ID/name
- EVE alliance ID/name
- future `syncEnabled` flag
- optional future verification timestamp storage

This is manual registry metadata only. Phase 2A does not call ESI, does not
store EVE access or refresh tokens, does not sync corp stats, does not auto-route
members, and does not grant officer/admin access from EVE corporation or
alliance membership. The `syncEnabled` flag is stored only so a later ESI phase
can decide which configured corps are eligible for sync.

## Character Corp/Alliance Enrichment

Phase 2B refreshes `EveIdentity` corporation/alliance fields during successful
EVE SSO login using public, unauthenticated ESI character/corporation/alliance
lookups. If public ESI is unavailable, login continues after the EVE JWT identity
is verified, and prior stored corp/alliance fields are preserved.

Phase 2B still does not store access tokens, store refresh tokens, request new
scopes, run background sync, auto-link officers, grant permissions, or auto-route
members. If a character's corporation ID matches a manually configured
`CorpEveIdentityConfig`, `EveIdentity.memberCorpId` may be updated as
informational future routing foundation only.
