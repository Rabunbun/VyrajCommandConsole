import "server-only";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { FitState } from "@/lib/fitting/fit-state";
import { analyzeSkillRequirements, collectFitSkillSources } from "./analysis";
import type {
  CharacterProfile,
  FittingSkillName,
  FittingSkillRequirementEdge,
  FittingSkillSource,
  SkillAnalysis
} from "./types";

export type ResolvedFitSkillStaticData = {
  itemSources: ReturnType<typeof collectFitSkillSources>;
  requirementEdges: FittingSkillRequirementEdge[];
  skillNames: FittingSkillName[];
  staticDataStatus: "available" | "unavailable";
};

export async function resolveFitSkillStaticData(
  fitState: FitState
): Promise<ResolvedFitSkillStaticData> {
  return resolveSkillStaticDataForSources(collectFitSkillSources(fitState));
}

export async function resolveSkillStaticDataForSources(
  itemSources: FittingSkillSource[]
): Promise<ResolvedFitSkillStaticData> {
  if (itemSources.length === 0) {
    return {
      itemSources,
      requirementEdges: [],
      skillNames: [],
      staticDataStatus: "available"
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      itemSources,
      requirementEdges: [],
      skillNames: [],
      staticDataStatus: "unavailable"
    };
  }

  const sourceTypeIds = Array.from(
    new Set(itemSources.map((source) => source.typeId))
  );
  const db = getDb();
  const [skillCacheRecord, requirementCacheRecord, requirementRows] =
    await Promise.all([
      db.fittingSkill.findFirst({ select: { typeId: true } }),
      db.fittingTypeSkillRequirement.findFirst({
        select: { ordinal: true, typeId: true }
      }),
      sourceTypeIds.length
        ? db.fittingTypeSkillRequirement.findMany({
            select: {
              ordinal: true,
              requiredLevel: true,
              skillTypeId: true,
              typeId: true
            },
            where: { typeId: { in: sourceTypeIds } }
          })
        : Promise.resolve([])
    ]);
  const requiredSkillTypeIds = Array.from(
    new Set(requirementRows.map((requirement) => requirement.skillTypeId))
  );
  const skillRows = requiredSkillTypeIds.length
    ? await db.fittingSkill.findMany({
        select: { typeId: true, typeName: true },
        where: { typeId: { in: requiredSkillTypeIds } }
      })
    : [];

  return {
    itemSources,
    requirementEdges: requirementRows,
    skillNames: skillRows,
    staticDataStatus:
      skillCacheRecord && requirementCacheRecord ? "available" : "unavailable"
  };
}

export async function resolveFittingSkillSourceNames(
  itemSources: FittingSkillSource[]
): Promise<Record<number, string>> {
  if (!isDatabaseConfigured()) {
    return {};
  }

  const typeIdsByFamily = {
    charges: uniqueTypeIds(itemSources, new Set(["charge"])),
    drones: uniqueTypeIds(itemSources, new Set(["drone"])),
    hulls: uniqueTypeIds(itemSources, new Set(["hull"])),
    modules: uniqueTypeIds(itemSources, new Set(["module", "rig"]))
  };
  const db = getDb();
  const [hulls, modules, charges, drones] = await Promise.all([
    typeIdsByFamily.hulls.length
      ? db.fittingHull.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: typeIdsByFamily.hulls } }
        })
      : Promise.resolve([]),
    typeIdsByFamily.modules.length
      ? db.fittingModule.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: typeIdsByFamily.modules } }
        })
      : Promise.resolve([]),
    typeIdsByFamily.charges.length
      ? db.fittingCharge.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: typeIdsByFamily.charges } }
        })
      : Promise.resolve([]),
    typeIdsByFamily.drones.length
      ? db.fittingDrone.findMany({
          select: { typeId: true, typeName: true },
          where: { typeId: { in: typeIdsByFamily.drones } }
        })
      : Promise.resolve([])
  ]);

  return Object.fromEntries(
    [...hulls, ...modules, ...charges, ...drones].map((item) => [
      item.typeId,
      item.typeName
    ])
  );
}

export async function analyzeFitSkillRequirements(
  fitState: FitState,
  profile: CharacterProfile
): Promise<SkillAnalysis> {
  const staticData = await resolveFitSkillStaticData(fitState);

  return analyzeSkillRequirements({
    ...staticData,
    profile
  });
}

export async function analyzeFittingSkillSources(
  itemSources: FittingSkillSource[],
  profile: CharacterProfile
): Promise<SkillAnalysis> {
  const staticData = await resolveSkillStaticDataForSources(itemSources);

  return analyzeSkillRequirements({ ...staticData, profile });
}

function uniqueTypeIds(
  itemSources: FittingSkillSource[],
  kinds: Set<FittingSkillSource["kind"]>
) {
  return Array.from(
    new Set(
      itemSources
        .filter((source) => kinds.has(source.kind))
        .map((source) => source.typeId)
    )
  );
}
