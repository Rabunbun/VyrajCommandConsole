import "server-only";

import { getDb } from "@/lib/db";
import { parseEft } from "./parser";
import { projectEftPreview, projectEmptyEftPreview } from "./preview-project";
import { resolveEftDraft } from "./resolve";
import {
  EFT_SUPPORTED_RACKS,
  type EftPreviewResponse,
  type ResolvedEftDraft,
} from "./types";

export async function previewEft(eftText: string): Promise<EftPreviewResponse> {
  const parsed = parseEft(eftText);
  const resolution = await resolveEftDraft(parsed);

  if (!resolution.draft) {
    return projectEmptyEftPreview({
      diagnostics: resolution.diagnostics,
      fitName: parsed.document?.header.fitName ?? null,
      status: resolution.status,
    });
  }

  return projectEftPreview(
    resolution.draft,
    await loadCanonicalNames(resolution.draft),
  );
}

async function loadCanonicalNames(draft: ResolvedEftDraft) {
  const db = getDb();
  const moduleTypeIds = collectTypeIds(draft, "modules");
  const chargeTypeIds = collectTypeIds(draft, "charges");
  const droneTypeIds = draft.drones.map((entry) => entry.typeId);
  const cargoTypeIds = draft.cargo.map((entry) => entry.typeId);
  const [hull, modules, charges, drones, cargo] = await Promise.all([
    db.fittingHull.findUnique({
      select: { typeName: true },
      where: { typeId: draft.hullTypeId },
    }),
    moduleTypeIds.length
      ? db.fittingModule.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: moduleTypeIds } },
        })
      : [],
    chargeTypeIds.length
      ? db.fittingCharge.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: chargeTypeIds } },
        })
      : [],
    droneTypeIds.length
      ? db.fittingDrone.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: droneTypeIds } },
        })
      : [],
    cargoTypeIds.length
      ? db.fittingCargoItem.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: cargoTypeIds } },
        })
      : [],
  ]);

  return {
    cargo: new Map(cargo.map((entry) => [entry.typeId, entry.typeName])),
    charges: new Map(charges.map((entry) => [entry.typeId, entry.typeName])),
    drones: new Map(drones.map((entry) => [entry.typeId, entry.typeName])),
    hull: hull?.typeName ?? "",
    modules: new Map(modules.map((entry) => [entry.typeId, entry.typeName])),
  };
}

function collectTypeIds(
  draft: ResolvedEftDraft,
  kind: "charges" | "modules",
) {
  const typeIds = new Set<number>();
  for (const rack of EFT_SUPPORTED_RACKS) {
    for (const slot of draft.slots[rack]) {
      if (kind === "modules" && slot.module) typeIds.add(slot.module.typeId);
      if (kind === "charges" && slot.module?.charge) {
        typeIds.add(slot.module.charge.typeId);
      }
    }
  }
  return [...typeIds];
}
