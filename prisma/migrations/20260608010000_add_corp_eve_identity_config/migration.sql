-- CreateTable
CREATE TABLE "CorpEveIdentityConfig" (
    "id" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "eveCorporationId" BIGINT,
    "eveCorporationName" TEXT NOT NULL DEFAULT '',
    "eveAllianceId" BIGINT,
    "eveAllianceName" TEXT NOT NULL DEFAULT '',
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorpEveIdentityConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorpEveIdentityConfig_corpId_key" ON "CorpEveIdentityConfig"("corpId");

-- CreateIndex
CREATE UNIQUE INDEX "CorpEveIdentityConfig_eveCorporationId_key" ON "CorpEveIdentityConfig"("eveCorporationId");

-- CreateIndex
CREATE INDEX "CorpEveIdentityConfig_eveAllianceId_idx" ON "CorpEveIdentityConfig"("eveAllianceId");

-- CreateIndex
CREATE INDEX "CorpEveIdentityConfig_syncEnabled_idx" ON "CorpEveIdentityConfig"("syncEnabled");

-- AddForeignKey
ALTER TABLE "CorpEveIdentityConfig" ADD CONSTRAINT "CorpEveIdentityConfig_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
