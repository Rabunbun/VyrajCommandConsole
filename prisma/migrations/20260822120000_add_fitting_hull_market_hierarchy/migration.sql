ALTER TABLE "FittingHull"
ADD COLUMN "marketGroupId" INTEGER,
ADD COLUMN "marketGroupName" TEXT,
ADD COLUMN "marketGroupPathIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "marketGroupPathNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "FittingHull_marketGroupId_idx" ON "FittingHull"("marketGroupId");
