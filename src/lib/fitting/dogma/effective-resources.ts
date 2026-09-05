import type { RackType } from "../fit-state";
import { attributeKey } from "./dependency";
import { evaluateDogmaAttributes } from "./evaluation";
import { buildDogmaObjectGraph } from "./object-graph";
import {
  analyzePassiveStats,
  PASSIVE_STAT_TARGET_ATTRIBUTE_IDS,
  unavailablePassiveStats,
  type PassiveCapacityAnalysis,
  type PassiveDefenseAnalysis,
  type PassiveNavigationAnalysis,
  type PassiveTargetingAnalysis
} from "./passive-stats";
import type {
  AttributeResult,
  DogmaAttributeDefinition,
  DogmaEffectDefinition,
  DogmaTypeProjection,
  EngineDiagnostic,
  ModifierTrace
} from "./types";

export const FITTING_RESOURCE_ATTRIBUTE_IDS = {
  cpuNeed: 50,
  cpuOutput: 48,
  powergridNeed: 30,
  powergridOutput: 11,
  skillLevel: 280
} as const;

export type EffectiveResourceValue = Readonly<{
  base: number | null;
  effective: number | null;
  explicit: boolean;
  modifiers: readonly ModifierTrace[];
}>;

export type EffectiveFittedModuleAnalysis = Readonly<{
  cpu: EffectiveResourceValue;
  index: number;
  instanceId: string;
  powergrid: EffectiveResourceValue;
  rack: RackType;
  typeId: number;
}>;

export type EffectiveResourceSummary = Readonly<{
  baseOutput: number | null;
  baseUsed: number | null;
  effectiveOutput: number | null;
  effectiveUsed: number | null;
  overage: number | null;
  output: EffectiveResourceValue;
  remaining: number | null;
}>;

export type EffectiveFitAnalysis = Readonly<{
  assumptions: readonly string[];
  capacities: PassiveCapacityAnalysis;
  cpu: EffectiveResourceSummary;
  defense: PassiveDefenseAnalysis;
  diagnostics: readonly EngineDiagnostic[];
  hullTypeId: number | null;
  modules: readonly EffectiveFittedModuleAnalysis[];
  navigation: PassiveNavigationAnalysis;
  powergrid: EffectiveResourceSummary;
  profileKind: "all-v" | "explicit" | "unavailable";
  profileStale: boolean;
  status: "available" | "unavailable";
  targeting: PassiveTargetingAnalysis;
}>;

export type EffectiveResourceModuleInput = Readonly<{
  index: number;
  instanceId: string;
  projection: DogmaTypeProjection;
  rack: RackType;
}>;

export type EffectiveResourceSkillInput = Readonly<{
  activeLevel: number;
  projection: DogmaTypeProjection;
}>;

export type AnalyzeEffectiveFitResourcesInput = Readonly<{
  attributeDefinitions: readonly DogmaAttributeDefinition[];
  effectDefinitions: readonly DogmaEffectDefinition[];
  hull: DogmaTypeProjection | null;
  modules: readonly EffectiveResourceModuleInput[];
  profile:
    | Readonly<{ kind: "all-v" | "explicit"; skills: readonly EffectiveResourceSkillInput[] }>
    | Readonly<{ kind: "unavailable"; reason: string }>;
  profileDiagnostics?: readonly EngineDiagnostic[];
  staticDataAvailable: boolean;
}>;

const assumptions = [
  "Passive effects are applied.",
  "Fitted modules and rigs are treated as online.",
  "Active, overheated, projected, implant, booster, subsystem, and mutated-item effects are not evaluated.",
  "Displayed resistances are derived as one minus effective resonance.",
  "Peak passive shield recharge uses 2.5 times shield capacity divided by recharge time."
] as const;

