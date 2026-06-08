# EVE SSO / ESI Architecture Blueprint

Reviewed: 2026-06-08

This blueprint plans EVE SSO and later ESI integration for Vyraj Alliance
Command Console v2. It intentionally does not implement code, change Prisma
schema, change auth behavior, change routes, or add UI.

Core principle:

> EVE SSO verifies identity. Vyraj Postgres records still control access,
> permissions, officer assignments, and module visibility.

## Current Auth Summary

Current files:

- `src/app/login/page.tsx`
- `src/app/auth-actions.ts`
- `src/lib/auth.ts`
- `src/lib/session.ts`
- `src/lib/permissions.ts`
- `src/lib/navigation.ts`
- `src/lib/audit.ts`
- `prisma/schema.prisma`

Current login flow:

1. `/login` renders the manual Officer Name + Password form.
2. `loginAction()` reads `officerName` and `password` from `FormData`.
3. `loginOfficer()` looks up `Officer.officerName` case-insensitively.
4. Passwords are verified with the app's local password hash helper.
5. Only `OfficerStatus.ACTIVE` officers can log in.
6. `createOfficerSession()` creates a random app session token, hashes it with
   `AUTH_SESSION_SECRET`, stores only the hash in `OfficerSession`, and sends
   the raw token only as an HTTP-only cookie.
7. Super Admins redirect to `/admin/super`; Alliance Officers redirect to `/`.
8. Login success, failed login, logout, and denied admin access are written to
   `OfficerAuditLog`.

Current session model:

- `OfficerSession` belongs to `Officer`.
- Browser cookie stores only the random raw app session token.
- Database stores only `tokenHash`.
- `getCurrentOfficerSession()` reads the HTTP-only cookie, hashes it, looks up
  the active session, verifies expiry/revocation/officer status, updates
  `lastSeenAt`, then returns a safe session view.
- Session view includes:
  - officer id/name/role/status
  - officer permission keys
  - assigned corps with id/slug/name

Current cookie handling:

- Cookie name comes from `AUTH_COOKIE_NAME` or defaults to
  `vyraj_officer_session`.
- Cookies are `httpOnly`, `sameSite: "lax"`, `path: "/"`, and `secure` in
  production.
- `AUTH_SESSION_SECRET` must be at least 32 characters before token hashing.

Current permission helpers:

- `hasPermission(session, permissionKey, corpId?)`
- Super Admin returns true for every permission.
- Alliance Officers require matching `OfficerPermission`.
- Corp-scoped module helpers also require officer assignment to the corp before
  granting officer powers:
  - `canManageOperations`
  - `canManageDoctrine`
  - `canReviewSrp`
  - `canReviewRecruitment`
  - `canManageLootSplits`
  - `canViewCorpDashboard`

Current route protection:

- Logged-out admin routes redirect to `/login`.
- Super Admin-only pages check `session.officer.role === SUPER_ADMIN`.
- Non-Super Admin officers receive Access Denied and usually write an audit
  entry.
- Public/member module reads are allowed only for ACTIVE/TRIAL corps and only
  where the module is enabled.

## Target Identity Model

EVE identity should be additive. Do not replace `Officer`, `OfficerSession`, or
manual login in the first implementation.

Conceptual identity fields:

- EVE character ID
- EVE character name
- EVE corporation ID
- EVE corporation name
- EVE alliance ID
- EVE alliance name
- linked Officer record, optional
- linked member identity, optional
- login provider type: `manual` vs `eve_sso`
- last EVE login timestamp
- last identity refresh timestamp
- token storage metadata if later needed

Important distinction:

- `Officer` remains the administrative authorization record.
- `EveIdentity` is a verified game identity record.
- A character may be a member without being an officer.
- An officer may log in manually, with EVE SSO, or both once linked.

## Proposed Schema Additions

Do not implement yet. Suggested future Prisma shapes:

```prisma
enum LoginProvider {
  MANUAL
  EVE_SSO
}

model EveIdentity {
  id                    String   @id @default(uuid()) @db.Uuid
  characterId           BigInt   @unique
  characterName         String
  corporationId         BigInt?
  corporationName       String   @default("")
  allianceId            BigInt?
  allianceName          String   @default("")
  officerId             String?  @db.Uuid
  memberCorpId          String?  @db.Uuid
  provider              LoginProvider @default(EVE_SSO)
  linkedAt              DateTime?
  lastEveLoginAt        DateTime?
  lastIdentityRefreshAt DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  officer               Officer? @relation(fields: [officerId], references: [id], onDelete: SetNull)
  memberCorp            Corp?    @relation(fields: [memberCorpId], references: [id], onDelete: SetNull)

  @@index([corporationId])
  @@index([allianceId])
  @@index([officerId])
  @@index([memberCorpId])
}
```

