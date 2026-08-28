import {
  resolvedEftApplicationToFitState,
  type FittedModuleInstanceIdFactory
} from "@/lib/fitting/eft/application";
import type { FitState } from "@/lib/fitting/fit-state";
import type { SavedFittingApplicationCandidateV1 } from "./types";

/** Reuses the existing atomic type-ID application boundary and ID generation. */
export function savedFittingApplicationToFitState(
  application: SavedFittingApplicationCandidateV1,
  createInstanceId?: FittedModuleInstanceIdFactory
): FitState | null {
  return resolvedEftApplicationToFitState(application, createInstanceId);
}
