-- AlterTable
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "eveTicker" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "ceoId" BIGINT;
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "ceoName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "memberCount" INTEGER;
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "taxRate" DOUBLE PRECISION;
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "creationDate" TIMESTAMP(3);
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "publicDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "publicUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "lastPublicEsiSyncAt" TIMESTAMP(3);
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "publicEsiSyncStatus" TEXT NOT NULL DEFAULT 'Never Synced';
ALTER TABLE "CorpEveIdentityConfig" ADD COLUMN "publicEsiSyncError" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "CorpEveIdentityConfig_publicEsiSyncStatus_idx" ON "CorpEveIdentityConfig"("publicEsiSyncStatus");

-- CreateIndex
CREATE INDEX "CorpEveIdentityConfig_lastPublicEsiSyncAt_idx" ON "CorpEveIdentityConfig"("lastPublicEsiSyncAt");
