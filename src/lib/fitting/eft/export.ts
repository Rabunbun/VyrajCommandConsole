import "server-only";

import { FittingRack } from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  hydrateAndFormatEftExport,
  validateEftExportSnapshot,
} from "./export-project";
import {
  EFT_SUPPORTED_RACKS,
  type EftExportResponse,
  type EftSupportedRack,
} from "./types";

const rackByDatabaseRack: Record<FittingRack, EftSupportedRack | "subsystem"> = {
  [FittingRack.HIGH]: "high",
  [FittingRack.LOW]: "low",
  [FittingRack.MID]: "mid",
  [FittingRack.RIG]: "rig",
  [FittingRack.SUBSYSTEM]: "subsystem",
};

export async function exportEft(value: unknown): Promise<EftExportResponse> {
  const snapshot = validateEftExportSnapshot(value);
  const moduleTypeIds = new Set<number>();
  const chargeTypeIds = new Set<number>();
  for (const rack of EFT_SUPPORTED_RACKS) {
    for (const slot of snapshot.slots[rack]) {
      if (slot.module) moduleTypeIds.add(slot.module.typeId);
      if (slot.module?.chargeTypeId) chargeTypeIds.add(slot.module.chargeTypeId);
    }
  }

  const db = getDb();
  const [hulls, modules, charges, drones, cargo] = await Promise.all([
    db.fittingHull.findMany({
      select: {
        highSlots: true,
        lowSlots: true,
        midSlots: true,
        rigSlots: true,
        typeId: true,
        typeName: true,
      },
      where: { typeId: snapshot.hullTypeId },
    }),
    moduleTypeIds.size
      ? db.fittingModule.findMany({
          select: { rack: true, typeId: true, typeName: true },
          where: { typeId: { in: [...moduleTypeIds] } },
        })
      : [],
    chargeTypeIds.size
      ? db.fittingCharge.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: [...chargeTypeIds] } },
        })
      : [],
    snapshot.drones.length
      ? db.fittingDrone.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: snapshot.drones.map((entry) => entry.typeId) } },
        })
      : [],
    snapshot.cargo.length
      ? db.fittingCargoItem.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: snapshot.cargo.map((entry) => entry.typeId) } },
        })
      : [],
  ]);

  return hydrateAndFormatEftExport(snapshot, {
    cargo,
    charges,
    drones,
    hulls,
    modules: modules.map((module) => ({
      ...module,
      rack: rackByDatabaseRack[module.rack],
    })),
  });
}
