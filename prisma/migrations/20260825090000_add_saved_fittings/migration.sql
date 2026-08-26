-- Character-scoped saved fitting snapshots. Static type IDs intentionally have
-- no foreign keys so historical snapshots survive CCP cache refreshes.
CREATE TABLE "SavedFitting" (
    "id" UUID NOT NULL,
    "ownerEveIdentityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "hullTypeId" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedFitting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedFitting_ownerEveIdentityId_updatedAt_idx"
ON "SavedFitting"("ownerEveIdentityId", "updatedAt");

CREATE INDEX "SavedFitting_ownerEveIdentityId_hullTypeId_idx"
ON "SavedFitting"("ownerEveIdentityId", "hullTypeId");

ALTER TABLE "SavedFitting"
ADD CONSTRAINT "SavedFitting_ownerEveIdentityId_fkey"
FOREIGN KEY ("ownerEveIdentityId") REFERENCES "EveIdentity"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
