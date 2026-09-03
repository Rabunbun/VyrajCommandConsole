import type { CharacterSkillSnapshotSafeResult } from "@/lib/eve-sso/private/skills/types";
import type { PrivateEsiCredentialSafeStatus } from "@/lib/eve-sso/private/types";
import type { FitState } from "./fit-state";
import type { EffectiveFitAnalysis } from "./dogma";
import { collectFitSkillSources } from "./skills/analysis";
import {
  createAllVCharacterProfile,
  type CharacterProfile,
  type FittingSkillSource,
  type SkillAnalysis,
  type SkillRequirementAssessment
} from "./skills/types";

export type SimulationProfileMode = "all-v" | "linked-character";

export type FittingSimulationBootstrap = {
  connection: PrivateEsiCredentialSafeStatus | null;
  linkedSnapshot: CharacterSkillSnapshotSafeResult | null;
};

export type FittingSimulationState = {
  analysis: SkillAnalysis | null;
  connection: PrivateEsiCredentialSafeStatus | null;
  error: string | null;
  effectiveAnalysis: EffectiveFitAnalysis | null;
  isAnalyzing: boolean;
  isInitializing: boolean;
  isRefreshing: boolean;
  linkedSnapshot: CharacterSkillSnapshotSafeResult | null;
  mode: SimulationProfileMode;
  profile: CharacterProfile;
  sourceNames: Record<number, string>;
};

export function createInitialFittingSimulationState(): FittingSimulationState {
  return {
    analysis: null,
    connection: null,
    error: null,
    effectiveAnalysis: null,
    isAnalyzing: false,
    isInitializing: true,
    isRefreshing: false,
    linkedSnapshot: null,
    mode: "all-v",
    profile: createAllVCharacterProfile(),
    sourceNames: {}
  };
}

export function initializeFittingSimulationState(
  state: FittingSimulationState,
  input: FittingSimulationBootstrap
): FittingSimulationState {
  const mode = input.linkedSnapshot?.snapshot ? "linked-character" : "all-v";

  return {
    ...state,
    connection: input.connection,
    isInitializing: false,
    linkedSnapshot: input.linkedSnapshot,
    mode,
    profile: createSimulationProfile(mode, input.linkedSnapshot)
  };
}

export function selectFittingSimulationProfile(
  state: FittingSimulationState,
  mode: SimulationProfileMode
): FittingSimulationState {
  return {
    ...state,
    analysis: null,
    effectiveAnalysis: null,
    error: null,
    mode,
    profile: createSimulationProfile(mode, state.linkedSnapshot),
    sourceNames: {}
  };
}

export function createSimulationProfile(
  mode: SimulationProfileMode,
  linkedSnapshot: CharacterSkillSnapshotSafeResult | null
): CharacterProfile {
  if (mode === "all-v") {
    return createAllVCharacterProfile();
  }

  if (!linkedSnapshot?.snapshot) {
    return {
      boosters: { kind: "none" },
      implants: { kind: "none" },
      skillSource: {
        kind: "unavailable",
        reason: "No complete linked-character skill snapshot is available."
      }
    };
  }

  return {
    boosters: { kind: "none" },
    implants: { kind: "none" },
    skillSource: {
      characterId: linkedSnapshot.characterId,
      characterName: linkedSnapshot.characterName,
      eveIdentityId: linkedSnapshot.eveIdentityId,
      kind: "linked-character",
      snapshot: {
        capturedAt: linkedSnapshot.fetchedAt,
        complete: true,
        skills: linkedSnapshot.snapshot.skills.map((skill) => ({
          activeLevel: skill.activeLevel,
          trainedLevel: skill.trainedLevel,
          typeId: skill.skillTypeId
        })),
        stale: linkedSnapshot.snapshot.stale
      }
    }
  };
}

export function collectSimulationSkillSources(fitState: FitState) {
  return collectFitSkillSources(fitState);
}

export function createSimulationAnalysisKey(input: {
  itemSources: FittingSkillSource[];
  linkedSnapshot: CharacterSkillSnapshotSafeResult | null;
  mode: SimulationProfileMode;
}) {
  return JSON.stringify({
    itemSources: input.itemSources,
    linkedSnapshotVersion:
      input.mode === "linked-character"
        ? input.linkedSnapshot?.checkedAt ?? input.linkedSnapshot?.fetchedAt ?? null
        : null,
    mode: input.mode
  });
}

export function getMissingSkillRequirements(analysis: SkillAnalysis | null) {
  return analysis?.requirements.filter((requirement) => requirement.met === false) ?? [];
}

export function getSimulationWarningSummary(state: FittingSimulationState): {
  label: string;
  tone: "neutral" | "success" | "unavailable" | "warning";
} {
  if (state.isInitializing) {
    return { label: "Loading Character Data", tone: "neutral" };
  }

  if (state.mode === "linked-character" && !state.linkedSnapshot?.snapshot) {
    return { label: "Character Data Not Connected", tone: "unavailable" };
  }

  if (!state.analysis || state.analysis.status === "unavailable") {
    return state.isAnalyzing
      ? { label: "Updating Skill Analysis", tone: "neutral" }
      : { label: "Skill Analysis Unavailable", tone: "unavailable" };
  }

  if (state.analysis.missingCount > 0) {
    return {
      label: `${state.analysis.missingCount} Skill${state.analysis.missingCount === 1 ? "" : "s"} Missing`,
      tone: "warning"
    };
  }

  if (
    state.mode === "linked-character" &&
    state.linkedSnapshot?.snapshot?.stale
  ) {
    return { label: "Skills Stale", tone: "warning" };
  }

  return {
    label: state.mode === "all-v" ? "All Requirements Met" : "Skills Current",
    tone: "success"
  };
}

export function getSimulationProfileLabel(state: FittingSimulationState) {
  return state.mode === "all-v"
    ? "All V"
    : state.linkedSnapshot?.characterName ?? "Linked Character";
}

export function formatSkillLevel(level: number | null) {
  if (level === null) {
    return "—";
  }

  return ["0", "I", "II", "III", "IV", "V"][level] ?? String(level);
}

export function formatSkillSourceLabel(
  source: FittingSkillSource,
  sourceNames: Record<number, string>
) {
  const name = sourceNames[source.typeId] ?? `Type ${source.typeId}`;

  if (source.rack && source.slotIndex !== undefined) {
    return `${name} — ${rackLabel(source.rack)} Slot ${source.slotIndex + 1}`;
  }

  return name;
}

export function requirementDisplayRows(analysis: SkillAnalysis | null): Array<{
  activeLevel: number | null;
  requiredLevel: number;
  requirement: SkillRequirementAssessment;
  skillName: string;
  trainedLevel: number | null;
}> {
  return getMissingSkillRequirements(analysis).map((requirement) => ({
    activeLevel: requirement.activeLevel,
    requiredLevel: requirement.requiredLevel,
    requirement,
    skillName: requirement.skillName,
    trainedLevel: requirement.trainedLevel
  }));
}

function rackLabel(rack: FittingSkillSource["rack"]) {
  return rack ? `${rack.slice(0, 1).toLocaleUpperCase("en-US")}${rack.slice(1)}` : "";
}
