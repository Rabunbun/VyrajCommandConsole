-- CreateEnum
CREATE TYPE "LoginProvider" AS ENUM ('MANUAL', 'EVE_SSO');

-- CreateTable
CREATE TABLE "EveIdentity" (
    "id" UUID NOT NULL,
    "characterId" BIGINT NOT NULL,
    "characterName" TEXT NOT NULL,
    "corporationId" BIGINT,
    "corporationName" TEXT NOT NULL DEFAULT '',
    "allianceId" BIGINT,
    "allianceName" TEXT NOT NULL DEFAULT '',
    "officerId" UUID,
    "memberCorpId" UUID,
    "provider" "LoginProvider" NOT NULL DEFAULT 'EVE_SSO',
    "linkedAt" TIMESTAMP(3),
    "lastEveLoginAt" TIMESTAMP(3),
    "lastIdentityRefreshAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EveIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EveIdentity_characterId_key" ON "EveIdentity"("characterId");

-- CreateIndex
CREATE INDEX "EveIdentity_corporationId_idx" ON "EveIdentity"("corporationId");

-- CreateIndex
CREATE INDEX "EveIdentity_allianceId_idx" ON "EveIdentity"("allianceId");

-- CreateIndex
CREATE INDEX "EveIdentity_officerId_idx" ON "EveIdentity"("officerId");

-- CreateIndex
CREATE INDEX "EveIdentity_memberCorpId_idx" ON "EveIdentity"("memberCorpId");

-- AddForeignKey
ALTER TABLE "EveIdentity" ADD CONSTRAINT "EveIdentity_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EveIdentity" ADD CONSTRAINT "EveIdentity_memberCorpId_fkey" FOREIGN KEY ("memberCorpId") REFERENCES "Corp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
