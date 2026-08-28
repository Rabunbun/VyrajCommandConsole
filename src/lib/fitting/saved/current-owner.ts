import "server-only";

import { SavedFittingOwnerError } from "./owner-resolution";
import { requireSavedFittingOwner } from "./owner";
import { listSavedFittings } from "./service";
import type { SavedFittingLibraryState } from "./ui-types";

export async function getCurrentOwnerSavedFittingLibrary(): Promise<SavedFittingLibraryState> {
  try {
    const owner = await requireSavedFittingOwner();
    const result = await listSavedFittings(owner);

    return {
      fittings: result.fittings.map((fitting) => ({
        hullTypeId: fitting.hullTypeId,
        id: fitting.id,
        name: fitting.name,
        revision: fitting.revision,
        updatedAt: fitting.updatedAt
      })),
      invalidRecordCount: result.invalidRecords.length,
      status: "available"
    };
  } catch (error) {
    if (error instanceof SavedFittingOwnerError) {
      return {
        message: error.message,
        status: "unavailable"
      };
    }

    return {
      message: "Personal saved fittings are temporarily unavailable.",
      status: "unavailable"
    };
  }
}
