export const SAVED_FITTING_SNAPSHOT_VERSION = 1 as const;

export const savedFittingRackOrder = ["high", "mid", "low", "rig"] as const;

export type SavedFittingRack = (typeof savedFittingRackOrder)[number];

export type SavedFittingQuantityEntry = {
  quantity: number;
  typeId: number;
};

export type SavedFittingChargeV1 = SavedFittingQuantityEntry;

export type SavedFittingModuleV1 = {
  charge: SavedFittingChargeV1 | null;
  typeId: number;
};

export type SavedFittingSlotV1 = {
  index: number;
  module: SavedFittingModuleV1 | null;
};

export type SavedFittingSnapshotV1 = {
  cargo: SavedFittingQuantityEntry[];
  drones: SavedFittingQuantityEntry[];
  hullTypeId: number;
  slots: Record<SavedFittingRack, SavedFittingSlotV1[]>;
};

export type SavedFittingApplicationCandidateV1 = {
  cargo: SavedFittingQuantityEntry[];
  drones: SavedFittingQuantityEntry[];
  hullTypeId: number;
  slots: Record<SavedFittingRack, SavedFittingSlotV1[]>;
  topology: {
    highSlots: number;
    lowSlots: number;
    midSlots: number;
    rigSlots: number;
  };
};

export type SavedFittingSnapshotDiagnosticCode =
  | "DUPLICATE_ENTRY_AGGREGATED"
  | "DUPLICATE_SLOT_INDEX"
  | "INVALID_QUANTITY"
  | "INVALID_SLOT_INDEX"
  | "INVALID_SNAPSHOT_VERSION"
  | "INVALID_TYPE_ID"
  | "MALFORMED_RACK_TOPOLOGY"
  | "MALFORMED_SNAPSHOT"
  | "MIGRATION_FAILED"
  | "MIGRATION_MISSING"
  | "MISSING_HULL"
  | "MISSING_SLOT_INDEX"
  | "QUANTITY_OVERFLOW"
  | "RUNTIME_FIELD_PRESENT"
  | "UNEXPECTED_FIELD"
  | "UNSUPPORTED_RACK_CONTENT";

export type SavedFittingSnapshotDiagnostic = {
  code: SavedFittingSnapshotDiagnosticCode;
  message: string;
  path: string;
  severity: "error" | "warning";
};

export type SavedFittingDomainResult<T> =
  | {
      diagnostics: SavedFittingSnapshotDiagnostic[];
      ok: true;
      value: T;
    }
  | {
      diagnostics: SavedFittingSnapshotDiagnostic[];
      ok: false;
      value: null;
    };

export type VersionedSavedFittingSnapshot = {
  snapshot: unknown;
  snapshotVersion: number;
};

export type DecodedSavedFittingSnapshot = {
  snapshot: SavedFittingSnapshotV1;
  snapshotVersion: typeof SAVED_FITTING_SNAPSHOT_VERSION;
};

/**
 * Pure editor bookkeeping for a future saved-fitting UI.
 *
 * A new or EFT-imported fit has no saved ID or baseline. Loading establishes all
 * three values. Save updates the current ID/revision, while Save As establishes
 * a new ID/revision; either successful operation replaces the baseline.
 */
export type SavedFittingEditorContext = {
  baselineFingerprint: string | null;
  savedFittingId: string | null;
  savedRevision: number | null;
};
