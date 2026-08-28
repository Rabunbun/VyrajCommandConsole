import type { SavedFittingReadRecord } from "./repository-core";

export type SavedFittingSummary = Pick<
  SavedFittingReadRecord,
  "hullTypeId" | "id" | "name" | "revision" | "updatedAt"
>;

export type SavedFittingLibraryState =
  | {
      fittings: SavedFittingSummary[];
      invalidRecordCount: number;
      status: "available";
    }
  | {
      message: string;
      status: "unavailable";
    };
