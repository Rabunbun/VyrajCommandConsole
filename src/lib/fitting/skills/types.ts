import type { RackType } from "@/lib/fitting/fit-state";

export type SkillLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type RequiredSkillLevel = Exclude<SkillLevel, 0>;

export type ExplicitCharacterSkill = {
  activeLevel: SkillLevel;
  trainedLevel: SkillLevel;
  typeId: number;
};

export type CharacterSkillSnapshot = {
  capturedAt: string | null;
  complete: true;
  skills: ExplicitCharacterSkill[];
  stale: boolean;
};

export type CharacterSkillSource =
  | {
      characterId: string;
      characterName: string;
      eveIdentityId: string;
      kind: "linked-character";
      snapshot: CharacterSkillSnapshot;
    }
  | {
      kind: "all-v";
    }
  | {
      kind: "custom";
      name: string;
      snapshot: CharacterSkillSnapshot;
    }
  | {
      kind: "unavailable";
      reason: string | null;
    };

export type CharacterProfile = {
  boosters:
    | { kind: "none" }
    | { kind: "manual"; typeIds: number[] };
  implants:
    | { kind: "none" }
    | { kind: "manual"; typeIds: number[] };
  skillSource: CharacterSkillSource;
};

export type FittingSkillSource = {
  instanceId?: string;
  kind: "charge" | "drone" | "hull" | "module" | "rig";
  moduleTypeId?: number;
  quantity?: number;
  rack?: RackType;
  slotIndex?: number;
  typeId: number;
};

export type FittingSkillRequirementEdge = {
  ordinal: number;
  requiredLevel: number;
  skillTypeId: number;
  typeId: number;
};

export type FittingSkillName = {
  typeId: number;
  typeName: string;
};

export type SkillRequirementContribution = {
  requiredLevel: RequiredSkillLevel;
  source: FittingSkillSource;
};

export type SkillRequirementAssessment = {
  activeLevel: SkillLevel | null;
  contributingSources: SkillRequirementContribution[];
  met: boolean | null;
  requiredLevel: RequiredSkillLevel;
  skillName: string;
  skillTypeId: number;
  trainedLevel: SkillLevel | null;
};

export type SkillAnalysisDiagnosticCode =
  | "PROFILE_STALE"
  | "PROFILE_UNAVAILABLE"
  | "STATIC_REQUIREMENT_INVALID"
  | "STATIC_SKILL_REFERENCE_UNKNOWN"
  | "STATIC_SKILL_DATA_UNAVAILABLE";

export type SkillAnalysisDiagnostic = {
  code: SkillAnalysisDiagnosticCode;
  message: string;
  skillTypeId?: number;
  typeId?: number;
};

export type SkillAnalysis = {
  diagnostics: SkillAnalysisDiagnostic[];
  missingCount: number;
  requirements: SkillRequirementAssessment[];
  status: "met" | "missing" | "unavailable";
};

export type AnalyzeSkillRequirementsInput = {
  itemSources: FittingSkillSource[];
  profile: CharacterProfile;
  requirementEdges: FittingSkillRequirementEdge[];
  skillNames: FittingSkillName[];
  staticDataStatus: "available" | "unavailable";
};

export function createAllVCharacterProfile(): CharacterProfile {
  return {
    boosters: { kind: "none" },
    implants: { kind: "none" },
    skillSource: { kind: "all-v" }
  };
}
