-- CreateEnum
CREATE TYPE "CorpStatus" AS ENUM ('ACTIVE', 'TRIAL', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OfficerRole" AS ENUM ('SUPER_ADMIN', 'ALLIANCE_OFFICER');

-- CreateEnum
CREATE TYPE "OfficerStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('ACTIVE', 'DRAFT', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentAudience" AS ENUM ('ALL_MEMBERS', 'OFFICERS', 'SUPER_ADMINS');

-- CreateEnum
CREATE TYPE "AllianceContentType" AS ENUM ('ANNOUNCEMENT', 'ALERT', 'PRIORITY', 'STANDING_ORDER', 'FEATURED_OP', 'NOTE');

-- CreateEnum
CREATE TYPE "AllianceContentPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "Corp" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "CorpStatus" NOT NULL DEFAULT 'ACTIVE',
    "recruitmentStatus" TEXT NOT NULL DEFAULT 'Unknown',
    "activeMembers" INTEGER NOT NULL DEFAULT 0,
    "recentOps" INTEGER NOT NULL DEFAULT 0,
    "pendingSrp" INTEGER NOT NULL DEFAULT 0,
    "doctrineReadinessPercent" INTEGER NOT NULL DEFAULT 0,
    "announcements" JSONB NOT NULL DEFAULT '[]',
    "enabledModules" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "Corp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceHubContent" (
    "id" UUID NOT NULL,
    "contentType" "AllianceContentType" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "ContentAudience" NOT NULL DEFAULT 'ALL_MEMBERS',
    "priority" "AllianceContentPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "AllianceHubContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Officer" (
    "id" UUID NOT NULL,
    "officerName" TEXT NOT NULL,
    "role" "OfficerRole" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "OfficerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "Officer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficerSession" (
    "id" UUID NOT NULL,
    "officerId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "OfficerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficerCorpAssignment" (
    "id" UUID NOT NULL,
    "officerId" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficerCorpAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficerPermission" (
    "id" UUID NOT NULL,
    "officerId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "corpId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficerPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficerAuditLog" (
    "id" UUID NOT NULL,
    "officerId" UUID,
    "officerName" TEXT NOT NULL DEFAULT '',
    "officerRole" TEXT NOT NULL DEFAULT '',
    "corpId" UUID,
    "corpSlug" TEXT NOT NULL DEFAULT '',
    "corpName" TEXT NOT NULL DEFAULT '',
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "permissionUsed" TEXT NOT NULL DEFAULT '',
    "targetType" TEXT NOT NULL DEFAULT '',
    "targetId" TEXT NOT NULL DEFAULT '',
    "targetName" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "OfficerAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyImportMap" (
    "id" UUID NOT NULL,
    "sourceSystem" TEXT NOT NULL DEFAULT 'google_apps_script',
    "legacySheetName" TEXT NOT NULL,
    "legacyRowNumber" INTEGER,
    "legacyKey" TEXT,
    "targetModel" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "sourcePayload" JSONB,
    "legacyImportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyImportMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "operationCode" TEXT,
    "operationName" TEXT NOT NULL,
    "operationType" TEXT NOT NULL DEFAULT '',
    "operationDate" TIMESTAMP(3),
    "fcLead" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "doctrineUsed" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationAttendance" (
    "id" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "pilotName" TEXT NOT NULL DEFAULT '',
    "characterName" TEXT NOT NULL,
    "discordName" TEXT NOT NULL DEFAULT '',
    "roleFlown" TEXT NOT NULL DEFAULT '',
    "shipFlown" TEXT NOT NULL DEFAULT '',
    "rewardEligible" TEXT NOT NULL DEFAULT 'Not Yet Paid',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "OperationAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SrpRequest" (
    "id" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "pilotName" TEXT NOT NULL DEFAULT '',
    "characterName" TEXT NOT NULL,
    "discordName" TEXT NOT NULL DEFAULT '',
    "shipLost" TEXT NOT NULL,
    "killmailLink" TEXT NOT NULL DEFAULT '',
    "doctrineFleet" TEXT NOT NULL DEFAULT '',
    "lossType" TEXT NOT NULL DEFAULT '',
    "estimatedValue" DECIMAL(20,2),
    "requestedPayout" DECIMAL(20,2),
    "reviewer" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'New',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "SrpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctrineFit" (
    "id" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "doctrineCode" TEXT,
    "doctrineName" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "shipHull" TEXT NOT NULL DEFAULT '',
    "shipTypeId" INTEGER,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "manualImageUrl" TEXT NOT NULL DEFAULT '',
    "fitText" TEXT NOT NULL DEFAULT '',
    "addedBy" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "DoctrineFit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctrineFitReadiness" (
    "id" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "doctrineFitId" UUID,
    "pilotName" TEXT NOT NULL DEFAULT '',
    "characterName" TEXT NOT NULL,
    "discordName" TEXT NOT NULL DEFAULT '',
    "readiness" TEXT NOT NULL DEFAULT 'Unknown',
    "canFlyHull" TEXT NOT NULL DEFAULT 'Unknown',
    "canUseWeapons" TEXT NOT NULL DEFAULT 'Unknown',
    "canUseTank" TEXT NOT NULL DEFAULT 'Unknown',
    "canUsePropUtility" TEXT NOT NULL DEFAULT 'Unknown',
    "missingSkills" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "DoctrineFitReadiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctrinePilot" (
    "id" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "pilotName" TEXT NOT NULL DEFAULT '',
    "characterName" TEXT NOT NULL,
    "discordName" TEXT NOT NULL DEFAULT '',
    "primaryRole" TEXT NOT NULL DEFAULT '',
    "secondaryRoles" TEXT NOT NULL DEFAULT '',
    "tackle" TEXT NOT NULL DEFAULT 'Unknown',
    "scout" TEXT NOT NULL DEFAULT 'Unknown',
    "logi" TEXT NOT NULL DEFAULT 'Unknown',
    "dps" TEXT NOT NULL DEFAULT 'Unknown',
    "ewar" TEXT NOT NULL DEFAULT 'Unknown',
    "miningSupport" TEXT NOT NULL DEFAULT 'Unknown',
    "hauler" TEXT NOT NULL DEFAULT 'Unknown',
    "pochven" TEXT NOT NULL DEFAULT 'Unknown',
    "fc" TEXT NOT NULL DEFAULT 'Unknown',
    "preferredShips" TEXT NOT NULL DEFAULT '',
    "missingSkills" TEXT NOT NULL DEFAULT '',
    "reviewer" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "DoctrinePilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitmentApplicant" (
    "id" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "applicantName" TEXT NOT NULL,
    "mainCharacter" TEXT NOT NULL DEFAULT '',
    "discordName" TEXT NOT NULL DEFAULT '',
    "timeZone" TEXT NOT NULL DEFAULT '',
    "preferredContent" TEXT NOT NULL DEFAULT '',
    "skillPoints" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "recruitmentChannel" TEXT NOT NULL DEFAULT '',
    "recruiter" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'New',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "RecruitmentApplicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LootSplit" (
    "id" UUID NOT NULL,
    "corpId" UUID NOT NULL,
    "operationName" TEXT NOT NULL,
    "operationType" TEXT NOT NULL DEFAULT '',
    "totalIskValue" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "corpCutPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "corpCutAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "srpReservePercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "srpReserveAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "payoutPool" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "totalShares" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'Ready',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "LootSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LootSplitParticipant" (
    "id" UUID NOT NULL,
    "lootSplitId" UUID NOT NULL,
    "pilotName" TEXT NOT NULL,
    "characterName" TEXT NOT NULL DEFAULT '',
    "shares" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "payoutAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "LootSplitParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EveTypeLookup" (
    "id" UUID NOT NULL,
    "typeName" TEXT NOT NULL,
    "typeId" INTEGER,
    "category" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySheetName" TEXT,
    "legacyRowNumber" INTEGER,
    "legacyImportedAt" TIMESTAMP(3),

    CONSTRAINT "EveTypeLookup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Corp_slug_key" ON "Corp"("slug");

-- CreateIndex
CREATE INDEX "Corp_status_idx" ON "Corp"("status");

-- CreateIndex
CREATE INDEX "Corp_legacySheetName_legacyRowNumber_idx" ON "Corp"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE INDEX "AllianceHubContent_status_audience_idx" ON "AllianceHubContent"("status", "audience");

-- CreateIndex
CREATE INDEX "AllianceHubContent_startDate_endDate_idx" ON "AllianceHubContent"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "AllianceHubContent_legacySheetName_legacyRowNumber_idx" ON "AllianceHubContent"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Officer_officerName_key" ON "Officer"("officerName");

-- CreateIndex
CREATE INDEX "Officer_role_status_idx" ON "Officer"("role", "status");

-- CreateIndex
CREATE INDEX "Officer_legacySheetName_legacyRowNumber_idx" ON "Officer"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OfficerSession_tokenHash_key" ON "OfficerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "OfficerSession_officerId_idx" ON "OfficerSession"("officerId");

-- CreateIndex
CREATE INDEX "OfficerSession_expiresAt_idx" ON "OfficerSession"("expiresAt");

-- CreateIndex
CREATE INDEX "OfficerCorpAssignment_corpId_idx" ON "OfficerCorpAssignment"("corpId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficerCorpAssignment_officerId_corpId_key" ON "OfficerCorpAssignment"("officerId", "corpId");

-- CreateIndex
CREATE INDEX "OfficerPermission_officerId_permissionKey_idx" ON "OfficerPermission"("officerId", "permissionKey");

-- CreateIndex
CREATE INDEX "OfficerPermission_corpId_idx" ON "OfficerPermission"("corpId");

-- CreateIndex
CREATE INDEX "OfficerAuditLog_corpId_createdAt_idx" ON "OfficerAuditLog"("corpId", "createdAt");

-- CreateIndex
CREATE INDEX "OfficerAuditLog_module_action_idx" ON "OfficerAuditLog"("module", "action");

-- CreateIndex
CREATE INDEX "OfficerAuditLog_officerId_idx" ON "OfficerAuditLog"("officerId");

-- CreateIndex
CREATE INDEX "OfficerAuditLog_legacySheetName_legacyRowNumber_idx" ON "OfficerAuditLog"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE INDEX "LegacyImportMap_targetModel_targetId_idx" ON "LegacyImportMap"("targetModel", "targetId");

-- CreateIndex
CREATE INDEX "LegacyImportMap_legacySheetName_idx" ON "LegacyImportMap"("legacySheetName");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyImportMap_sourceSystem_legacySheetName_legacyRowNumbe_key" ON "LegacyImportMap"("sourceSystem", "legacySheetName", "legacyRowNumber", "targetModel");

-- CreateIndex
CREATE INDEX "Operation_corpId_status_idx" ON "Operation"("corpId", "status");

-- CreateIndex
CREATE INDEX "Operation_operationDate_idx" ON "Operation"("operationDate");

-- CreateIndex
CREATE INDEX "Operation_legacySheetName_legacyRowNumber_idx" ON "Operation"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE INDEX "OperationAttendance_corpId_idx" ON "OperationAttendance"("corpId");

-- CreateIndex
CREATE INDEX "OperationAttendance_legacySheetName_legacyRowNumber_idx" ON "OperationAttendance"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OperationAttendance_operationId_characterName_key" ON "OperationAttendance"("operationId", "characterName");

-- CreateIndex
CREATE INDEX "SrpRequest_corpId_status_idx" ON "SrpRequest"("corpId", "status");

-- CreateIndex
CREATE INDEX "SrpRequest_legacySheetName_legacyRowNumber_idx" ON "SrpRequest"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE INDEX "DoctrineFit_corpId_status_idx" ON "DoctrineFit"("corpId", "status");

-- CreateIndex
CREATE INDEX "DoctrineFit_shipTypeId_idx" ON "DoctrineFit"("shipTypeId");

-- CreateIndex
CREATE INDEX "DoctrineFit_legacySheetName_legacyRowNumber_idx" ON "DoctrineFit"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE INDEX "DoctrineFitReadiness_corpId_readiness_idx" ON "DoctrineFitReadiness"("corpId", "readiness");

-- CreateIndex
CREATE INDEX "DoctrineFitReadiness_doctrineFitId_idx" ON "DoctrineFitReadiness"("doctrineFitId");

-- CreateIndex
CREATE INDEX "DoctrineFitReadiness_legacySheetName_legacyRowNumber_idx" ON "DoctrineFitReadiness"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE INDEX "DoctrinePilot_corpId_status_idx" ON "DoctrinePilot"("corpId", "status");

-- CreateIndex
CREATE INDEX "DoctrinePilot_legacySheetName_legacyRowNumber_idx" ON "DoctrinePilot"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE INDEX "RecruitmentApplicant_corpId_status_idx" ON "RecruitmentApplicant"("corpId", "status");

-- CreateIndex
CREATE INDEX "RecruitmentApplicant_legacySheetName_legacyRowNumber_idx" ON "RecruitmentApplicant"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE INDEX "LootSplit_corpId_status_idx" ON "LootSplit"("corpId", "status");

-- CreateIndex
CREATE INDEX "LootSplit_legacySheetName_legacyRowNumber_idx" ON "LootSplit"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE INDEX "LootSplitParticipant_lootSplitId_idx" ON "LootSplitParticipant"("lootSplitId");

-- CreateIndex
CREATE INDEX "LootSplitParticipant_legacySheetName_legacyRowNumber_idx" ON "LootSplitParticipant"("legacySheetName", "legacyRowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EveTypeLookup_typeName_key" ON "EveTypeLookup"("typeName");

-- CreateIndex
CREATE UNIQUE INDEX "EveTypeLookup_typeId_key" ON "EveTypeLookup"("typeId");

-- CreateIndex
CREATE INDEX "EveTypeLookup_category_idx" ON "EveTypeLookup"("category");

-- CreateIndex
CREATE INDEX "EveTypeLookup_legacySheetName_legacyRowNumber_idx" ON "EveTypeLookup"("legacySheetName", "legacyRowNumber");

-- AddForeignKey
ALTER TABLE "OfficerSession" ADD CONSTRAINT "OfficerSession_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerCorpAssignment" ADD CONSTRAINT "OfficerCorpAssignment_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerCorpAssignment" ADD CONSTRAINT "OfficerCorpAssignment_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerPermission" ADD CONSTRAINT "OfficerPermission_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerPermission" ADD CONSTRAINT "OfficerPermission_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerAuditLog" ADD CONSTRAINT "OfficerAuditLog_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficerAuditLog" ADD CONSTRAINT "OfficerAuditLog_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationAttendance" ADD CONSTRAINT "OperationAttendance_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationAttendance" ADD CONSTRAINT "OperationAttendance_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SrpRequest" ADD CONSTRAINT "SrpRequest_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctrineFit" ADD CONSTRAINT "DoctrineFit_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctrineFitReadiness" ADD CONSTRAINT "DoctrineFitReadiness_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctrineFitReadiness" ADD CONSTRAINT "DoctrineFitReadiness_doctrineFitId_fkey" FOREIGN KEY ("doctrineFitId") REFERENCES "DoctrineFit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctrinePilot" ADD CONSTRAINT "DoctrinePilot_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentApplicant" ADD CONSTRAINT "RecruitmentApplicant_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootSplit" ADD CONSTRAINT "LootSplit_corpId_fkey" FOREIGN KEY ("corpId") REFERENCES "Corp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootSplitParticipant" ADD CONSTRAINT "LootSplitParticipant_lootSplitId_fkey" FOREIGN KEY ("lootSplitId") REFERENCES "LootSplit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
