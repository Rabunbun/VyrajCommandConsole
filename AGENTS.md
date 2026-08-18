# Vyraj Command Console Agent Instructions

## Project

Vyraj Command Console is a production Next.js application for EVE Online alliance/corporation operations.

Current core stack:

- Next.js 16 App Router
- React 19
- TypeScript with strict mode
- Prisma 6
- PostgreSQL / Neon
- Tailwind CSS v4
- npm
- Vercel deployment

Primary source directory: `src/`

App Router: `src/app/`

Shared application logic: `src/lib/`

Shared components: `src/components/`

Prisma schema: `prisma/schema.prisma`

## General Development Rules

When implementing tasks:

1. Make the smallest reasonable change that satisfies the request.
2. Do not refactor unrelated code.
3. Do not rename, reorganize, or rewrite existing systems unless explicitly requested.
4. Prefer existing project conventions over introducing new architectural patterns.
5. Reuse existing shared components and helpers when appropriate.
6. Avoid adding dependencies unless the task explicitly requires one or there is a strong technical reason.
7. If a dependency appears necessary but was not explicitly authorized, report the need before adding it.
8. Do not expose secrets, tokens, cookie values, or environment-variable contents.
9. Preserve strict TypeScript correctness.
10. Do not suppress TypeScript, ESLint, or build errors merely to make validation pass.

## Protected Systems

The following systems are considered protected.

Do not modify them unless the task explicitly requires modification:

- authentication
- authorization
- officer sessions
- member/EVE identity sessions
- session cookies
- EVE SSO OAuth flow
- EVE SSO callback behavior
- Hard Lockdown route policy
- corporation identity matching
- permissions
- global application layout
- global navigation visibility rules
- environment variable handling
- production deployment configuration
- existing Doctrine behavior
- existing SRP behavior

Important protected files include:

- `src/lib/session.ts`
- `src/lib/auth.ts`
- `src/lib/corp-portal-access.ts`
- `src/lib/route-policy.ts`
- `src/lib/permissions.ts`
- `src/app/layout.tsx`
- `prisma/schema.prisma`

Protected does not mean these files can never change. It means changes require explicit task scope and should never happen incidentally.

## Authentication and Access

Reuse existing authentication and authorization helpers.

Do not create parallel authentication systems.

Do not introduce new session cookies when an existing Vyraj session mechanism is appropriate.

Do not weaken access controls for development convenience.

Public EVE/ESI information and authenticated/private ESI information must remain conceptually separated.

Never log EVE access tokens, refresh tokens, application secrets, session secrets, or authentication cookies.

## Database and Prisma Rules

Treat the Prisma schema as protected.

Do not:

- modify `prisma/schema.prisma`
- create migrations
- deploy migrations
- reset databases
- seed or delete production-like data

unless the current task explicitly authorizes database changes.

When schema work is explicitly authorized:

1. Keep schema changes narrowly scoped.
2. Preserve existing naming and relationship conventions.
3. Explain every new model and relationship.
4. Do not delete or rename existing fields without explicit instruction.
5. Generate Prisma Client after schema changes.
6. Do not execute destructive database operations.

## Next.js Conventions

Use the existing App Router architecture.

Prefer:

- Server Components for initial server-side data loading
- Client Components only where browser-side interaction or state is required
- Server Actions for application mutations when consistent with surrounding code
- Route Handlers for API-style boundaries when appropriate
- existing `src/lib` helpers for database/service logic

Avoid turning entire route trees into Client Components unnecessarily.

Keep server-only data and secrets out of client bundles.

## UI Conventions

Vyraj uses an existing visual language referred to as **Abyssal Command Dark**.

Before creating new general-purpose visual primitives, inspect and reuse existing project patterns where appropriate.

Existing reusable patterns include:

- `ModuleTile`
- `ModuleIcon`
- `MetricChip`
- `StatusPip`
- `.data-card`
- `.form-panel`
- `.section-stack`
- `.badge`
- existing EVE ship image handling

New components are appropriate when a feature has genuinely new interaction requirements.

