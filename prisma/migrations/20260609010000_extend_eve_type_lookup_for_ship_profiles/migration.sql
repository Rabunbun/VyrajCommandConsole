-- AlterTable
ALTER TABLE "EveTypeLookup"
ADD COLUMN "categoryName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "groupName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "renderUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "iconUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastRefreshedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EveTypeLookup_categoryName_idx" ON "EveTypeLookup"("categoryName");

-- CreateIndex
CREATE INDEX "EveTypeLookup_groupName_idx" ON "EveTypeLookup"("groupName");

-- CreateIndex
CREATE INDEX "EveTypeLookup_isPublished_idx" ON "EveTypeLookup"("isPublished");

-- CreateIndex
CREATE INDEX "EveTypeLookup_lastRefreshedAt_idx" ON "EveTypeLookup"("lastRefreshedAt");
