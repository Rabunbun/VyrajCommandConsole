import "server-only";

import { FittingDogmaEffectCapability, Prisma } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { FittingSkillSource, CharacterProfile } from "../skills/types";
import {
  analyzeEffectiveFitResources,
  DOGMA_PROJECTION_VERSION,
  type DogmaAttributeDefinition,
  type DogmaEffectCapability,
  type DogmaEffectDefinition,
  type DogmaTypeProjection,
  type EffectiveFitAnalysis,
  type EffectiveResourceModuleInput,
  type EffectiveResourceSkillInput,
  type EngineDiagnostic
} from ".";

export async function analyzeFittingEffectiveResources(
  itemSources: readonly FittingSkillSource[],
  profile: CharacterProfile
): Promise<EffectiveFitAnalysis> {
  const hullSource = itemSources.find((source) => source.kind === "hull");
  const moduleSources = itemSources.filter(
    (source) => source.kind === "module" || source.kind === "rig"
  );
  const resolvedProfile = resolveProfile(profile);

  if (resolvedProfile.kind === "unavailable") {
    return analyzeEffectiveFitResources({
      attributeDefinitions: [],
      effectDefinitions: [],
      hull: null,
      modules: [],
      profile: resolvedProfile,
      staticDataAvailable: false
    });
  }

  if (!isDatabaseConfigured() || !hullSource) {
    return analyzeEffectiveFitResources({
      attributeDefinitions: [],
      effectDefinitions: [],
      hull: null,
      modules: [],
      profile: { ...resolvedProfile, skills: [] },
      profileDiagnostics: resolvedProfile.diagnostics,
      staticDataAvailable: false
    });
  }

  const fitTypeIds = Array.from(
    new Set([hullSource.typeId, ...moduleSources.map((source) => source.typeId)])
  );
  const db = getDb();
  const [build, projectionRows, attributeRows] = await Promise.all([
    db.fittingDogmaProjectionBuild.findUnique({ where: { id: "current" } }),
    db.fittingDogmaTypeProjection.findMany({
      where:
        resolvedProfile.kind === "all-v"
          ? { OR: [{ categoryId: 16 }, { typeId: { in: fitTypeIds } }] }
          : {
              typeId: {
                in: Array.from(
                  new Set([
                    ...fitTypeIds,
                    ...resolvedProfile.levels.keys()
                  ])
                )
              }
            }
    }),
    db.fittingDogmaAttribute.findMany()
  ]);
  const projections = projectionRows.flatMap((row) => {
    const projection = parseProjection(row);
    return projection ? [projection] : [];
  });
  const projectionByTypeId = new Map(
    projections.map((projection) => [projection.typeId, projection])
  );
  const skillProjections = projections.filter(
    (projection) => projection.categoryId === 16
  );
  const effectIds = Array.from(
    new Set(
      projections.flatMap((projection) =>
        projection.effects.map((effect) => effect.effectId)
      )
    )
  );
  const effectRows = effectIds.length
    ? await db.fittingDogmaEffect.findMany({
        include: { modifiers: { orderBy: { ordinal: "asc" } } },
        where: { effectId: { in: effectIds } }
      })
    : [];
  const effectDefinitions = effectRows.map((effect) => ({
    capability: toKernelCapability(effect.capability),
    categoryId: effect.categoryId,
    dischargeAttributeId: effect.dischargeAttributeId,
    durationAttributeId: effect.durationAttributeId,
    effectId: effect.effectId,
    modifiers: effect.modifiers.map((modifier) => ({
      domain: modifier.domain,
      effectId: modifier.effectId,
      functionName: modifier.functionName,
      groupId: modifier.groupId,
      modifiedAttributeId: modifier.modifiedAttributeId,
      modifyingAttributeId: modifier.modifyingAttributeId,
      operation: modifier.operation,
      ordinal: modifier.ordinal,
      skillTypeId: modifier.skillTypeId
    })),
    name: effect.name
  })) satisfies DogmaEffectDefinition[];
  const attributeDefinitions = attributeRows.map((attribute) => ({
    attributeId: attribute.attributeId,
    defaultValue: attribute.defaultValue,
    highIsGood: attribute.highIsGood,
    maxAttributeId: attribute.maxAttributeId,
    minAttributeId: attribute.minAttributeId,
    name: attribute.name,
    stackable: attribute.stackable,
    unitId: attribute.unitId
  })) satisfies DogmaAttributeDefinition[];
  const hull = projectionByTypeId.get(hullSource.typeId) ?? null;
  const modules = moduleSources.flatMap((source) => {
    const projection = projectionByTypeId.get(source.typeId);
    if (
      !projection ||
      !source.instanceId ||
      source.rack === undefined ||
      source.slotIndex === undefined
    ) {
      return [];
    }

    return [{
      index: source.slotIndex,
      instanceId: source.instanceId,
      projection,
      rack: source.rack
    } satisfies EffectiveResourceModuleInput];
  });
  const skills = skillProjections.flatMap((projection) => {
    const activeLevel =
      resolvedProfile.kind === "all-v"
        ? 5
        : resolvedProfile.levels.get(projection.typeId) ?? 0;

    return activeLevel > 0
      ? [{ activeLevel, projection } satisfies EffectiveResourceSkillInput]
      : [];
  });
  const rowsMatchBuild = Boolean(
    build &&
      build.projectionVersion === DOGMA_PROJECTION_VERSION &&
      projectionRows.every(
        (row) =>
          row.projectionVersion === build.projectionVersion &&
          row.sdeBuild === build.sdeBuild
      )
  );
  const complete =
    rowsMatchBuild &&
    projections.length === projectionRows.length &&
    Boolean(hull) &&
    modules.length === moduleSources.length &&
    effectDefinitions.length === effectIds.length;

  return analyzeEffectiveFitResources({
    attributeDefinitions,
    effectDefinitions,
    hull,
    modules,
    profile: { kind: resolvedProfile.kind, skills },
    profileDiagnostics: resolvedProfile.diagnostics,
    staticDataAvailable: complete
  });
}

