import type {
  CargoHoldAnalysis,
  DroneBayAnalysis,
  FittingAnalysisResponse
} from "@/lib/fitting/types";
import type {
  SavedFittingApplicationCandidateV1,
  SavedFittingRack,
  SavedFittingSnapshotV1
} from "./types";

export type SavedFittingLoadStatus = "blocked" | "ready" | "review";

export type SavedFittingLoadDiagnosticCode =
  | "CARGO_HOLD_VALIDATION"
  | "CARGO_HOLD_WARNING"
  | "CARGO_NOT_FOUND"
  | "CHARGE_INCOMPATIBLE"
  | "CHARGE_NOT_FOUND"
  | "CHARGE_QUANTITY_DRIFT"
  | "DRONE_BAY_VALIDATION"
  | "DRONE_NOT_FOUND"
  | "FIT_VALIDATION"
  | "FIT_WARNING"
  | "HULL_EMPTY_SLOT_REMOVED"
  | "HULL_NOT_FOUND"
  | "HULL_OCCUPIED_SLOT_REMOVED"
  | "HULL_SLOT_ADDED"
  | "MODULE_NOT_FOUND"
  | "SAVED_RECORD_INVALID"
  | "SNAPSHOT_INVALID"
  | "SNAPSHOT_NORMALIZED";

export type SavedFittingLoadDiagnostic = {
  code: SavedFittingLoadDiagnosticCode;
  disposition: "blocking" | "review";
  domain: "cargo" | "charge" | "drone" | "fitting" | "hull" | "snapshot";
  index?: number;
  message: string;
  moduleTypeId?: number;
  path?: string;
  quantity?: number;
  rack?: SavedFittingRack;
  typeId?: number;
};

export type SavedFittingLoadCatalog = {
  cargo: Array<{ typeId: number; typeName: string }>;
  charges: Array<{ typeId: number; typeName: string }>;
  drones: Array<{ typeId: number; typeName: string }>;
  hulls: Array<{
    droneCapacity: number | null;
    highSlots: number;
    lowSlots: number;
    midSlots: number;
    rigSlots: number;
    typeId: number;
    typeName: string;
  }>;
  modules: Array<{ typeId: number; typeName: string }>;
};

export type SavedFittingLoadRackSummary = Record<
  SavedFittingRack,
  Array<{
    index: number;
    module: {
      charge: {
        quantity: number;
        typeId: number;
        typeName: string | null;
      } | null;
      typeId: number;
      typeName: string | null;
    } | null;
  }>
>;

export type SavedFittingLoadAnalysis = {
  cargoHold: CargoHoldAnalysis;
  droneBay: DroneBayAnalysis;
  fitting: FittingAnalysisResponse;
};

export type SavedFittingLoadResult =
  | { code: "UNAVAILABLE"; ok: false }
  | {
      analysis: SavedFittingLoadAnalysis | null;
      application: SavedFittingApplicationCandidateV1 | null;
      cargo: Array<{ quantity: number; typeId: number; typeName: string | null }>;
      diagnostics: SavedFittingLoadDiagnostic[];
      drones: Array<{ quantity: number; typeId: number; typeName: string | null }>;
      editorBaseline: {
        baselineFingerprint: string;
        savedFittingId: string;
        savedRevision: number;
      } | null;
      hull: {
        currentTopology: Record<SavedFittingRack, number>;
        savedTopology: Record<SavedFittingRack, number>;
        typeId: number;
        typeName: string;
      } | null;
      ok: true;
      original: {
        snapshot: unknown;
        snapshotVersion: number;
      };
      racks: SavedFittingLoadRackSummary;
      savedFitting: {
        createdAt: string;
        id: string;
        name: string;
        revision: number;
        updatedAt: string;
      };
      status: SavedFittingLoadStatus;
    };

export type SavedFittingLoadStaticHydrator = (
  snapshot: SavedFittingSnapshotV1
) => Promise<SavedFittingLoadCatalog>;