If storing tokens becomes necessary:

```prisma
model EveAuthToken {
  id                    String   @id @default(uuid()) @db.Uuid
  eveIdentityId          String   @unique @db.Uuid
  encryptedRefreshToken  String
  accessTokenExpiresAt   DateTime?
  scopes                 String[]
  revokedAt              DateTime?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  eveIdentity            EveIdentity @relation(fields: [eveIdentityId], references: [id], onDelete: Cascade)

  @@index([revokedAt])
}
```

Corp/ESI planning:

```prisma
model CorpEsiConfig {
  id              String   @id @default(uuid()) @db.Uuid
  corpId          String   @unique @db.Uuid
  eveCorporationId BigInt? @unique
  eveAllianceId   BigInt?
  syncEnabled     Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  corp            Corp     @relation(fields: [corpId], references: [id], onDelete: Cascade)
}

model CorpExternalStats {
  id                    String   @id @default(uuid()) @db.Uuid
  corpId                String   @unique @db.Uuid
  eveCorporationId       BigInt?
  memberCount            Int?
  killCountRecent        Int?
  lossCountRecent        Int?
  iskDestroyedRecent     Decimal? @db.Decimal(20, 2)
  iskLostRecent          Decimal? @db.Decimal(20, 2)
  lastSyncedAt           DateTime?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  corp                  Corp     @relation(fields: [corpId], references: [id], onDelete: Cascade)
}

model EsiSyncLog {
  id             String   @id @default(uuid()) @db.Uuid
  corpId         String?  @db.Uuid
  syncType       String
  status         String
  startedAt      DateTime @default(now())
  finishedAt     DateTime?
  errorCode      String   @default("")
  errorMessage   String   @default("")
  details        Json     @default("{}")

  corp           Corp?    @relation(fields: [corpId], references: [id], onDelete: SetNull)

  @@index([syncType, status])
  @@index([corpId, startedAt])
}
```

Additional possible fields:

- `Officer.eveIdentityId` or keep link only from `EveIdentity.officerId`.
- `Corp.eveCorporationId` and `Corp.eveAllianceId`, or keep external IDs in
  `CorpEsiConfig` to avoid cluttering the core registry.
- `OfficerAuditLog` can record EVE SSO login/link events. A separate
  `LoginAudit` model is optional, but reuse is simpler if payloads stay
  redacted.

## Proposed EVE SSO Login Flow

EVE SSO is OAuth 2.0. Current EVE developer docs recommend using the
authorization-code flow for web apps, validating `state`, exchanging the code on
the server, and validating JWT access tokens with EVE SSO metadata/JWKS.

Planned routes, not implemented yet:

- `GET /api/auth/eve/start`
- `GET /api/auth/eve/callback`

Flow:

1. `/login` shows a config-gated "Login with EVE" option.
2. Start route checks required env config:
   - `EVE_SSO_CLIENT_ID`
   - `EVE_SSO_CLIENT_SECRET`
   - `EVE_SSO_CALLBACK_URL`
   - optional `EVE_SSO_SCOPES`
3. Start route creates:
   - random `state`
   - optional PKCE verifier/challenge
   - short-lived, HTTP-only state cookie or database-backed OAuth state row
4. User is redirected to EVE SSO authorize endpoint with:
   - `response_type=code`
   - client id
   - registered redirect URI
   - minimal scopes
   - state
   - PKCE challenge if used
5. Callback route verifies:
   - state matches
   - callback has no OAuth error
   - code exists
6. Server exchanges code for tokens using the configured client credentials.
7. Server validates the returned JWT:
   - signature via SSO metadata/JWKS
   - issuer
   - expiry
   - audience includes app client id and EVE Online
8. Server extracts identity claims:
   - character ID from `sub` such as `CHARACTER:EVE:<id>`
   - character name from token claim
   - granted scopes
9. Server creates or updates `EveIdentity`.
10. Server optionally performs a minimal public ESI identity enrichment call:
    - character corporation ID/name
    - alliance ID/name if present
