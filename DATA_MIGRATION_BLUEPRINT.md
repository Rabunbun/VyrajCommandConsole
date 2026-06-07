# Vyraj v1 Sheets to v2 Postgres Migration Blueprint

This is a planning blueprint only. It does not define import code, upload UI,
schema changes, ESI, or new identity behavior.

## Scope

Move data from the v1 Google Apps Script / Google Sheets system into the v2
Vercel app backed by Prisma and Neon/Postgres.

Primary goals:

- Preserve v1 operational history where it maps cleanly to v2 models.
- Preserve legacy provenance using `legacySheetName`, `legacyRowNumber`,
  `legacyImportedAt`, and `LegacyImportMap`.
- Avoid overwriting production data without an explicit dry-run report.
- Keep v1 live until final smoke tests pass and final delta import is complete.

## Target Model Inventory

Current Prisma target models:

- `Corp`
- `AllianceHubContent`
- `Officer`
- `OfficerSession`
- `OfficerCorpAssignment`
- `OfficerPermission`
- `OfficerAuditLog`
- `LegacyImportMap`
- `Operation`
- `OperationAttendance`
- `SrpRequest`
- `DoctrineFit`
- `DoctrineFitReadiness`
- `DoctrinePilot`
- `RecruitmentApplicant`
- `LootSplit`
- `LootSplitParticipant`
- `EveTypeLookup`

Do not import `OfficerSession` from v1. Sessions are v2-only runtime state.

## Expected Source Sheet / Tab Inventory

Exact v1 tab names should be confirmed before implementation, but the importer
should expect aliases because Apps Script sheets often drift over time.

| v2 model | Expected v1 sheet/tab aliases |
| --- | --- |
| `Corp` | `Corp Registry`, `Corps`, `Corp Portals`, `Corporations` |
| `Officer` | `Officers`, `Admin Users`, `Officer Registry`, `Users` |
| `OfficerCorpAssignment` | `Officer Corp Assignments`, `Officer Corps`, `Officer Access`, `Officers` |
| `OfficerPermission` | `Officer Permissions`, `Permissions`, `Officer Access`, `Officers` |
| `AllianceHubContent` | `Alliance Hub Content`, `Alliance Announcements`, `Announcements`, `Hub Content` |
| `Operation` | `Operations`, `Ops`, `Fleet Ops`, `Op Calendar` |
| `OperationAttendance` | `Operation Attendance`, `Attendance`, `Fleet Attendance` |
| `DoctrineFit` | `Doctrine Fits`, `Doctrine`, `Fits` |
| `DoctrineFitReadiness` | `Doctrine Readiness`, `Fit Readiness`, `Pilot Readiness` |
| `DoctrinePilot` | `Doctrine Pilots`, `Pilot Roles`, `Pilot Doctrine Profiles` |
| `SrpRequest` | `SRP Requests`, `SRP`, `Ship Replacement` |
| `RecruitmentApplicant` | `Recruitment Applicants`, `Recruitment`, `Applicants` |
| `LootSplit` | `Loot Splits`, `Loot Split Headers`, `Payouts` |
| `LootSplitParticipant` | `Loot Split Participants`, `Loot Participants`, `Payout Participants` |
| `EveTypeLookup` | `EVE Type Lookup`, `Type Lookup`, `Ship Type Lookup` |
| `OfficerAuditLog` | `Audit Log`, `Admin Audit`, `Officer Audit Log` |

## Export Format Recommendation

Use both JSON and CSV if possible.

JSON export is preferred for the final importer because it can preserve sheet
names, row numbers, formulas-as-values metadata, arrays, nested payloads, and
raw source records without inventing column conventions. It is also better for
one export containing all tabs.

CSV per sheet is useful for human review, spreadsheet cleanup, row-count
validation, and quick diffing. CSV is weaker for multiline notes, JSON columns,
date ambiguity, formulas, and cells containing commas or line breaks.

Recommended package:

- `export.json`: canonical all-tabs export with sheet names, header row, row
  number, row values, and raw object form.
- `csv/*.csv`: one CSV per tab for audit/review.
- `manifest.json`: export timestamp, spreadsheet ID/name, tab list, row counts,
  and Apps Script exporter version.

## Cross-Cutting Import Rules

### Legacy provenance

For every imported row that maps to a model with legacy fields:

- `legacySheetName`: exact v1 tab name.
- `legacyRowNumber`: 1-based Google Sheet row number, including header offset.
- `legacyImportedAt`: import run timestamp.
- `LegacyImportMap`: one row per imported target record with:
  - `sourceSystem`: `google_apps_script`
  - `legacySheetName`
  - `legacyRowNumber`
  - `legacyKey`: stable v1 ID if present, otherwise a deterministic composite.
  - `targetModel`
  - `targetId`
  - `sourcePayload`: raw source row object.

