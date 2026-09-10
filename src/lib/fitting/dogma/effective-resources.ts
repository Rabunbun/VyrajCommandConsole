import type { RackType } from "../fit-state";
import { attributeKey } from "./dependency";
import {
  CAPACITOR_ATTRIBUTE_IDS,
  simulateCapacitor,
  type CapacitorSimulationResult
} from "./capacitor";
import { evaluateDogmaAttributes } from "./evaluation";
import { buildDogmaObjectGraph } from "./object-graph";
import {
  analyzePassiveStats,
  PASSIVE_STAT_TARGET_ATTRIBUTE_IDS,
  unavailablePassiveStats,
  type PassiveCapacityAnalysis,
  type PassiveDefenseAnalysis,
  type PassiveNavigationAnalysis,
  type PassiveTargetingAnalysis,
  type EffectiveStatistic
} from "./passive-stats";
import { DOGMA_EFFECT_CATEGORIES } from "./semantics";
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
  activationCost: EffectiveResourceValue;
  canActivate: boolean;
  canOverheat: boolean;
  cpu: EffectiveResourceValue;
  cycleDuration: EffectiveResourceValue;
  index: number;
  instanceId: string;
  lifecycle: ModuleLifecycleState;
  nominalCapacitorDrain: number | null;
  powergrid: EffectiveResourceValue;
  rack: RackType;
  typeId: number;
}>;

export type ModuleLifecycleState = Readonly<{
  active: boolean;
  online: boolean;
  overheated: boolean;
}>;

