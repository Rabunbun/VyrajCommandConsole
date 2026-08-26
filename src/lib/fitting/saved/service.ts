import "server-only";

import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import type { SavedFittingOwner } from "./owner-resolution";
import {
  getSavedFittingFromRepository,
  listSavedFittingsFromRepository,
  type SavedFittingReadRepository
} from "./repository-core";

const savedFittingReadSelect = {
  createdAt: true,
  hullTypeId: true,
  id: true,
  name: true,
  revision: true,
  snapshot: true,
  snapshotVersion: true,
  updatedAt: true
} satisfies Prisma.SavedFittingSelect;

export async function listSavedFittings(owner: SavedFittingOwner) {
  return listSavedFittingsFromRepository(owner, createSavedFittingRepository());
}

export async function getSavedFitting(
  owner: SavedFittingOwner,
  fittingId: string
) {
  if (!isUuid(fittingId)) {
    return { code: "UNAVAILABLE" as const, ok: false as const };
  }

  return getSavedFittingFromRepository(
    owner,
    fittingId,
    createSavedFittingRepository()
  );
}

function createSavedFittingRepository(): SavedFittingReadRepository {
  return {
    findByOwnerAndId(ownerEveIdentityId, fittingId) {
      return getDb().savedFitting.findFirst({
        where: {
          id: fittingId,
          ownerEveIdentityId
        },
        select: savedFittingReadSelect
      });
    },
    listByOwner(ownerEveIdentityId) {
      return getDb().savedFitting.findMany({
        where: { ownerEveIdentityId },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: savedFittingReadSelect
      });
    }
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