### UUIDs

Let Postgres/Prisma generate v2 UUIDs. Do not attempt to reuse row numbers or
Apps Script IDs as primary keys. Use `LegacyImportMap` to bridge source rows to
generated UUIDs.

### Corp slug mapping

Build a `corpLookup` before importing dependent records. Match in this order:

1. Explicit v1 corp ID or slug if present.
2. Exact v2 slug.
3. Normalized ticker.
4. Normalized corp name.
5. Manually supplied mapping file.

Slug generation for new corps should be deterministic: lowercase, trim,
replace non-alphanumeric runs with `-`, trim leading/trailing `-`. Duplicate
slugs must stop the import until manually resolved.

### Missing corp IDs

Rows requiring a corp must not silently import under a default corp. If a corp
cannot be resolved, record a validation error with sheet, row, source corp
field, and suggested candidates. Import only rows with resolved corp IDs unless
the run is explicitly configured to quarantine orphan rows.

### JSON fields

`Corp.announcements` should become a string array. `Corp.enabledModules` should
be an object with these v2 keys:

- `attendance`
- `doctrine`
- `srp`
- `recruitment`
- `lootSplits`
- `dashboard`

Accept legacy alias `loot` as `lootSplits`. Malformed JSON should be repaired
only for simple cases, such as newline-delimited announcements or comma-delimited
module names. Otherwise, report and skip or default based on dry-run policy.

### Duplicates

Use deterministic natural keys before creating records:

- Corp: normalized slug.
- Officer: case-insensitive officer name.
- Operation: corp plus operation code, or corp plus normalized name/date.
- Attendance: operation plus normalized character name.
- Doctrine fit: corp plus doctrine code, or corp plus normalized doctrine name
  and ship hull.
- Doctrine readiness: corp plus doctrine fit plus normalized character name.
- SRP: corp plus character name plus killmail link, or corp plus character name
  plus ship/date/value composite.
- Recruitment: corp plus applicant/main character plus created date.
- Loot split: corp plus operation name plus created date.
- Loot participant: loot split plus normalized pilot or character.
- EVE type: type name or type ID.

Duplicates should be reported. The final importer should support `skip`,
`update`, and `fail` modes, with `fail` as the safest default for production.

### Status normalization

Normalize statuses to uppercase snake case for module status values where v2
helpers already normalize display. Prisma enums must match exactly.

Enum targets:

- `Corp.status`: `ACTIVE`, `TRIAL`, `INACTIVE`, `ARCHIVED`
- `Officer.role`: `SUPER_ADMIN`, `ALLIANCE_OFFICER`
- `Officer.status`: `ACTIVE`, `DISABLED`
- `AllianceHubContent.status`: `ACTIVE`, `DRAFT`, `EXPIRED`, `ARCHIVED`
- `AllianceHubContent.audience`: `ALL_MEMBERS`, `OFFICERS`, `SUPER_ADMINS`
- `AllianceHubContent.contentType`: `ANNOUNCEMENT`, `ALERT`, `PRIORITY`,
  `STANDING_ORDER`, `FEATURED_OP`, `NOTE`
- `AllianceHubContent.priority`: `LOW`, `NORMAL`, `HIGH`, `CRITICAL`

Common text values like `Active`, `active`, `Live`, and `Enabled` should map to
`ACTIVE` only through an explicit normalization table.

### Dates

Parse Google Sheets serial dates, ISO strings, and common US date/time strings.
All ambiguous dates should be reported in dry-run. Store valid values as JS
`Date` through Prisma. Empty optional dates become `null`.

### ISK and numbers

Strip commas, spaces, `ISK`, and currency labels. Parentheses or leading `-`
mean negative. Empty optional decimals become `null`; required decimals default
to `0` only where the Prisma model already defaults to `0`.

### Empty optional fields

Use model defaults where available. Empty required strings should fail validation
unless a safe fallback exists in the model and UI:

- Required names like `Corp.name`, `Officer.officerName`,
  `Operation.operationName`, `SrpRequest.characterName`,
  `DoctrineFit.doctrineName`, `RecruitmentApplicant.applicantName`,
  `LootSplit.operationName`, and `LootSplitParticipant.pilotName` must be
  present.

### Officer passwords

Do not import v1 password hashes directly. v2 uses salted Node `scrypt`; v1
Apps Script hashes are not compatible. Import officers as active/disabled users
with generated temporary passwords only if explicitly requested, then force an
admin-led password rotation. Prefer creating officers without exposing passwords
until the v2 Officer Management flow sets credentials.

## Field Mapping Plan

