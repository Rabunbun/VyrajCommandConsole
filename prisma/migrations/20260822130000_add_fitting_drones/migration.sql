-- Dedicated static cache for published, non-Abyssal Category 18 drones.
CREATE TABLE "FittingDrone" (
    "id" UUID NOT NULL,
    "typeId" INTEGER NOT NULL,
    "typeName" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "marketGroupId" INTEGER,
    "marketGroupName" TEXT,
    "marketGroupPathIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "marketGroupPathNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "metaGroupId" INTEGER,
    "metaGroupName" TEXT,
    "metaLevel" INTEGER,
    "techLevel" INTEGER,
    "volume" DOUBLE PRECISION,
    "bandwidthUsed" DOUBLE PRECISION,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FittingDrone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FittingDrone_typeId_key" ON "FittingDrone"("typeId");
CREATE INDEX "FittingDrone_groupId_typeName_idx" ON "FittingDrone"("groupId", "typeName");
CREATE INDEX "FittingDrone_marketGroupId_idx" ON "FittingDrone"("marketGroupId");
CREATE INDEX "FittingDrone_metaGroupId_idx" ON "FittingDrone"("metaGroupId");
CREATE INDEX "FittingDrone_lastRefreshedAt_idx" ON "FittingDrone"("lastRefreshedAt");
