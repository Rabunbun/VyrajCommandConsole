import { decodeSavedFittingSnapshotV1 } from "./snapshot";
import {
  SAVED_FITTING_SNAPSHOT_VERSION,
  type DecodedSavedFittingSnapshot,
  type SavedFittingDomainResult,
  type VersionedSavedFittingSnapshot
} from "./types";

export type SavedFittingMigration = (snapshot: unknown) => unknown;

const productionMigrations = new Map<number, SavedFittingMigration>();

export function decodeSavedFittingSnapshot(
  input: VersionedSavedFittingSnapshot
): SavedFittingDomainResult<DecodedSavedFittingSnapshot> {
  return migrateSavedFittingSnapshot(input);
}

export function migrateSavedFittingSnapshot(
  input: VersionedSavedFittingSnapshot
): SavedFittingDomainResult<DecodedSavedFittingSnapshot> {
  const migrated = runSequentialSavedFittingMigrations(
    input,
    SAVED_FITTING_SNAPSHOT_VERSION,
    productionMigrations
  );

  if (!migrated.ok) {
    return migrated;
  }

  const decoded = decodeSavedFittingSnapshotV1(migrated.value.snapshot);

  if (!decoded.ok) {
    return decoded;
  }

  return {
    diagnostics: decoded.diagnostics,
    ok: true,
    value: {
      snapshot: decoded.value,
      snapshotVersion: SAVED_FITTING_SNAPSHOT_VERSION
    }
  };
}

/**
 * Runs one pure migration per version boundary. There are intentionally no
 * production migrations yet; future V2 work adds only the real V1 -> V2 step.
 */
export function runSequentialSavedFittingMigrations(
  input: VersionedSavedFittingSnapshot,
  targetVersion: number,
  migrations: ReadonlyMap<number, SavedFittingMigration>
): SavedFittingDomainResult<VersionedSavedFittingSnapshot> {
  if (
    !Number.isSafeInteger(input.snapshotVersion) ||
    input.snapshotVersion <= 0 ||
    !Number.isSafeInteger(targetVersion) ||
    targetVersion <= 0 ||
    input.snapshotVersion > targetVersion
  ) {
    return invalidVersion(input.snapshotVersion, targetVersion);
  }

  let snapshotVersion = input.snapshotVersion;
  let snapshot = structuredClone(input.snapshot);

  while (snapshotVersion < targetVersion) {
    const migrate = migrations.get(snapshotVersion);

    if (!migrate) {
      return {
        diagnostics: [
          {
            code: "MIGRATION_MISSING",
            message: `No saved-fitting migration exists for V${snapshotVersion} -> V${snapshotVersion + 1}.`,
            path: "snapshotVersion",
            severity: "error"
          }
        ],
        ok: false,
        value: null
      };
    }

    try {
      snapshot = structuredClone(migrate(structuredClone(snapshot)));
      snapshotVersion += 1;
    } catch {
      return {
        diagnostics: [
          {
            code: "MIGRATION_FAILED",
            message: `Saved-fitting migration V${snapshotVersion} -> V${snapshotVersion + 1} failed.`,
            path: "snapshot",
            severity: "error"
          }
        ],
        ok: false,
        value: null
      };
    }
  }

  return {
    diagnostics: [],
    ok: true,
    value: { snapshot, snapshotVersion }
  };
}

function invalidVersion(
  snapshotVersion: number,
  targetVersion: number
): SavedFittingDomainResult<never> {
  return {
    diagnostics: [
      {
        code: "INVALID_SNAPSHOT_VERSION",
        message:
          snapshotVersion > targetVersion
            ? `Snapshot version ${snapshotVersion} is newer than supported version ${targetVersion}.`
            : `Snapshot version ${snapshotVersion} is invalid.`,
        path: "snapshotVersion",
        severity: "error"
      }
    ],
    ok: false,
    value: null
  };
}
