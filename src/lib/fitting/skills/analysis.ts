import type { FitState, RackType } from "@/lib/fitting/fit-state";
import type {
  AnalyzeSkillRequirementsInput,
  CharacterProfile,
  ExplicitCharacterSkill,
  FittingSkillRequirementEdge,
  FittingSkillSource,
  RequiredSkillLevel,
  SkillAnalysis,
  SkillAnalysisDiagnostic,
  SkillLevel,
  SkillRequirementContribution
} from "./types";

const fittingRackOrder: RackType[] = [
  "high",
  "mid",
  "low",
  "rig",
  "subsystem"
];

type RequirementAccumulator = {
  contributions: Map<string, SkillRequirementContribution>;
  requiredLevel: RequiredSkillLevel;
  skillTypeId: number;
};

export function analyzeSkillRequirements({
  itemSources,
  profile,
  requirementEdges,
  skillNames,
  staticDataStatus
}: AnalyzeSkillRequirementsInput): SkillAnalysis {
  const diagnostics: SkillAnalysisDiagnostic[] = [];

  if (staticDataStatus === "unavailable") {
    diagnostics.push({
      code: "STATIC_SKILL_DATA_UNAVAILABLE",
      message: "The fitting skill-requirement cache is unavailable."
    });
  }

  const profileLevels = resolveProfileLevels(profile, diagnostics);
  const skillNameByTypeId = new Map(
    skillNames.map((skill) => [skill.typeId, skill.typeName])
  );
  const sourcesByTypeId = groupSourcesByTypeId(itemSources);
  const requirementsBySkillTypeId = new Map<number, RequirementAccumulator>();

  for (const edge of requirementEdges) {
    const sources = sourcesByTypeId.get(edge.typeId);

    if (!sources?.length) {
      continue;
    }

    if (!isValidRequirementEdge(edge)) {
      diagnostics.push({
        code: "STATIC_REQUIREMENT_INVALID",
        message: `Type ${edge.typeId} has an invalid direct skill requirement in ordinal ${edge.ordinal}.`,
        skillTypeId: edge.skillTypeId,
        typeId: edge.typeId
      });
      continue;
    }

    const requiredLevel = edge.requiredLevel as RequiredSkillLevel;
    const current = requirementsBySkillTypeId.get(edge.skillTypeId) ?? {
      contributions: new Map<string, SkillRequirementContribution>(),
      requiredLevel,
      skillTypeId: edge.skillTypeId
    };

    current.requiredLevel = Math.max(
      current.requiredLevel,
      requiredLevel
    ) as RequiredSkillLevel;

    for (const source of sources) {
      const key = getSourceKey(source);
      const existing = current.contributions.get(key);

      if (!existing || existing.requiredLevel < requiredLevel) {
        current.contributions.set(key, {
          requiredLevel,
          source: { ...source }
        });
      }
    }

    requirementsBySkillTypeId.set(edge.skillTypeId, current);
  }

  const requirements = Array.from(requirementsBySkillTypeId.values())
    .map((requirement) => {
      const skillName = skillNameByTypeId.get(requirement.skillTypeId);

      if (!skillName) {
        diagnostics.push({
          code: "STATIC_SKILL_REFERENCE_UNKNOWN",
          message: `Required skill type ${requirement.skillTypeId} is missing from the authoritative fitting-skill cache.`,
          skillTypeId: requirement.skillTypeId
        });
      }

      const levels = skillName
        ? profileLevels?.kind === "all-v"
          ? allVSkillLevels
          : profileLevels?.levels.get(requirement.skillTypeId) ??
            (profileLevels ? zeroSkillLevels : null)
        : null;
      const activeLevel = levels?.activeLevel ?? null;
      const trainedLevel = levels?.trainedLevel ?? null;

      return {
        activeLevel,
        contributingSources: Array.from(requirement.contributions.values()),
        met:
          activeLevel === null
            ? null
            : activeLevel >= requirement.requiredLevel,
        requiredLevel: requirement.requiredLevel,
        skillName: skillName ?? `Unknown skill ${requirement.skillTypeId}`,
        skillTypeId: requirement.skillTypeId,
        trainedLevel
      };
    })
    .toSorted((left, right) => left.skillTypeId - right.skillTypeId);

  const missingCount = requirements.filter(
    (requirement) => requirement.met === false
  ).length;
  const unavailable = diagnostics.some((diagnostic) =>
    [
      "PROFILE_UNAVAILABLE",
      "STATIC_REQUIREMENT_INVALID",
      "STATIC_SKILL_DATA_UNAVAILABLE",
      "STATIC_SKILL_REFERENCE_UNKNOWN"
    ].includes(diagnostic.code)
  );

  return {
    diagnostics,
    missingCount,
    requirements,
    status: unavailable ? "unavailable" : missingCount > 0 ? "missing" : "met"
  };
}

