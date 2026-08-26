import { decodeSavedFittingSnapshot } from "./migrate";
import {
  SAVED_FITTING_SNAPSHOT_VERSION,
  type SavedFittingSnapshotDiagnostic,
  type SavedFittingSnapshotV1
} from "./types";

export const SAVED_FITTING_NAME_MAX_LENGTH = 120;

export type SavedFittingMetadataInput = {
  hullTypeId: number;
  name: unknown;
  revision: number;
  snapshot: unknown;
  snapshotVersion: number;
};

export type SavedFittingMetadataIssueCode =
  | "HULL_TYPE_MISMATCH"
  | "INITIAL_REVISION_REQUIRED"
  | "INVALID_HULL_TYPE_ID"
  | "INVALID_NAME"
  | "INVALID_REVISION"
  | "NAME_TOO_LONG"
  | "SNAPSHOT_INVALID"
  | "SNAPSHOT_VERSION_MISMATCH";

export type SavedFittingMetadataIssue = {
  code: SavedFittingMetadataIssueCode;
  message: string;
  path: string;
};

export type ValidatedSavedFittingMetadata = {
  hullTypeId: number;
  name: string;
  revision: number;
  snapshot: SavedFittingSnapshotV1;
  snapshotVersion: typeof SAVED_FITTING_SNAPSHOT_VERSION;
};

export type SavedFittingMetadataValidationResult =
  | {
      issues: [];
      ok: true;
      snapshotDiagnostics: SavedFittingSnapshotDiagnostic[];
      value: ValidatedSavedFittingMetadata;
    }
  | {
      issues: SavedFittingMetadataIssue[];
      ok: false;
      snapshotDiagnostics: SavedFittingSnapshotDiagnostic[];
      value: null;
    };

export function validateSavedFittingMetadata(
  input: SavedFittingMetadataInput,
  options: {
    requireCurrentSnapshotVersion?: boolean;
    requireInitialRevision?: boolean;
  } = {}
): SavedFittingMetadataValidationResult {
  const issues: SavedFittingMetadataIssue[] = [];
  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (!name) {
    issues.push({
      code: "INVALID_NAME",
      message: "Saved fitting name must not be empty.",
      path: "name"
    });
  } else if (name.length > SAVED_FITTING_NAME_MAX_LENGTH) {
    issues.push({
      code: "NAME_TOO_LONG",
      message: `Saved fitting name must not exceed ${SAVED_FITTING_NAME_MAX_LENGTH} characters.`,
      path: "name"
    });
  }

  if (!isPositiveSafeInteger(input.hullTypeId)) {
    issues.push({
      code: "INVALID_HULL_TYPE_ID",
      message: "hullTypeId must be a positive safe integer.",
      path: "hullTypeId"
    });
  }

  if (!isPositiveSafeInteger(input.revision)) {
    issues.push({
      code: "INVALID_REVISION",
      message: "revision must be a positive safe integer.",
      path: "revision"
    });
  } else if (options.requireInitialRevision && input.revision !== 1) {
    issues.push({
      code: "INITIAL_REVISION_REQUIRED",
      message: "A new saved fitting must start at revision 1.",
      path: "revision"
    });
  }

  const decoded = decodeSavedFittingSnapshot({
    snapshot: input.snapshot,
    snapshotVersion: input.snapshotVersion
  });

  if (!decoded.ok) {
    issues.push({
      code: "SNAPSHOT_INVALID",
      message: "Saved fitting snapshot or snapshot version is invalid.",
      path: "snapshot"
    });
  } else {
    if (
      options.requireCurrentSnapshotVersion &&
      input.snapshotVersion !== SAVED_FITTING_SNAPSHOT_VERSION
    ) {
      issues.push({
        code: "SNAPSHOT_VERSION_MISMATCH",
        message: `New saved fitting data must use snapshot version ${SAVED_FITTING_SNAPSHOT_VERSION}.`,
        path: "snapshotVersion"
      });
    }

    if (
      isPositiveSafeInteger(input.hullTypeId) &&
      input.hullTypeId !== decoded.value.snapshot.hullTypeId
    ) {
      issues.push({
        code: "HULL_TYPE_MISMATCH",
        message: "hullTypeId must match snapshot.hullTypeId.",
        path: "hullTypeId"
      });
    }
  }

  if (!decoded.ok || issues.length > 0) {
    return {
      issues,
      ok: false,
      snapshotDiagnostics: decoded.diagnostics,
      value: null
    };
  }

  return {
    issues: [],
    ok: true,
    snapshotDiagnostics: decoded.diagnostics,
    value: {
      hullTypeId: input.hullTypeId,
      name,
      revision: input.revision,
      snapshot: decoded.value.snapshot,
      snapshotVersion: decoded.value.snapshotVersion
    }
  };
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
