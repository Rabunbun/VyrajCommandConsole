-- AlterTable
ALTER TABLE "SrpRequest"
ADD COLUMN "killmailId" BIGINT,
ADD COLUMN "killmailHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN "detectedShipTypeId" INTEGER,
ADD COLUMN "detectedShipName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "selectedShipTypeId" INTEGER,
ADD COLUMN "selectedShipName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "shipDetectionSource" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "killmailTotalValue" DECIMAL(20, 2),
ADD COLUMN "lossValue" DECIMAL(20, 2),
ADD COLUMN "insuranceLevelUsed" TEXT NOT NULL DEFAULT 'Platinum',
ADD COLUMN "insurancePayout" DECIMAL(20, 2),
ADD COLUMN "calculatedEligibleAmount" DECIMAL(20, 2),
ADD COLUMN "calculationSource" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN "calculationWarnings" TEXT NOT NULL DEFAULT '',
ADD COLUMN "srpAssistStatus" TEXT NOT NULL DEFAULT 'not_checked',
ADD COLUMN "srpAssistError" TEXT NOT NULL DEFAULT '',
ADD COLUMN "srpAssistCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SrpInsurancePrice" (
    "id" UUID NOT NULL,
    "typeId" INTEGER NOT NULL,
    "typeName" TEXT NOT NULL DEFAULT '',
    "platinumPayout" DECIMAL(20, 2),
    "rawLevels" JSONB NOT NULL DEFAULT '[]',
    "fetchStatus" TEXT NOT NULL DEFAULT 'not_checked',
    "fetchError" TEXT NOT NULL DEFAULT '',
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SrpInsurancePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SrpRequest_killmailId_idx" ON "SrpRequest"("killmailId");

-- CreateIndex
CREATE INDEX "SrpRequest_detectedShipTypeId_idx" ON "SrpRequest"("detectedShipTypeId");

-- CreateIndex
CREATE INDEX "SrpRequest_selectedShipTypeId_idx" ON "SrpRequest"("selectedShipTypeId");

-- CreateIndex
CREATE INDEX "SrpRequest_srpAssistStatus_idx" ON "SrpRequest"("srpAssistStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SrpInsurancePrice_typeId_key" ON "SrpInsurancePrice"("typeId");

-- CreateIndex
CREATE INDEX "SrpInsurancePrice_fetchStatus_idx" ON "SrpInsurancePrice"("fetchStatus");

-- CreateIndex
CREATE INDEX "SrpInsurancePrice_lastFetchedAt_idx" ON "SrpInsurancePrice"("lastFetchedAt");
