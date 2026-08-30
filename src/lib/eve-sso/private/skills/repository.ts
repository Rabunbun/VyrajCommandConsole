import "server-only";

import {
  EveCharacterSkillSnapshotStatus,
  Prisma,
  type EveCharacterSkillSnapshot
} from "@prisma/client";
import { getDb } from "@/lib/db";
import { parseStoredCharacterSkills } from "./parser";
import type {
  CharacterSkillSnapshotRecord,
  CharacterSkillSnapshotRepository
} from "./types";

const snapshotSelect = {
  checkedAt: true,
  eveIdentityId: true,
  fetchedAt: true,
  lastErrorAt: true,
  lastErrorCode: true,
  queueCacheControl: true,
  queueEtag: true,
  queueLastModified: true,
  refreshAfter: true,
  refreshVersion: true,
  skills: true,
  skillsCacheControl: true,
  skillsEtag: true,
  skillsLastModified: true,
  source: true,
  status: true
} satisfies Prisma.EveCharacterSkillSnapshotSelect;

type SnapshotRow = Pick<
  EveCharacterSkillSnapshot,
  keyof typeof snapshotSelect
>;

export function createCharacterSkillSnapshotRepository(): CharacterSkillSnapshotRepository {
  return {
    async beginRefresh(eveIdentityId) {
      const row = await getDb().eveCharacterSkillSnapshot.upsert({
        create: {
          eveIdentityId,
          refreshVersion: 1,
          source: "ESI",
          status: EveCharacterSkillSnapshotStatus.UNAVAILABLE
        },
        update: { refreshVersion: { increment: 1 } },
        select: snapshotSelect,
        where: { eveIdentityId }
      });

      return mapSnapshot(row);
    },
    async commitFailure(input) {
      const result = await getDb().eveCharacterSkillSnapshot.updateMany({
        data: {
          lastErrorAt: input.lastErrorAt,
          lastErrorCode: input.lastErrorCode,
          status: input.status as EveCharacterSkillSnapshotStatus
        },
        where: {
          eveIdentityId: input.eveIdentityId,
          refreshVersion: input.refreshVersion
        }
      });

      return result.count === 1;
    },
    async commitSuccess(input) {
      const result = await getDb().eveCharacterSkillSnapshot.updateMany({
        data: {
          checkedAt: input.snapshot.checkedAt,
          fetchedAt: input.snapshot.fetchedAt,
          lastErrorAt: input.snapshot.lastErrorAt,
          lastErrorCode: input.snapshot.lastErrorCode,
          queueCacheControl: input.snapshot.queueMetadata.cacheControl,
          queueEtag: input.snapshot.queueMetadata.etag,
          queueLastModified: input.snapshot.queueMetadata.lastModified,
          refreshAfter: input.snapshot.refreshAfter,
          skills: input.snapshot.skills as Prisma.InputJsonValue,
          skillsCacheControl: input.snapshot.skillsMetadata.cacheControl,
          skillsEtag: input.snapshot.skillsMetadata.etag,
          skillsLastModified: input.snapshot.skillsMetadata.lastModified,
          source: input.snapshot.source,
          status: input.snapshot.status as EveCharacterSkillSnapshotStatus
        },
        where: {
          eveIdentityId: input.eveIdentityId,
          refreshVersion: input.refreshVersion
        }
      });

      return result.count === 1;
    },
    async findByEveIdentityId(eveIdentityId) {
      const row = await getDb().eveCharacterSkillSnapshot.findUnique({
        select: snapshotSelect,
        where: { eveIdentityId }
      });

      return row ? mapSnapshot(row) : null;
    }
  };
}

function mapSnapshot(row: SnapshotRow): CharacterSkillSnapshotRecord {
  const skills = parseStoredCharacterSkills(row.skills);

  return {
    checkedAt: row.checkedAt,
    eveIdentityId: row.eveIdentityId,
    fetchedAt: row.fetchedAt,
    lastErrorAt: row.lastErrorAt,
    lastErrorCode: row.lastErrorCode,
    queueMetadata: {
      cacheControl: row.queueCacheControl,
      etag: row.queueEtag,
      lastModified: row.queueLastModified
    },
    refreshAfter: row.refreshAfter,
    refreshVersion: row.refreshVersion,
    skills,
    skillsMetadata: {
      cacheControl: row.skillsCacheControl,
      etag: row.skillsEtag,
      lastModified: row.skillsLastModified
    },
    source: "ESI",
    status:
      row.skills === null || skills
        ? row.status
        : EveCharacterSkillSnapshotStatus.UNAVAILABLE
  };
}
