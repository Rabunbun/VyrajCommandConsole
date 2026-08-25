import { hasMeaningfulFitContent, type FitState } from "@/lib/fitting/fit-state";
import type { EftImportStatus, EftPreviewResponse } from "./types";

export type EftImportConfirmation =
  | "none"
  | "replace-current"
  | "review"
  | "review-and-replace-current";

export function getEftImportConfirmation(
  status: EftImportStatus,
  currentFit: FitState,
): EftImportConfirmation {
  const meaningful = hasMeaningfulFitContent(currentFit);
  if (status === "review") {
    return meaningful ? "review-and-replace-current" : "review";
  }
  return meaningful ? "replace-current" : "none";
}

export function isApplicableEftPreview(
  preview: EftPreviewResponse | null,
): preview is EftPreviewResponse & { application: NonNullable<EftPreviewResponse["application"]> } {
  return Boolean(
    preview &&
      preview.status !== "error" &&
      preview.application &&
      preview.analysis,
  );
}

export function isEftPreviewResponse(value: unknown): value is EftPreviewResponse {
  if (!isRecord(value)) return false;
  const racks = value.racks;
  return (
    (value.status === "ready" || value.status === "review" || value.status === "error") &&
    Array.isArray(value.diagnostics) &&
    Array.isArray(value.drones) &&
    Array.isArray(value.cargo) &&
    isRecord(racks) &&
    ["low", "mid", "high", "rig"].every((rack) => Array.isArray(racks[rack])) &&
    (value.application === null || isRecord(value.application)) &&
    (value.analysis === null || isRecord(value.analysis)) &&
    (value.hull === null || isRecord(value.hull))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
