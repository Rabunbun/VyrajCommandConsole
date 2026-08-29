import "server-only";

import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { FitState } from "@/lib/fitting/fit-state";
import { analyzeSkillRequirements, collectFitSkillSources } from "./analysis";
import type {
  CharacterProfile,
  FittingSkillName,
  FittingSkillRequirementEdge,
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
  const itemSources = collectFitSkillSources(fitState);

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
