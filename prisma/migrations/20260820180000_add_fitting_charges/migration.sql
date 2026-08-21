-- Preserve authoritative module magazine capacity from CCP types.capacity.
ALTER TABLE "FittingModule" ADD COLUMN "capacity" DOUBLE PRECISION;

-- Dedicated static cache for published Category 8 charges accepted by at
-- least one authoritative ship-fittable module.
CREATE TABLE "FittingCharge" (
    "id" UUID NOT NULL,
    "typeId" INTEGER NOT NULL,
    "typeName" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "marketGroupId" INTEGER,
    "marketGroupName" TEXT,
    "metaGroupId" INTEGER,
    "metaGroupName" TEXT,
    "techLevel" INTEGER,
    "chargeSize" INTEGER,
    "volume" DOUBLE PRECISION NOT NULL,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FittingCharge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FittingCharge_typeId_key" ON "FittingCharge"("typeId");
CREATE INDEX "FittingCharge_groupId_typeName_idx" ON "FittingCharge"("groupId", "typeName");
CREATE INDEX "FittingCharge_marketGroupId_idx" ON "FittingCharge"("marketGroupId");
CREATE INDEX "FittingCharge_lastRefreshedAt_idx" ON "FittingCharge"("lastRefreshedAt");
