-- Add hull metadata required for future module compatibility. groupId remains
-- nullable until existing rows have been backfilled by the authoritative hull
-- refresh command, after which a separate migration can enforce NOT NULL.
ALTER TABLE "FittingHull" ADD COLUMN "groupId" INTEGER;
ALTER TABLE "FittingHull" ADD COLUMN "rigSize" INTEGER;

-- CreateEnum
CREATE TYPE "FittingRack" AS ENUM ('HIGH', 'MID', 'LOW', 'RIG', 'SUBSYSTEM');

-- CreateTable
CREATE TABLE "FittingModule" (
    "id" UUID NOT NULL,
    "typeId" INTEGER NOT NULL,
    "typeName" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "rack" "FittingRack" NOT NULL,
    "marketGroupId" INTEGER,
    "marketGroupName" TEXT,
    "metaGroupId" INTEGER,
    "metaGroupName" TEXT,
    "metaLevel" INTEGER,
    "techLevel" INTEGER,
    "cpuRequirement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "powergridRequirement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calibrationCost" INTEGER NOT NULL DEFAULT 0,
    "rigSize" INTEGER,
    "requiresTurretHardpoint" BOOLEAN NOT NULL DEFAULT false,
    "requiresLauncherHardpoint" BOOLEAN NOT NULL DEFAULT false,
    "allowedShipGroupIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "allowedShipTypeIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "maxGroupFitted" INTEGER,
    "maxTypeFitted" INTEGER,
    "chargeGroupIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "chargeSize" INTEGER,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FittingModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FittingHull_groupId_idx" ON "FittingHull"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "FittingModule_typeId_key" ON "FittingModule"("typeId");

-- CreateIndex
CREATE INDEX "FittingModule_rack_typeName_idx" ON "FittingModule"("rack", "typeName");

-- CreateIndex
CREATE INDEX "FittingModule_groupId_idx" ON "FittingModule"("groupId");

-- CreateIndex
CREATE INDEX "FittingModule_marketGroupId_idx" ON "FittingModule"("marketGroupId");

-- CreateIndex
CREATE INDEX "FittingModule_lastRefreshedAt_idx" ON "FittingModule"("lastRefreshedAt");