11. Server matches identity to an `Officer` only by safe rules:
    - explicit existing admin-created link preferred
    - exact character ID link if already established
    - optional first-run Super Admin review queue
    - character-name auto-match only if gated and audited
12. Server matches identity to `Corp` by configured EVE corporation ID if known.
13. Server creates a normal app session using the existing HTTP-only session
    model.
14. Redirect destination is computed from role/member context.

Session strategy:

- Keep `OfficerSession` for officers.
- Add a future general `AppSession` only if member login needs authenticated
  member state without an officer record.
- For the first coding slice, an EVE SSO identity can link to an Officer and
  then create the same `OfficerSession` as manual login.

## Routing Plan

Post-login destination:

- Super Admin -> `/admin/super`
- Alliance Officer with one assigned corp -> `/corp/[corpSlug]`
- Alliance Officer with multiple assigned corps -> `/` with officer/admin nav
- Member with known corp -> `/corp/[corpSlug]`
- Member with unknown corp -> `/` / choose corp directory
- Public user -> `/`

Future helper names:

- `getPreferredCorpForSession(session)`
- `resolvePostLoginRedirect(sessionOrIdentity)`
- `findCorpForEveIdentity(identity)`

Do not resurrect default-corp routing. If corp is unknown, route to the Alliance
Hub and let the user choose.

## Permission Plan

Hard rules:

- Super Admin keeps all access.
- Alliance Officers still require internal `OfficerPermission` records.
- Alliance Officers still require corp assignment for corp-scoped officer
  modules.
- EVE corp membership alone does not grant officer/admin powers.
- EVE alliance membership alone does not grant officer/admin powers.
- Corp membership may later grant only member-default access to enabled member
  modules.
- Public/member module safety stays as-is:
  - public corp must be ACTIVE/TRIAL
  - module must be enabled
  - officer controls require permission

Recommended authorization layering:

1. Authentication: manual officer login or EVE SSO identity.
2. Identity resolution: character/corp/alliance claims.
3. App account resolution: linked `Officer` or member identity.
4. Authorization: existing role, assignment, and permission helpers.
5. Module gating: corp status and enabled modules.

## ESI Sync Phases

### Phase 1: EVE SSO Identity Only

Goal: prove login identity safely.

- Add schema for `EveIdentity`.
- Add environment variables.
- Add disabled/config-gated Login with EVE UI.
- Add OAuth start/callback.
- Validate JWT server-side.
- Store character ID/name and login timestamp.
- Link to Officer only by explicit existing link or Super Admin action.
- No ESI data sync beyond identity token validation.

### Phase 2: Corp Identity Enrichment

Goal: map characters to known corp records.

- Store EVE corporation/alliance IDs and names.
- Add Corp Management fields for EVE corporation ID and alliance ID.
- Match identity to corp by configured EVE corporation ID.
- Route known members to their corp portal.
- Still no officer powers from membership.

### Phase 3: Corp Card Stats Sync

Goal: improve public hub/corp summary freshness.

- Add `CorpEsiConfig`, `CorpExternalStats`, and `EsiSyncLog`.
- Sync safe aggregate corp/card stats.
- Track last synced time and sync status.
- Display synced values only when fresh and configured.
- Keep manual fields as fallback.

### Phase 4: Optional Kill/Loss Stats

Goal: add limited operational context.

- Consider zKillboard or ESI-based public kill/loss sources.
- Treat stats as incomplete and advisory.
- Do not use kill/loss data for permissions.
- Cache aggressively and show last synced timestamp.

### Phase 5: Optional Scoped Corp/Member Data

Goal: deeper corp/member workflows only after trust and scopes are settled.

- Request only the scopes needed for a specific feature.
- Store refresh tokens only for identities/features that require background
  refresh.
- Add revocation and unlink flows.
- Add sync logs, retry limits, and operator-visible failures.

## Token Safety

Rules:

- Never expose EVE access tokens client-side.
- Never render tokens, refresh tokens, authorization codes, or OAuth state.
- Keep EVE client secret server-side only.
- Use `state` to prevent CSRF.
- Prefer PKCE even for web flow if convenient.
- Validate JWTs before trusting identity claims.
- Store refresh tokens only if a later phase truly needs background ESI access.
- Encrypt refresh tokens at rest before storing.
- Keep scopes minimal and feature-specific.
- Manual login remains fallback until EVE SSO is stable.
- Add System Health checks for EVE SSO config without displaying values.

