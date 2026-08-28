import "server-only";

import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import {
  createSavedFittingFromRepository,
  deleteSavedFittingFromRepository,
  updateSavedFittingFromRepository,
  type CreateSavedFittingInput,
  type DeleteSavedFittingInput,
  type SavedFittingMutationRepository,
  type UpdateSavedFittingInput
} from "./mutation-core";
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

export async function createSavedFitting(
  owner: SavedFittingOwner,
  input: CreateSavedFittingInput
) {
  return createSavedFittingFromRepository(
    owner,
    input,
    createSavedFittingRepository()
  );
}

export async function updateSavedFitting(
  owner: SavedFittingOwner,
  input: UpdateSavedFittingInput
) {
  return updateSavedFittingFromRepository(
    owner,
    input,
    createSavedFittingRepository()
  );
}

export async function deleteSavedFitting(
  owner: SavedFittingOwner,
  input: DeleteSavedFittingInput
) {
  return deleteSavedFittingFromRepository(
    owner,
    input,
    createSavedFittingRepository()
  );
}

function createSavedFittingRepository(): SavedFittingReadRepository &
  SavedFittingMutationRepository {
  return {
    create(data) {
      return getDb().savedFitting.create({
        data: {
          hullTypeId: data.hullTypeId,
          name: data.name,
          ownerEveIdentityId: data.ownerEveIdentityId,
          revision: data.revision,
          snapshot: asPrismaJson(data.snapshot),
          snapshotVersion: data.snapshotVersion
        },
        select: savedFittingReadSelect
      });
    },
    async deleteIfRevisionMatches(data) {
      const result = await getDb().savedFitting.deleteMany({
        where: {
          id: data.id,
          ownerEveIdentityId: data.ownerEveIdentityId,
          revision: data.expectedRevision
        }
      });

      return result.count === 1;
    },
    findByOwnerAndId(ownerEveIdentityId, fittingId) {
      return getDb().savedFitting.findFirst({
        where: {
          id: fittingId,
          ownerEveIdentityId
        },
        select: savedFittingReadSelect
      });
    },
    async findRevisionByOwnerAndId(ownerEveIdentityId, fittingId) {
      const record = await getDb().savedFitting.findFirst({
        where: {
          id: fittingId,
          ownerEveIdentityId
        },
        select: { revision: true }
      });

      return record?.revision ?? null;
    },
    listByOwner(ownerEveIdentityId) {
      return getDb().savedFitting.findMany({
        where: { ownerEveIdentityId },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: savedFittingReadSelect
      });
    },
    async updateIfRevisionMatches(data) {
      const records = await getDb().savedFitting.updateManyAndReturn({
        data: {
          hullTypeId: data.hullTypeId,
          name: data.name,
          revision: { increment: 1 },
          snapshot: asPrismaJson(data.snapshot),
          snapshotVersion: data.snapshotVersion
        },
        where: {
          id: data.id,
          ownerEveIdentityId: data.ownerEveIdentityId,
          revision: data.expectedRevision
        },
        select: savedFittingReadSelect
      });

      return records[0] ?? null;
    }
  };
}

function asPrismaJson(value: object) {
  return value as Prisma.InputJsonValue;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