| Source area | Target model | Required mapping |
| --- | --- | --- |
| Corps | `Corp` | `slug`, `name`, `ticker`, `description`, `status`, `recruitmentStatus`, `activeMembers`, `recentOps`, `pendingSrp`, `doctrineReadinessPercent`, `announcements`, `enabledModules`, legacy fields |
| Officers | `Officer` | `officerName`, `role`, `passwordHash` from v2 hashing only, `status`, `lastLoginAt` if useful, `disabledAt`, legacy fields |
| Officer corp assignments | `OfficerCorpAssignment` | resolve `officerId` from officer name, resolve `corpId`, dedupe on unique `(officerId, corpId)` |
| Officer permissions | `OfficerPermission` | resolve `officerId`, normalize `permissionKey`, optional resolved `corpId` for corp-scoped permission, dedupe repeated permission rows |
| Alliance Hub content | `AllianceHubContent` | `contentType`, `title`, `body`, `audience`, `priority`, `status`, `startDate`, `endDate`, `createdBy`, dates, legacy fields |
| Operations | `Operation` | `corpId`, `operationCode`, `operationName`, `operationType`, `operationDate`, `fcLead`, `location`, `doctrineUsed`, `status`, `notes`, dates, legacy fields |
| Operation attendance | `OperationAttendance` | `corpId`, resolve `operationId`, `pilotName`, `characterName`, `discordName`, `roleFlown`, `shipFlown`, `rewardEligible`, `notes`, dates, legacy fields |
| Doctrine fits | `DoctrineFit` | `corpId`, `doctrineCode`, `doctrineName`, `category`, `shipHull`, `shipTypeId`, `imageUrl`, `manualImageUrl`, `fitText`, `addedBy`, `status`, `notes`, dates, legacy fields |
| Doctrine readiness | `DoctrineFitReadiness` | `corpId`, optional resolved `doctrineFitId`, `pilotName`, `characterName`, `discordName`, `readiness`, `canFlyHull`, `canUseWeapons`, `canUseTank`, `canUsePropUtility`, `missingSkills`, `notes`, dates, legacy fields |
| Doctrine pilots | `DoctrinePilot` | `corpId`, `pilotName`, `characterName`, `discordName`, role flags, `preferredShips`, `missingSkills`, `reviewer`, `status`, `notes`, dates, legacy fields |
| SRP requests | `SrpRequest` | `corpId`, `pilotName`, `characterName`, `discordName`, `shipLost`, `killmailLink`, `doctrineFleet`, `lossType`, `estimatedValue`, `requestedPayout`, `reviewer`, `status`, `notes`, dates, legacy fields |
| Recruitment applicants | `RecruitmentApplicant` | `corpId`, `applicantName`, `mainCharacter`, `discordName`, `timeZone`, `preferredContent`, `skillPoints`, `source`, `recruitmentChannel`, `recruiter`, `status`, `notes`, dates, legacy fields |
| Loot splits | `LootSplit` | `corpId`, `operationName`, `operationType`, `totalIskValue`, `corpCutPercent`, `corpCutAmount`, `srpReservePercent`, `srpReserveAmount`, `payoutPool`, `totalShares`, `createdBy`, `status`, `notes`, dates, legacy fields |
| Loot split participants | `LootSplitParticipant` | resolve `lootSplitId`, `pilotName`, `characterName`, `shares`, `payoutAmount`, `notes`, dates, legacy fields |
| EVE type lookup | `EveTypeLookup` | `typeName`, `typeId`, `category`, dates, legacy fields |
| Audit logs | `OfficerAuditLog` | optional resolved `officerId`, actor fields, optional resolved `corpId`, `corpSlug`, `corpName`, `module`, `action`, `permissionUsed`, target fields, `summary`, JSON `before`, JSON `after`, JSON `details`, `createdAt`, legacy fields |

Known permission keys:

- `allianceDashboardView`
- `allianceHubEdit`
- `allianceAnnouncementsEdit`
- `corpDetailsEdit`
- `corpDashboardView`
- `recruitmentReview`
- `lootSplitManage`
- `srpReview`
- `doctrineManage`
- `operationsManage`
- `officerManage`

Any source permission outside this list should fail validation unless manually
mapped.

## Import Tooling Recommendation

Use a CLI-first importer, with an optional admin upload page later.

Safest first implementation:

- A local CLI script run by a Super Admin/operator against a selected
  `DATABASE_URL`.
- Inputs are exported files on disk, not browser uploads.
- Always supports `--dry-run`.
- Writes a validation report before any database mutation.
- Uses Prisma transactions by phase where practical.
- Writes `LegacyImportMap` for idempotency.
- Has explicit `--mode fail|skip|update` behavior.

Why CLI first:

