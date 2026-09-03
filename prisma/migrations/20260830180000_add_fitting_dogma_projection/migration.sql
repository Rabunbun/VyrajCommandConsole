CREATE TYPE "FittingDogmaEffectCapability" AS ENUM (
    'GENERIC_MODIFIER',
    'METADATA_NONEXECUTING',
    'REQUIRES_SPECIAL_HANDLER',
    'UNSUPPORTED_UNKNOWN'
);

CREATE TABLE "FittingDogmaAttribute" (
    "attributeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "defaultValue" DOUBLE PRECISION,
    "unitId" INTEGER,
    "stackable" BOOLEAN NOT NULL,
    "highIsGood" BOOLEAN,
    "minAttributeId" INTEGER,
    "maxAttributeId" INTEGER,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FittingDogmaAttribute_pkey" PRIMARY KEY ("attributeId")
);

CREATE TABLE "FittingDogmaEffect" (
    "effectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "durationAttributeId" INTEGER,
    "dischargeAttributeId" INTEGER,
    "capability" "FittingDogmaEffectCapability" NOT NULL,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FittingDogmaEffect_pkey" PRIMARY KEY ("effectId")
);

CREATE TABLE "FittingDogmaEffectModifier" (
    "effectId" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "domain" TEXT,
    "functionName" TEXT NOT NULL,
    "operation" INTEGER,
    "modifiedAttributeId" INTEGER,
    "modifyingAttributeId" INTEGER,
    "groupId" INTEGER,
    "skillTypeId" INTEGER,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FittingDogmaEffectModifier_pkey" PRIMARY KEY ("effectId", "ordinal")
);

CREATE TABLE "FittingDogmaTypeProjection" (
    "typeId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "requiredSkillTypeIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "attributes" JSONB NOT NULL,
    "effects" JSONB NOT NULL,
    "projectionVersion" INTEGER NOT NULL,
    "sdeBuild" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FittingDogmaTypeProjection_pkey" PRIMARY KEY ("typeId")
);

CREATE TABLE "FittingDogmaProjectionBuild" (
    "id" TEXT NOT NULL,
    "projectionVersion" INTEGER NOT NULL,
    "sdeBuild" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "rootTypeCount" INTEGER NOT NULL,
    "closureTypeCount" INTEGER NOT NULL,
    "projectedTypeCount" INTEGER NOT NULL,
    "attributeDefinitionCount" INTEGER NOT NULL,
    "effectDefinitionCount" INTEGER NOT NULL,
    "modifierCount" INTEGER NOT NULL,
    "genericEffectCount" INTEGER NOT NULL,
    "metadataEffectCount" INTEGER NOT NULL,
    "specialHandlerEffectCount" INTEGER NOT NULL,
    "unknownEffectCount" INTEGER NOT NULL,
    "malformedReferenceCount" INTEGER NOT NULL,
    "operationIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "modifierFunctions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FittingDogmaProjectionBuild_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FittingDogmaAttribute_unitId_idx" ON "FittingDogmaAttribute"("unitId");
CREATE INDEX "FittingDogmaAttribute_lastRefreshedAt_idx" ON "FittingDogmaAttribute"("lastRefreshedAt");
CREATE INDEX "FittingDogmaEffect_categoryId_idx" ON "FittingDogmaEffect"("categoryId");
CREATE INDEX "FittingDogmaEffect_capability_idx" ON "FittingDogmaEffect"("capability");
CREATE INDEX "FittingDogmaEffect_lastRefreshedAt_idx" ON "FittingDogmaEffect"("lastRefreshedAt");
CREATE INDEX "FittingDogmaEffectModifier_operation_idx" ON "FittingDogmaEffectModifier"("operation");
CREATE INDEX "FittingDogmaEffectModifier_groupId_idx" ON "FittingDogmaEffectModifier"("groupId");
CREATE INDEX "FittingDogmaEffectModifier_skillTypeId_idx" ON "FittingDogmaEffectModifier"("skillTypeId");
CREATE INDEX "FittingDogmaEffectModifier_lastRefreshedAt_idx" ON "FittingDogmaEffectModifier"("lastRefreshedAt");
CREATE INDEX "FittingDogmaTypeProjection_groupId_idx" ON "FittingDogmaTypeProjection"("groupId");
CREATE INDEX "FittingDogmaTypeProjection_categoryId_idx" ON "FittingDogmaTypeProjection"("categoryId");
CREATE INDEX "FittingDogmaTypeProjection_projectionVersion_sdeBuild_idx" ON "FittingDogmaTypeProjection"("projectionVersion", "sdeBuild");
CREATE INDEX "FittingDogmaTypeProjection_lastRefreshedAt_idx" ON "FittingDogmaTypeProjection"("lastRefreshedAt");

ALTER TABLE "FittingDogmaEffectModifier"
ADD CONSTRAINT "FittingDogmaEffectModifier_effectId_fkey"
FOREIGN KEY ("effectId") REFERENCES "FittingDogmaEffect"("effectId")
ON DELETE CASCADE ON UPDATE CASCADE;
