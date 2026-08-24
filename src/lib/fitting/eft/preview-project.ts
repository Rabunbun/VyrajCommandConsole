import { resolvedEftDraftToApplication } from "./application";
import {
  EFT_SUPPORTED_RACKS,
  type EftImportDiagnostic,
  type EftPreviewDiagnostic,
  type EftPreviewResponse,
  type ResolvedEftDraft,
} from "./types";

export type EftPreviewCanonicalNames = {
  cargo: Map<number, string>;
  charges: Map<number, string>;
  drones: Map<number, string>;
  hull: string;
  modules: Map<number, string>;
};

const reviewDiagnosticCodes = new Set([
  "EXTENSION_UNSUPPORTED",
  "OFFLINE_UNSUPPORTED",
  "SERVICE_UNSUPPORTED",
]);

export function projectEftPreview(
  draft: ResolvedEftDraft,
  names: EftPreviewCanonicalNames,
): EftPreviewResponse {
  const diagnostics = draft.diagnostics.map(toPreviewDiagnostic);
  const missingNames = collectMissingNames(draft, names);
  if (missingNames.length > 0) {
    diagnostics.push({
      code: "FIT_VALIDATION",
      disposition: "blocking",
      lineNumber: null,
      message: `The preview could not hydrate authoritative names for: ${missingNames.join(", ")}.`,
      rawText: null,
      severity: "error",
    });
  }

  const status = missingNames.length > 0 ? "error" : draft.status;
  return {
    analysis: draft.analysis,
    application: status === "error" ? null : resolvedEftDraftToApplication(draft),
    cargo: draft.cargo.map((entry) => ({
      ...entry,
      typeName: names.cargo.get(entry.typeId) ?? "",
    })),
    diagnostics,
    drones: draft.drones.map((entry) => ({
      ...entry,
      typeName: names.drones.get(entry.typeId) ?? "",
    })),
    fitName: draft.fitName,
    hull: { typeId: draft.hullTypeId, typeName: names.hull },
    racks: Object.fromEntries(
      EFT_SUPPORTED_RACKS.map((rack) => [
        rack,
        draft.slots[rack].map((slot) => ({
          index: slot.index,
          module: slot.module
            ? {
                charge: slot.module.charge
                  ? {
                      ...slot.module.charge,
                      typeName: names.charges.get(slot.module.charge.typeId) ?? "",
                    }
                  : null,
                typeId: slot.module.typeId,
                typeName: names.modules.get(slot.module.typeId) ?? "",
              }
            : null,
        })),
      ]),
    ) as EftPreviewResponse["racks"],
    status,
  };
}

export function projectEmptyEftPreview(input: {
  diagnostics: EftImportDiagnostic[];
  fitName: string | null;
  status: EftPreviewResponse["status"];
}): EftPreviewResponse {
  return {
    analysis: null,
    application: null,
    cargo: [],
    diagnostics: input.diagnostics.map(toPreviewDiagnostic),
    drones: [],
    fitName: input.fitName,
    hull: null,
    racks: { high: [], low: [], mid: [], rig: [] },
    status: input.status,
  };
}

function collectMissingNames(
  draft: ResolvedEftDraft,
  names: EftPreviewCanonicalNames,
) {
  const missing: string[] = [];
  if (!names.hull) missing.push(`hull type ${draft.hullTypeId}`);
  for (const rack of EFT_SUPPORTED_RACKS) {
    for (const slot of draft.slots[rack]) {
      if (slot.module && !names.modules.has(slot.module.typeId)) {
        missing.push(`module type ${slot.module.typeId}`);
      }
      if (slot.module?.charge && !names.charges.has(slot.module.charge.typeId)) {
        missing.push(`charge type ${slot.module.charge.typeId}`);
      }
    }
  }
  for (const entry of draft.drones) {
    if (!names.drones.has(entry.typeId)) missing.push(`drone type ${entry.typeId}`);
  }
  for (const entry of draft.cargo) {
    if (!names.cargo.has(entry.typeId)) missing.push(`cargo type ${entry.typeId}`);
  }
  return [...new Set(missing)];
}

function toPreviewDiagnostic(
  diagnostic: EftImportDiagnostic,
): EftPreviewDiagnostic {
  return {
    ...diagnostic,
    disposition:
      diagnostic.severity === "error"
        ? "blocking"
        : reviewDiagnosticCodes.has(diagnostic.code)
          ? "review"
          : "warning",
  };
}