export function collectFitSkillSources(state: FitState): FittingSkillSource[] {
  const sources: FittingSkillSource[] = [];

  if (state.hullTypeId !== null) {
    sources.push({ kind: "hull", typeId: state.hullTypeId });
  }

  for (const rack of fittingRackOrder) {
    for (const slot of state.slots[rack]) {
      if (!slot.module) {
        continue;
      }

      const moduleSource: FittingSkillSource = {
        instanceId: slot.module.instanceId,
        kind: rack === "rig" ? "rig" : "module",
        rack,
        slotIndex: slot.index,
        typeId: slot.module.typeId
      };
      sources.push(moduleSource);

      if (slot.module.charge) {
        sources.push({
          instanceId: slot.module.instanceId,
          kind: "charge",
          moduleTypeId: slot.module.typeId,
          quantity: slot.module.charge.quantity,
          rack,
          slotIndex: slot.index,
          typeId: slot.module.charge.typeId
        });
      }
    }
  }

  for (const drone of state.drones) {
    sources.push({
      kind: "drone",
      quantity: drone.quantity,
      typeId: drone.typeId
    });
  }

  return sources;
}

function resolveProfileLevels(
  profile: CharacterProfile,
  diagnostics: SkillAnalysisDiagnostic[]
):
  | {
      kind: "all-v";
    }
  | {
      kind: "explicit";
      levels: Map<
        number,
        Pick<ExplicitCharacterSkill, "activeLevel" | "trainedLevel">
      >;
    }
  | null {
  const source = profile.skillSource;

  if (source.kind === "unavailable") {
    diagnostics.push({
      code: "PROFILE_UNAVAILABLE",
      message: source.reason || "The selected character skill profile is unavailable."
    });
    return null;
  }

  if (source.kind === "all-v") {
    return { kind: "all-v" };
  }

  if (source.snapshot.stale) {
    diagnostics.push({
      code: "PROFILE_STALE",
      message: "The selected character skill snapshot is stale; last-known levels were used."
    });
  }

  return {
    kind: "explicit",
    levels: new Map(
      source.snapshot.skills.map((skill) => [
        skill.typeId,
        {
          activeLevel: skill.activeLevel,
          trainedLevel: skill.trainedLevel
        }
      ])
    )
  };
}

const allVSkillLevels = {
  activeLevel: 5 as SkillLevel,
  trainedLevel: 5 as SkillLevel
};

const zeroSkillLevels = {
  activeLevel: 0 as SkillLevel,
  trainedLevel: 0 as SkillLevel
};

function groupSourcesByTypeId(sources: FittingSkillSource[]) {
  const grouped = new Map<number, FittingSkillSource[]>();

  for (const source of sources) {
    const current = grouped.get(source.typeId) ?? [];
    current.push(source);
    grouped.set(source.typeId, current);
  }

  return grouped;
}

function isValidRequirementEdge(edge: FittingSkillRequirementEdge) {
  return (
    Number.isSafeInteger(edge.typeId) &&
    edge.typeId > 0 &&
    Number.isSafeInteger(edge.ordinal) &&
    edge.ordinal >= 1 &&
    edge.ordinal <= 6 &&
    Number.isSafeInteger(edge.skillTypeId) &&
    edge.skillTypeId > 0 &&
    Number.isSafeInteger(edge.requiredLevel) &&
    edge.requiredLevel >= 1 &&
    edge.requiredLevel <= 5
  );
}

function getSourceKey(source: FittingSkillSource) {
  return [
    source.kind,
    source.typeId,
    source.instanceId ?? "",
    source.rack ?? "",
    source.slotIndex ?? "",
    source.moduleTypeId ?? ""
  ].join(":");
}