export type EffectiveCapacitorAnalysis = Readonly<{
  capacity: EffectiveStatistic;
  diagnostics: readonly EngineDiagnostic[];
  equilibriumPercentage: number | null;
  moduleDrains: CapacitorSimulationResult["moduleDrains"];
  peakNaturalRecharge: number | null;
  rechargeTime: EffectiveStatistic;
  status: CapacitorSimulationResult["status"] | "unavailable";
  timeToEmptySeconds: number | null;
  totalNominalDrain: number | null;
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
  capacitor: EffectiveCapacitorAnalysis;
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
  lifecycle: ModuleLifecycleState;
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
  "Online effects are applied only while a module is online; rigs remain passive.",
  "Default activation effects with generic modifiers are applied only while supported modules are active.",
  "Overload, projected, implant, booster, subsystem, and mutated-item effects are not evaluated.",
  "Capacitor stability uses an exact repeating event schedule and EVE's nonlinear recharge curve.",
  "Active module schedules begin together at time zero from a full capacitor; simultaneous events are aggregated.",
  "Capacitor booster injection, magazine, and reload events remain unsupported; cargo charges never inject capacitor.",
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
      lifecycle: module.lifecycle,
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
  const effectDefinitions = new Map(
    input.effectDefinitions.map((effect) => [effect.effectId, effect])
  );
  const moduleActivation = new Map(
    input.modules.map((module) => [
      module.instanceId,
      resolveModuleActivation(module.projection, effectDefinitions)
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
      },
      ...(moduleActivation.get(module.instanceId)?.attributeIds ?? []).map(
        (attributeId) => ({ attributeId, instanceId: module.instanceId })
      )
    ]),
    ...Object.values(CAPACITOR_ATTRIBUTE_IDS)
      .filter((attributeId) => attributeDefinitions.has(attributeId))
      .map((attributeId) => ({ attributeId, instanceId: "ship" })),
    ...PASSIVE_STAT_TARGET_ATTRIBUTE_IDS
      .filter((attributeId) => attributeDefinitions.has(attributeId))
      .map((attributeId) => ({
        attributeId,
        instanceId: "ship"
      }))
  ];
  const evaluated = evaluateDogmaAttributes({
    attributeDefinitions,
    effectDefinitions,
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
  const modules = input.modules.map((module) => {
    const activation = moduleActivation.get(module.instanceId) as ModuleActivationMetadata;
    const activationCost = activation.dischargeAttributeId === null
      ? zeroResourceValue()
      : toResourceValue(
          getResult(evaluated.results, module.instanceId, activation.dischargeAttributeId)
        );
    const cycleDuration = activation.durationAttributeId === null
      ? unavailableResourceValue()
      : toResourceValue(
          getResult(evaluated.results, module.instanceId, activation.durationAttributeId)
        );
    const nominalCapacitorDrain =
      activationCost.effective !== null &&
      cycleDuration.effective !== null &&
      cycleDuration.effective > 0
        ? activationCost.effective / (cycleDuration.effective / 1000)
        : activationCost.effective === 0
          ? 0
          : null;

    return {
    activationCost,
    canActivate: activation.canActivate,
    canOverheat: activation.canOverheat,
    cpu: toResourceValue(
      getResult(
        evaluated.results,
        module.instanceId,
        FITTING_RESOURCE_ATTRIBUTE_IDS.cpuNeed
      )
    ),
    index: module.index,
    instanceId: module.instanceId,
    lifecycle: module.lifecycle,
    nominalCapacitorDrain,
    powergrid: toResourceValue(
      getResult(
        evaluated.results,
        module.instanceId,
        FITTING_RESOURCE_ATTRIBUTE_IDS.powergridNeed
      )
    ),
    rack: module.rack,
    typeId: module.projection.typeId,
    cycleDuration
  };
  });
  const passive = analyzePassiveStats(evaluated.results);
  const capacitor = analyzeCapacitor({
    evaluatedResults: evaluated.results,
    modules,
    moduleActivation
  });
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
    capacitor,
    capacities: passive.capacities,
    cpu: summarizeResource(
      cpuOutput,
      modules.filter((module) => module.lifecycle.online).map((module) => module.cpu)
    ),
    defense: passive.defense,
    diagnostics,
    hullTypeId: input.hull.typeId,
    modules,
    navigation: passive.navigation,
    powergrid: summarizeResource(
      powergridOutput,
      modules.filter((module) => module.lifecycle.online).map((module) => module.powergrid)
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
    capacitor: unavailableCapacitor(reason),
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

type ModuleActivationMetadata = Readonly<{
  attributeIds: readonly number[];
  canActivate: boolean;
  canOverheat: boolean;
  dischargeAttributeId: number | null;
  durationAttributeId: number | null;
  effectId: number | null;
  unsupportedReason: string | null;
}>;

function resolveModuleActivation(
  projection: DogmaTypeProjection,
  effects: ReadonlyMap<number, DogmaEffectDefinition>
): ModuleActivationMetadata {
  const referenced = projection.effects.flatMap((reference) => {
    const effect = effects.get(reference.effectId);
    return effect ? [{ effect, reference }] : [];
  });
  const activationEffects = referenced.filter(
    ({ effect, reference }) =>
      reference.isDefault &&
      [
        DOGMA_EFFECT_CATEGORIES.ACTIVATION,
        DOGMA_EFFECT_CATEGORIES.TARGET,
        DOGMA_EFFECT_CATEGORIES.AREA
      ].some((categoryId) => categoryId === effect.categoryId)
  );
  const canOverheat = referenced.some(
    ({ effect }) => effect.categoryId === DOGMA_EFFECT_CATEGORIES.OVERLOAD
  );
  if (!activationEffects.length) {
    return {
      attributeIds: [],
      canActivate: false,
      canOverheat,
      dischargeAttributeId: null,
      durationAttributeId: null,
      effectId: null,
      unsupportedReason: null
    };
  }
  if (activationEffects.length !== 1) {
    return {
      attributeIds: [],
      canActivate: true,
      canOverheat,
      dischargeAttributeId: null,
      durationAttributeId: null,
      effectId: null,
      unsupportedReason: "Multiple default activation effects cannot be scheduled authoritatively."
    };
  }
  const effect = activationEffects[0].effect;
  const attributeIds = [effect.dischargeAttributeId, effect.durationAttributeId]
    .filter((attributeId): attributeId is number => attributeId !== null);
  return {
    attributeIds,
    canActivate: true,
    canOverheat,
    dischargeAttributeId: effect.dischargeAttributeId,
    durationAttributeId: effect.durationAttributeId,
    effectId: effect.effectId,
    unsupportedReason:
      effect.effectId === 48
        ? "Active capacitor boosters require charge, magazine, and reload event semantics."
        : effect.dischargeAttributeId !== null && effect.durationAttributeId === null
          ? "The activation effect has capacitor cost but no authoritative cycle duration."
          : null
  };
}

function analyzeCapacitor(input: {
  evaluatedResults: ReadonlyMap<string, AttributeResult>;
  moduleActivation: ReadonlyMap<string, ModuleActivationMetadata>;
  modules: readonly EffectiveFittedModuleAnalysis[];
}): EffectiveCapacitorAnalysis {
  const capacityResult = getResult(
    input.evaluatedResults,
    "ship",
    CAPACITOR_ATTRIBUTE_IDS.capacity
  );
  const rechargeResult = getResult(
    input.evaluatedResults,
    "ship",
    CAPACITOR_ATTRIBUTE_IDS.rechargeTime
  );
  const capacity = toEffectiveStatistic(capacityResult, true);
  const rechargeTime = toEffectiveStatistic(rechargeResult, true);
  const activeModules = input.modules.filter(
    (module) => module.lifecycle.online && module.lifecycle.active
  );
  const unsupportedDiagnostics = activeModules.flatMap((module) => {
    const metadata = input.moduleActivation.get(module.instanceId);
    const reason = metadata?.unsupportedReason ??
      (module.activationCost.effective !== 0 &&
      (module.activationCost.effective === null || module.cycleDuration.effective === null)
        ? "The active module's effective capacitor schedule is unavailable."
        : null);
    return reason
      ? [{
          code: "capacitor-active-module-unsupported",
          effectId: metadata?.effectId ?? undefined,
          instanceId: module.instanceId,
          message: reason,
          severity: "unsupported" as const
        }]
      : [];
  });
  const baseDiagnostics = deduplicateDiagnostics([
    ...capacity.diagnostics,
    ...rechargeTime.diagnostics,
    ...unsupportedDiagnostics
  ]);
  if (
    capacity.effective === null ||
    rechargeTime.effective === null ||
    unsupportedDiagnostics.length
  ) {
    return {
      capacity,
      diagnostics: baseDiagnostics,
      equilibriumPercentage: null,
      moduleDrains: [],
      peakNaturalRecharge:
        capacity.effective !== null && rechargeTime.effective !== null && rechargeTime.effective > 0
          ? 2.5 * capacity.effective / (rechargeTime.effective / 1000)
          : null,
      rechargeTime,
      status: unsupportedDiagnostics.length ? "unsupported" : "unavailable",
      timeToEmptySeconds: null,
      totalNominalDrain: null
    };
  }

  const simulation = simulateCapacitor({
    capacity: capacity.effective,
    drains: activeModules.flatMap((module) =>
      module.activationCost.effective !== null &&
      module.activationCost.effective > 0 &&
      module.cycleDuration.effective !== null
        ? [{
            amount: module.activationCost.effective,
            cycleDurationMs: module.cycleDuration.effective,
            instanceId: module.instanceId
          }]
        : []
    ),
    rechargeTimeMs: rechargeTime.effective
  });
  return {
    capacity,
    diagnostics: deduplicateDiagnostics([...baseDiagnostics, ...simulation.diagnostics]),
    equilibriumPercentage: simulation.equilibriumPercentage,
    moduleDrains: simulation.moduleDrains,
    peakNaturalRecharge: simulation.peakRecharge,
    rechargeTime,
    status: simulation.status,
    timeToEmptySeconds: simulation.timeToEmptySeconds,
    totalNominalDrain: simulation.totalNominalDrain
  };
}

function toEffectiveStatistic(
  result: AttributeResult,
  requireExplicit: boolean
): EffectiveStatistic {
  const unavailable =
    (requireExplicit && !result.explicit) ||
    result.effective === null ||
    hasBlockingDiagnostic(result);
  return {
    attributeId: result.attributeId,
    base: result.base,
    diagnostics: result.diagnostics,
    effective: unavailable ? null : result.effective,
    explicit: result.explicit,
    modifiers: result.modifiers,
    status: unavailable ? "unavailable" : "available"
  };
}

function unavailableCapacitor(reason: string): EffectiveCapacitorAnalysis {
  const statistic: EffectiveStatistic = {
    attributeId: null,
    base: null,
    diagnostics: [{ code: "capacitor-analysis-unavailable", message: reason, severity: "unsupported" }],
    effective: null,
    explicit: false,
    modifiers: [],
    status: "unavailable"
  };
  return {
    capacity: { ...statistic, attributeId: CAPACITOR_ATTRIBUTE_IDS.capacity },
    diagnostics: statistic.diagnostics,
    equilibriumPercentage: null,
    moduleDrains: [],
    peakNaturalRecharge: null,
    rechargeTime: { ...statistic, attributeId: CAPACITOR_ATTRIBUTE_IDS.rechargeTime },
    status: "unavailable",
    timeToEmptySeconds: null,
    totalNominalDrain: null
  };
}

function zeroResourceValue(): EffectiveResourceValue {
  return { base: 0, effective: 0, explicit: true, modifiers: [] };
}

function unavailableResourceValue(): EffectiveResourceValue {
  return { base: null, effective: null, explicit: false, modifiers: [] };
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