export function analyzeEffectiveFitResources(
  input: AnalyzeEffectiveFitResourcesInput
): EffectiveFitAnalysis {
  if (input.profile.kind === "unavailable") {
    return unavailableAnalysis(input.hull?.typeId ?? null, input.profile.reason);
  }
  if (!input.staticDataAvailable || !input.hull) {
    return unavailableAnalysis(
      input.hull?.typeId ?? null,
      "The authoritative Dogma projection required for effective fitting analysis is unavailable."
    );
  }

  const graph = buildDogmaObjectGraph({
    character: { instanceId: "character", projection: null },
    modules: input.modules.map((module) => ({
      instanceId: module.instanceId,
      kind: module.rack === "rig" ? "rig" : "module",
      projection: module.projection
    })),
    ship: { instanceId: "ship", projection: input.hull },
    skills: input.profile.skills.map((skill) => ({
      activeLevel: skill.activeLevel,
      instanceId: `skill:${skill.projection.typeId}`,
      projection: skill.projection
    }))
  });
  const attributeDefinitions = new Map(
    input.attributeDefinitions.map((definition) => [
      definition.attributeId,
      definition
    ])
  );
  const targets = [
    { attributeId: FITTING_RESOURCE_ATTRIBUTE_IDS.cpuOutput, instanceId: "ship" },
    { attributeId: FITTING_RESOURCE_ATTRIBUTE_IDS.powergridOutput, instanceId: "ship" },
    ...input.modules.flatMap((module) => [
      {
        attributeId: FITTING_RESOURCE_ATTRIBUTE_IDS.cpuNeed,
        instanceId: module.instanceId
      },
      {
        attributeId: FITTING_RESOURCE_ATTRIBUTE_IDS.powergridNeed,
        instanceId: module.instanceId
      }
    ]),
    ...PASSIVE_STAT_TARGET_ATTRIBUTE_IDS
      .filter((attributeId) => attributeDefinitions.has(attributeId))
      .map((attributeId) => ({
        attributeId,
        instanceId: "ship"
      }))
  ];
  const evaluated = evaluateDogmaAttributes({
    attributeDefinitions,
    effectDefinitions: new Map(
      input.effectDefinitions.map((effect) => [effect.effectId, effect])
    ),
    graph,
    targets
  });
  const cpuOutput = getResult(
    evaluated.results,
    "ship",
    FITTING_RESOURCE_ATTRIBUTE_IDS.cpuOutput
  );
  const powergridOutput = getResult(
    evaluated.results,
    "ship",
    FITTING_RESOURCE_ATTRIBUTE_IDS.powergridOutput
  );
  const modules = input.modules.map((module) => ({
    cpu: toResourceValue(
      getResult(
        evaluated.results,
        module.instanceId,
        FITTING_RESOURCE_ATTRIBUTE_IDS.cpuNeed
      )
    ),
    index: module.index,
    instanceId: module.instanceId,
    powergrid: toResourceValue(
      getResult(
        evaluated.results,
        module.instanceId,
        FITTING_RESOURCE_ATTRIBUTE_IDS.powergridNeed
      )
    ),
    rack: module.rack,
    typeId: module.projection.typeId
  }));
  const passive = analyzePassiveStats(evaluated.results);
  const diagnostics = deduplicateDiagnostics([
    ...(input.profileDiagnostics ?? []),
    ...evaluated.diagnostics
  ]);
  const unavailable =
    cpuOutput.effective === null ||
    powergridOutput.effective === null ||
    modules.some(
      (module) =>
        module.cpu.effective === null || module.powergrid.effective === null
    ) ||
    [cpuOutput, powergridOutput].some(hasBlockingDiagnostic) ||
    input.modules.some(
      (module) =>
        [
          getResult(
            evaluated.results,
            module.instanceId,
            FITTING_RESOURCE_ATTRIBUTE_IDS.cpuNeed
          ),
          getResult(
            evaluated.results,
            module.instanceId,
            FITTING_RESOURCE_ATTRIBUTE_IDS.powergridNeed
          )
        ].some(hasBlockingDiagnostic)
    );

  return {
    assumptions,
    capacities: passive.capacities,
    cpu: summarizeResource(cpuOutput, modules.map((module) => module.cpu)),
    defense: passive.defense,
    diagnostics,
    hullTypeId: input.hull.typeId,
    modules,
    navigation: passive.navigation,
    powergrid: summarizeResource(
      powergridOutput,
      modules.map((module) => module.powergrid)
    ),
    profileKind: input.profile.kind,
    profileStale: (input.profileDiagnostics ?? []).some(
      (diagnostic) => diagnostic.code === "effective-resource-profile-stale"
    ),
    status: unavailable ? "unavailable" : "available",
    targeting: passive.targeting
  };
}

function summarizeResource(
  output: AttributeResult,
  requirements: readonly EffectiveResourceValue[]
): EffectiveResourceSummary {
  const baseUsed = sumNullable(requirements.map((value) => value.base));
  const effectiveUsed = sumNullable(
    requirements.map((value) => value.effective)
  );
  const remaining =
    output.effective === null || effectiveUsed === null
      ? null
      : output.effective - effectiveUsed;

  return {
    baseOutput: output.base,
    baseUsed,
    effectiveOutput: output.effective,
    effectiveUsed,
    overage: remaining === null ? null : Math.max(0, -remaining),
    output: toResourceValue(output),
    remaining
  };
}

function sumNullable(values: readonly (number | null)[]) {
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((total, value) => total + (value as number), 0);
}

function getResult(
  results: ReadonlyMap<string, AttributeResult>,
  instanceId: string,
  attributeId: number
) {
  return (
    results.get(attributeKey(instanceId, attributeId)) ?? {
      attributeId,
      base: null,
      diagnostics: [{
        attributeId,
        code: "effective-resource-result-missing",
        instanceId,
        message: `Effective resource result ${instanceId}:${attributeId} is missing.`,
        severity: "unsupported" as const
      }],
      effective: null,
      explicit: false,
      maxAttributeId: null,
      minAttributeId: null,
      modifiers: []
    }
  );
}

function toResourceValue(result: AttributeResult): EffectiveResourceValue {
  return {
    base: result.base,
    effective: result.effective,
    explicit: result.explicit,
    modifiers: result.modifiers
  };
}

function unavailableAnalysis(
  hullTypeId: number | null,
  reason: string
): EffectiveFitAnalysis {
  const empty: EffectiveResourceSummary = {
    baseOutput: null,
    baseUsed: null,
    effectiveOutput: null,
    effectiveUsed: null,
    overage: null,
    output: {
      base: null,
      effective: null,
      explicit: false,
      modifiers: []
    },
    remaining: null
  };

  const passive = unavailablePassiveStats(reason);

  return {
    assumptions,
    capacities: passive.capacities,
    cpu: empty,
    defense: passive.defense,
    diagnostics: [{
      code: "effective-resource-analysis-unavailable",
      message: reason,
      severity: "unsupported"
    }],
    hullTypeId,
    modules: [],
    navigation: passive.navigation,
    powergrid: empty,
    profileKind: "unavailable",
    profileStale: false,
    status: "unavailable",
    targeting: passive.targeting
  };
}

function hasBlockingDiagnostic(result: AttributeResult) {
  return result.diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "unsupported"
  );
}

function deduplicateDiagnostics(diagnostics: readonly EngineDiagnostic[]) {
  return Array.from(
    new Map(
      diagnostics.map((diagnostic) => [
        [
          diagnostic.code,
          diagnostic.effectId ?? "",
          diagnostic.instanceId ?? "",
          diagnostic.attributeId ?? "",
          diagnostic.message
        ].join(":"),
        diagnostic
      ])
    ).values()
  );
}
