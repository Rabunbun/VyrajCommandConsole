ALTER TABLE "FittingHull"
ADD COLUMN "cargoCapacityBase" DOUBLE PRECISION;

CREATE TABLE "FittingCargoItem" (
    "id" UUID NOT NULL,
    "typeId" INTEGER NOT NULL,
    "typeName" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "categoryName" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "marketGroupId" INTEGER,
    "marketGroupName" TEXT,
    "marketGroupPathIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "marketGroupPathNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "metaGroupId" INTEGER,
    "metaGroupName" TEXT,
    "techLevel" INTEGER,
    "volume" DOUBLE PRECISION,
    "packagedVolume" DOUBLE PRECISION,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FittingCargoItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FittingCargoItem_typeId_key" ON "FittingCargoItem"("typeId");
CREATE INDEX "FittingCargoItem_typeName_idx" ON "FittingCargoItem"("typeName");
CREATE INDEX "FittingCargoItem_categoryId_idx" ON "FittingCargoItem"("categoryId");
CREATE INDEX "FittingCargoItem_groupId_idx" ON "FittingCargoItem"("groupId");
CREATE INDEX "FittingCargoItem_marketGroupId_idx" ON "FittingCargoItem"("marketGroupId");
CREATE INDEX "FittingCargoItem_lastRefreshedAt_idx" ON "FittingCargoItem"("lastRefreshedAt");