Do not globally redesign Vyraj while implementing an isolated feature.

## Fitting Bay

A new major application area named **Fitting Bay** is being developed.

Initial route: `src/app/fitting/`

Expected supporting areas:

- `src/components/fitting/`
- fitting-specific logic under an appropriate `src/lib` location

The initial Fitting Bay is a general workspace and should not be assumed to belong to a particular corporation or doctrine.

Future capabilities may include:

- ship selection
- fitting slots
- modules
- charges
- rigs
- subsystems
- drones/fighters
- CPU
- powergrid
- calibration
- ship statistics
- implants
- boosters
- skill profiles
- saved fits
- EFT import/export
- EVE Static Data Export integration
- ESI integration
- advanced fitting calculations
- doctrine integration

Do not implement future capabilities merely because they are listed here.

Only implement capabilities explicitly requested by the current task.

## Fitting Bay Architectural Boundaries

Keep these concerns separate:

### Presentation

React components responsible for displaying and interacting with fittings.

### Fitting State

The representation of the currently edited fit.

### Static EVE Data

Ships, modules, charges, attributes, effects, dogma data, and related information derived from CCP static data.

Static fitting data should eventually be cached or stored appropriately.

Do not design Fitting Bay around live ESI requests during page rendering.

### Calculation Engine

Advanced EVE fitting calculations must remain isolated behind a clear interface.

The UI should not directly encode complicated EVE Dogma mathematics.

The eventual implementation may use:

- TypeScript
- a Python service
- Eos
- another dedicated fitting engine

Do not couple presentation components to a specific calculation-engine implementation prematurely.

The UI should eventually consume a stable fitting calculation interface rather than knowing how calculations are performed.

### Persistence

Saved fitting persistence should remain separate from live editing state.

Do not add database persistence until explicitly requested.

### Character Data

Skill profiles, implants, boosters, and authenticated ESI character information are separate concepts from static EVE item data.

Do not combine them into one undifferentiated data model.

## Existing EVE Data

The existing EVE type cache and lookup systems primarily support ship metadata and current application features.

Do not assume the existing EVE lookup system contains sufficient data for a full fitting engine.

Do not overload existing Doctrine or SRP lookup code with fitting-specific Dogma responsibilities.

A richer static-data subsystem may be introduced later.

## Fitting Calculation Rule

Never approximate complicated EVE Online fitting behavior merely to make a feature appear complete.

If accurate behavior requires information or engine functionality that does not yet exist:

- isolate the missing calculation
- use clearly labeled temporary/mock values only when explicitly authorized
- report the limitation

Accuracy is more important than pretending advanced fitting calculations are complete.

## Testing and Validation

For normal application changes, run the relevant project validation commands before declaring the task complete.

Baseline commands:

```bash
npm.cmd run prisma:generate
npm.cmd run lint
npm.cmd run build
```

When interactive behavior is changed, run the development server when practical:

```bash
npm.cmd run dev
```

For EVE ship lookup/static ship metadata work, also consider:

```bash
npm.cmd run eve:refresh-ship-types
```

Only run database deployment commands when explicitly required.

Do not run:

```bash
npm.cmd run prisma:deploy
```

unless the task explicitly authorizes schema deployment.

There is currently no formal automated test suite.

When substantial deterministic fitting logic is introduced, prefer adding focused automated tests rather than relying exclusively on manual validation.

## Completion Report

At the end of implementation tasks, report:

1. What changed.
2. Files added.
3. Files modified.
4. Validation commands run.
5. Validation results.
6. Any assumptions made.
7. Any known limitations.
8. Any follow-up work intentionally left out of scope.

Do not claim functionality was tested if it was not actually tested.

## Stop Conditions

Stop and report instead of improvising if completing a task unexpectedly requires:

- changing authentication architecture
- changing session behavior
- weakening permissions
- modifying protected systems outside the stated task
- destructive database operations
- adding an unexpected major dependency
- changing the deployment architecture
- making major unrelated refactors

A focused task should remain focused.
