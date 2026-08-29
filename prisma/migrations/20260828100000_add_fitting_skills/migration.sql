-- Normalized published-skill identity and direct type-to-skill requirement
-- projection. Source type IDs intentionally have no foreign keys because they
-- span multiple fitting caches and the global CCP type namespace.
CREATE TABLE "FittingSkill" (
    "id" UUID NOT NULL,
    "typeId" INTEGER NOT NULL,
    "typeName" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FittingSkill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FittingTypeSkillRequirement" (
    "typeId" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "skillTypeId" INTEGER NOT NULL,
    "requiredLevel" INTEGER NOT NULL,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FittingTypeSkillRequirement_pkey" PRIMARY KEY ("typeId", "ordinal"),
    CONSTRAINT "FittingTypeSkillRequirement_ordinal_check" CHECK ("ordinal" BETWEEN 1 AND 6),
    CONSTRAINT "FittingTypeSkillRequirement_requiredLevel_check" CHECK ("requiredLevel" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "FittingSkill_typeId_key" ON "FittingSkill"("typeId");
CREATE INDEX "FittingSkill_groupId_typeName_idx" ON "FittingSkill"("groupId", "typeName");
CREATE INDEX "FittingSkill_lastRefreshedAt_idx" ON "FittingSkill"("lastRefreshedAt");
CREATE INDEX "FittingTypeSkillRequirement_skillTypeId_idx" ON "FittingTypeSkillRequirement"("skillTypeId");
CREATE INDEX "FittingTypeSkillRequirement_lastRefreshedAt_idx" ON "FittingTypeSkillRequirement"("lastRefreshedAt");