function resolveProfile(profile: CharacterProfile):
  | {
      diagnostics: EngineDiagnostic[];
      kind: "all-v";
      levels: Map<number, number>;
    }
  | {
      diagnostics: EngineDiagnostic[];
      kind: "explicit";
      levels: Map<number, number>;
    }
  | { kind: "unavailable"; reason: string } {
  if (profile.skillSource.kind === "unavailable") {
    return {
      kind: "unavailable",
      reason:
        profile.skillSource.reason ||
        "The selected character skill profile is unavailable."
    };
  }
  if (profile.skillSource.kind === "all-v") {
    return { diagnostics: [], kind: "all-v", levels: new Map() };
  }

  return {
    diagnostics: profile.skillSource.snapshot.stale
      ? [{
          code: "effective-resource-profile-stale",
          message: "The selected character skill snapshot is stale; last-known active levels were used.",
          severity: "warning"
        }]
      : [],
    kind: "explicit",
    levels: new Map(
      profile.skillSource.snapshot.skills.map((skill) => [
        skill.typeId,
        skill.activeLevel
      ])
    )
  };
}

function parseProjection(row: {
  attributes: Prisma.JsonValue;
  categoryId: number;
  effects: Prisma.JsonValue;
  groupId: number;
  requiredSkillTypeIds: number[];
  typeId: number;
}): DogmaTypeProjection | null {
  if (!Array.isArray(row.attributes) || !Array.isArray(row.effects)) return null;
  const attributes = row.attributes.flatMap((value) =>
    isObject(value) &&
    isPositiveInteger(value.attributeId) &&
    isFiniteNumber(value.value)
      ? [{ attributeId: value.attributeId, value: value.value }]
      : []
  );
  const effects = row.effects.flatMap((value) =>
    isObject(value) &&
    isPositiveInteger(value.effectId) &&
    typeof value.isDefault === "boolean"
      ? [{ effectId: value.effectId, isDefault: value.isDefault }]
      : []
  );
  if (attributes.length !== row.attributes.length || effects.length !== row.effects.length) {
    return null;
  }

  return {
    attributes,
    categoryId: row.categoryId,
    effects,
    groupId: row.groupId,
    requiredSkillTypeIds: row.requiredSkillTypeIds,
    typeId: row.typeId
  };
}

function toKernelCapability(
  capability: FittingDogmaEffectCapability
): DogmaEffectCapability {
  switch (capability) {
    case FittingDogmaEffectCapability.GENERIC_MODIFIER:
      return "generic-modifier";
    case FittingDogmaEffectCapability.METADATA_NONEXECUTING:
      return "metadata-nonexecuting";
    case FittingDogmaEffectCapability.REQUIRES_SPECIAL_HANDLER:
      return "requires-special-handler";
    case FittingDogmaEffectCapability.UNSUPPORTED_UNKNOWN:
      return "unsupported-unknown";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