Token storage plan:

- Phase 1 can avoid storing refresh tokens entirely if identity-only login does
  not need background ESI calls.
- If tokens are stored later, use an app-level encryption key distinct from
  `AUTH_SESSION_SECRET`.
- Suggested env var: `EVE_TOKEN_ENCRYPTION_KEY`.
- Rotation plan is required before production token storage.

## UI Planning

Login:

- Add "Login with EVE" to `/login`.
- Hide or disable until all required EVE SSO env vars exist.
- Keep manual officer login visible.
- Clear copy: "EVE SSO verifies character identity; internal permissions still
  control access."

Officer/Admin:

- Officer Management:
  - show linked EVE character status
  - allow Super Admin to link/unlink officer to EVE identity
  - show last EVE login timestamp
- Super Admin Console:
  - optional EVE identity review queue
- System Health:
  - EVE SSO configured/missing
  - callback URL configured
  - scopes configured
  - ESI sync status once sync exists

Corp Management:

- EVE corporation ID
- EVE corporation name
- EVE alliance ID
- EVE alliance name
- sync enabled/disabled
- last synced timestamp

Corp cards:

- last synced timestamp
- synced aggregate stats when available
- stale-data badge if sync is old or failed

## Environment Variables

Future variables:

- `EVE_SSO_CLIENT_ID`
- `EVE_SSO_CLIENT_SECRET`
- `EVE_SSO_CALLBACK_URL`
- `EVE_SSO_SCOPES`
- `EVE_SSO_BASE_URL` defaulting to Tranquility SSO
- `EVE_ESI_BASE_URL`
- `EVE_ESI_COMPATIBILITY_DATE`
- `EVE_TOKEN_ENCRYPTION_KEY` if refresh tokens are stored

Do not show values in System Health or logs.

## Vercel / Serverless Considerations

- OAuth callback is well-suited to Vercel functions.
- Background ESI sync needs a deliberate scheduler:
  - Vercel Cron
  - manual Super Admin-triggered sync
  - external worker if sync grows beyond serverless limits
- Keep sync jobs short and idempotent.
- Use cache headers from ESI where available.
- Use retry limits and write failures to `EsiSyncLog`.
- Do not make page render depend on live ESI calls.

## Risk List

- Wrong identity-to-officer mapping:
  - Mitigation: prefer explicit character ID links; avoid automatic name match
    unless gated and audited.
- Accidentally granting officer rights from corp membership:
  - Mitigation: keep `Officer`, `OfficerCorpAssignment`, and
    `OfficerPermission` as the only officer authorization sources.
- Token leakage:
  - Mitigation: server-only token exchange, no client token exposure, redact
    logs, encrypt refresh tokens if stored.
- OAuth CSRF or callback misuse:
  - Mitigation: state cookie/row, registered callback URL, short state TTL.
- ESI downtime or rate limits:
  - Mitigation: cache, retry later, show stale data, keep manual/admin fields.
- Vercel serverless execution constraints:
  - Mitigation: small sync batches, cron-friendly jobs, no long page-time sync.
- Sync job scheduling complexity:
  - Mitigation: start with manual sync or one low-frequency cron.
- zKillboard/kill data incompleteness:
  - Mitigation: label as advisory, avoid permission/business-critical decisions.
- Scope creep:
  - Mitigation: identity-only first; add scopes only per feature.
- Manual login breakage:
  - Mitigation: keep current manual login and OfficerSession flow intact.

## Recommended First Coding Prompt

Implement Phase 1 foundations for EVE SSO identity/linking only. Do not call ESI
yet and do not change existing manual officer login behavior. Add proposed
Prisma schema for `EveIdentity` and a minimal provider enum. Add env-var checks
for EVE SSO client ID/secret/callback/scopes. Add a config-gated disabled
"Login with EVE" button on `/login` that clearly indicates EVE SSO is not active
until configured. Add System Health EVE SSO config status without displaying
secret values. Do not implement OAuth start/callback yet unless explicitly
requested after schema review.

## References

- EVE Developer Documentation, Single Sign-On:
  https://developers.eveonline.com/docs/services/sso/
- EVE Developer Documentation, ESI overview:
  https://developers.eveonline.com/docs/services/esi/overview/
- ESI docs note on validating EVE SSO JWT tokens:
  https://docs.esi.evetech.net/docs/sso/validating_eve_jwt.html
