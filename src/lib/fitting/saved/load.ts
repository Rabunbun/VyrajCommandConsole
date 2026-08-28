import "server-only";

import { Prisma } from "@prisma/client";
import { analyzeCargoHold } from "@/lib/fitting/cargo";
import { validateFittingChargeLoad } from "@/lib/fitting/charges";
import { getDb } from "@/lib/db";
import { validateDroneBay } from "@/lib/fitting/drones";
import { analyzeFittingFit } from "@/lib/fitting/validation";
import {
  loadSavedFittingFromRepository,
  type SavedFittingLoadDependencies
} from "./load-core";
import { requireSavedFittingOwner } from "./owner";
import type { SavedFittingOwner } from "./owner-resolution";
import type { SavedFittingSnapshotV1 } from "./types";

const savedFittingLoadSelect = {
  createdAt: true,
  hullTypeId: true,
  id: true,
  name: true,
  revision: true,
  snapshot: true,
  snapshotVersion: true,
  updatedAt: true
} satisfies Prisma.SavedFittingSelect;

export async function loadCurrentOwnerSavedFitting(fittingId: string) {
  const owner = await requireSavedFittingOwner();
  return loadSavedFitting(owner, fittingId);
}

export async function loadSavedFitting(
  owner: SavedFittingOwner,
  fittingId: string
) {
  if (!isUuid(fittingId)) {
    return { code: "UNAVAILABLE" as const, ok: false as const };
  }

  return loadSavedFittingFromRepository(
    owner,
    fittingId,
    {
      findByOwnerAndId(ownerEveIdentityId, id) {
        return getDb().savedFitting.findFirst({
          where: { id, ownerEveIdentityId },
          select: savedFittingLoadSelect
        });
      }
    },
    authoritativeDependencies
  );
}

const authoritativeDependencies: SavedFittingLoadDependencies = {
  analyzeCargo: analyzeCargoHold,
  analyzeFit: analyzeFittingFit,
  hydrateStatic: hydrateSavedFittingStaticData,
  async validateCharge(moduleTypeId, chargeTypeId) {
    const result = await validateFittingChargeLoad(moduleTypeId, chargeTypeId);
    return result.status === "ready"
      ? { maximumQuantity: result.charge.quantity, status: "ready" }
      : { message: result.message, status: "error" };
  },
  validateDroneBay
};

async function hydrateSavedFittingStaticData(snapshot: SavedFittingSnapshotV1) {
  const moduleTypeIds = new Set<number>();
  const chargeTypeIds = new Set<number>();

  for (const rack of ["high", "mid", "low", "rig"] as const) {
    for (const slot of snapshot.slots[rack]) {
      if (slot.module) {
        moduleTypeIds.add(slot.module.typeId);
      }
      if (slot.module?.charge) {
        chargeTypeIds.add(slot.module.charge.typeId);
      }
    }
  }

  const db = getDb();
  const [hulls, modules, charges, drones, cargo] = await Promise.all([
    db.fittingHull.findMany({
      select: {
        droneCapacity: true,
        highSlots: true,
        lowSlots: true,
        midSlots: true,
        rigSlots: true,
        typeId: true,
        typeName: true
      },
      where: { typeId: snapshot.hullTypeId }
    }),
    db.fittingModule.findMany({
      select: { typeId: true, typeName: true },
      where: { typeId: { in: [...moduleTypeIds] } }
    }),
    db.fittingCharge.findMany({
      select: { typeId: true, typeName: true },
      where: { typeId: { in: [...chargeTypeIds] } }
    }),
    db.fittingDrone.findMany({
      select: { typeId: true, typeName: true },
      where: { typeId: { in: snapshot.drones.map((entry) => entry.typeId) } }
    }),
    db.fittingCargoItem.findMany({
      select: { typeId: true, typeName: true },
      where: { typeId: { in: snapshot.cargo.map((entry) => entry.typeId) } }
    })
  ]);

  return { cargo, charges, drones, hulls, modules };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
