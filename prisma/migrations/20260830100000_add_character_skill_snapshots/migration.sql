CREATE TYPE "EveCharacterSkillSnapshotStatus" AS ENUM (
    'AVAILABLE',
    'STALE',
    'UNAVAILABLE',
    'REAUTHORIZATION_REQUIRED',
    'REVOKED'
);

CREATE TABLE "EveCharacterSkillSnapshot" (
    "id" UUID NOT NULL,
    "eveIdentityId" UUID NOT NULL,
    "skills" JSONB,
    "source" TEXT NOT NULL DEFAULT 'ESI',
    "status" "EveCharacterSkillSnapshotStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "fetchedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "refreshAfter" TIMESTAMP(3),
    "skillsEtag" TEXT,
    "skillsLastModified" TEXT,
    "skillsCacheControl" TEXT,
    "queueEtag" TEXT,
    "queueLastModified" TEXT,
    "queueCacheControl" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "refreshVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EveCharacterSkillSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EveCharacterSkillSnapshot_eveIdentityId_key"
ON "EveCharacterSkillSnapshot"("eveIdentityId");

CREATE INDEX "EveCharacterSkillSnapshot_status_idx"
ON "EveCharacterSkillSnapshot"("status");

CREATE INDEX "EveCharacterSkillSnapshot_refreshAfter_idx"
ON "EveCharacterSkillSnapshot"("refreshAfter");

ALTER TABLE "EveCharacterSkillSnapshot"
ADD CONSTRAINT "EveCharacterSkillSnapshot_eveIdentityId_fkey"
FOREIGN KEY ("eveIdentityId") REFERENCES "EveIdentity"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
