-- CreateTable
CREATE TABLE "FittingHull" (
    "id" UUID NOT NULL,
    "typeId" INTEGER NOT NULL,
    "typeName" TEXT NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT '',
    "categoryName" TEXT NOT NULL DEFAULT '',
    "highSlots" INTEGER NOT NULL DEFAULT 0,
    "midSlots" INTEGER NOT NULL DEFAULT 0,
    "lowSlots" INTEGER NOT NULL DEFAULT 0,
    "rigSlots" INTEGER NOT NULL DEFAULT 0,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FittingHull_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FittingHull_typeId_key" ON "FittingHull"("typeId");

-- CreateIndex
CREATE INDEX "FittingHull_typeName_idx" ON "FittingHull"("typeName");

-- CreateIndex
CREATE INDEX "FittingHull_groupName_idx" ON "FittingHull"("groupName");

-- CreateIndex
CREATE INDEX "FittingHull_categoryName_idx" ON "FittingHull"("categoryName");

-- CreateIndex
CREATE INDEX "FittingHull_lastRefreshedAt_idx" ON "FittingHull"("lastRefreshedAt");
