"use server";

import { loadCurrentOwnerSavedFitting } from "@/lib/fitting/saved/load";
import type { SavedFittingLoadResult } from "@/lib/fitting/saved/load-types";
import type {
  SavedFittingDeleteResult,
  SavedFittingMutationResult
} from "@/lib/fitting/saved/mutation-core";
import { requireSavedFittingOwner } from "@/lib/fitting/saved/owner";
import { SavedFittingOwnerError } from "@/lib/fitting/saved/owner-resolution";
import {
  createSavedFitting,
  deleteSavedFitting,
  updateSavedFitting
} from "@/lib/fitting/saved/service";

type SavedFittingActionFailure = {
  code: "AUTH_REQUIRED" | "SERVER_ERROR";
  message: string;
  ok: false;
};

export type SavedFittingWriteActionResult =
  | SavedFittingMutationResult
  | SavedFittingActionFailure;

export type SavedFittingDeleteActionResult =
  | SavedFittingDeleteResult
  | SavedFittingActionFailure;

export type SavedFittingLoadActionResult =
  | SavedFittingLoadResult
  | SavedFittingActionFailure;

export async function createSavedFittingAction(input: {
  name: string;
  snapshot: unknown;
}): Promise<SavedFittingWriteActionResult> {
  try {
    const owner = await requireSavedFittingOwner();
    return await createSavedFitting(owner, input);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateSavedFittingAction(input: {
  expectedRevision: number;
  id: string;
  name: string;
  snapshot: unknown;
}): Promise<SavedFittingWriteActionResult> {
  try {
    const owner = await requireSavedFittingOwner();
    return await updateSavedFitting(owner, input);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteSavedFittingAction(input: {
  expectedRevision: number;
  id: string;
}): Promise<SavedFittingDeleteActionResult> {
  try {
    const owner = await requireSavedFittingOwner();
    return await deleteSavedFitting(owner, input);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function loadSavedFittingAction(
  fittingId: string
): Promise<SavedFittingLoadActionResult> {
  try {
    return await loadCurrentOwnerSavedFitting(fittingId);
  } catch (error) {
    return actionFailure(error);
  }
}

function actionFailure(error: unknown): SavedFittingActionFailure {
  if (error instanceof SavedFittingOwnerError) {
    return {
      code: "AUTH_REQUIRED",
      message: error.message,
      ok: false
    };
  }

  return {
    code: "SERVER_ERROR",
    message: "Personal saved fittings are temporarily unavailable.",
    ok: false
  };
}