- Easier to run against a staging Neon branch.
- Easier to keep secrets out of the browser.
- Easier to review/export reports before production writes.
- Lower risk than adding a privileged upload UI before the migration behavior is
  proven.

Hybrid later:

- Keep the CLI as the migration engine.
- Add an admin upload/review page only after dry-run behavior is stable.
- The UI should call the same validation/import engine, not reimplement logic.

## Recommended Migration Workflow

1. Create a fresh Neon backup or branch from production.
2. Confirm current v2 deployment and `/api/dev-health`.
3. Freeze schema changes during migration rehearsal.
4. Export v1 Google Sheets to `export.json` plus CSV-per-tab.
5. Run dry-run import against a staging Neon branch.
6. Review validation report: counts, bad rows, unknown references, duplicates.
7. Fix source sheet data or create a manual mapping file.
8. Re-run dry-run until only accepted warnings remain.
9. Run final rehearsal import on staging.
10. Smoke test staging: Alliance Hub, corp portals, admin pages, module pages,
    officer login, audit log, dashboard summaries.
11. Backup production Neon.
12. Freeze v1 writes or put v1 in read-only/operator-lock mode.
13. Export final v1 data.
14. Run final dry-run against production with the final export.
15. Run final production import.
16. Run production smoke test.
17. If v1 was not fully frozen, export and import a final delta using
    `LegacyImportMap` idempotency.
18. Keep v1 read-only as rollback reference until the alliance signs off.

## Validation Checklist

Required report sections:

- Source tabs found and missing.
- Source row counts per tab.
- Rows skipped because empty.
- Rows imported per target model.
- Rows updated per target model, if update mode is enabled.
- Rows rejected per target model.
- Unknown corp references.
- Duplicate corp slugs.
- Duplicate officer names, case-insensitive.
- Duplicate natural keys per model.
- Orphan operations, attendance, SRP, doctrine, recruitment, and loot records.
- Operation attendance rows without resolvable operations.
- Loot participants without resolvable loot splits.
- Doctrine readiness rows without resolvable corp or fit.
- Bad enum values.
- Bad module status values.
- Permissions outside known permission keys.
- Missing required fields.
- Invalid dates.
- Invalid numbers or ISK amounts.
- Malformed JSON fields.
- Password rows that cannot be migrated directly.
- Audit log rows with unparseable JSON `before`, `after`, or `details`.

Production import should fail if any high-severity validation errors remain.

## Validator Manual Mapping File

The dry-run validator can use a local `migration-map.json` file to resolve legacy
v1 labels without editing the original Google Sheets export. Keep this file next
to the local export package, for example
`migration-data/v1-export/migration-map.json`. Files under `migration-data/` are
local-only and should not be committed.

Run the validator with a mapping file:

```powershell
npm.cmd run migration:validate -- --export migration-data/v1-export/export.json --manifest migration-data/v1-export/manifest.json --mapping migration-data/v1-export/migration-map.json --out migration-reports/latest
```

Example mapping file:

```json
{
  "sheetAliases": {
    "Doctrine Fit Readiness": "DoctrineFitReadiness"
  },
  "corpAliases": {
    "SK.DS": "striking-distance",
    "Striking Distance": "striking-distance",
    "Totality": "totality-squad"
  },
  "officerAliases": {},
  "operationAliases": {},
  "doctrineFitAliases": {},
  "lootSplitAliases": {}
}
```

`sheetAliases` maps a source tab name to a target Prisma model name before the
validator tries built-in aliases or fuzzy matching. The validator also includes a
built-in alias for `Doctrine Fit Readiness` to `DoctrineFitReadiness`.

`corpAliases` maps any legacy corp value, ticker, shorthand, or display name to a
known v2 corp slug found in the exported corp registry. Corp resolution tries the
exact slug, normalized slug, ticker, corp name, explicit alias, and normalized
alias. If an alias points to a slug that does not exist in the export, the report
will show a clear `invalid_corp_alias_target` error.

The other alias sections are reserved for later import phases. They are accepted
now so the file shape can remain stable.

## Recommended First Implementation Prompt

Implement a dry-run-only v1 Sheets export validator for Vyraj Alliance Command
Console v2. Do not write database records yet. Read `DATA_MIGRATION_BLUEPRINT.md`
and `prisma/schema.prisma`. Add a local CLI script that accepts an exported
`export.json` and optional CSV directory, normalizes rows for every target model,
resolves corp/officer/operation/loot split references in memory, and writes a
validation report with counts, duplicate detection, unknown references, bad
statuses, invalid dates, invalid numbers, malformed JSON, and permission-key
errors. Do not change Prisma schema, auth/session behavior, routes, server
actions, or app UI. Include sample fixture files with fake data only and tests
for normalization/validation helpers.
