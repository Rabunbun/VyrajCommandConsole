import { attributeKey } from "./dependency";
import type {
  AttributeResult,
  EngineDiagnostic,
  ModifierTrace
} from "./types";

export const PASSIVE_STAT_ATTRIBUTE_IDS = {
  agility: 70,
  armorEmResonance: 267,
  armorExplosiveResonance: 268,
  armorHitpoints: 265,
  armorKineticResonance: 269,
  armorThermalResonance: 270,
  baseWarpSpeed: 1281,
  cargoCapacity: 38,
  droneBandwidth: 1271,
  droneBayCapacity: 283,
  hullEmResonance: 974,
  hullExplosiveResonance: 975,
  hullHitpoints: 9,
  hullKineticResonance: 976,
  hullThermalResonance: 977,
  mass: 4,
  maxTargetRange: 76,
  maxVelocity: 37,
  scanGravimetricStrength: 211,
  scanLadarStrength: 209,
  scanMagnetometricStrength: 210,
  scanRadarStrength: 208,
  scanResolution: 564,
  shieldEmResonance: 271,
  shieldExplosiveResonance: 272,
  shieldHitpoints: 263,
  shieldKineticResonance: 273,
  shieldRechargeTime: 479,
  shieldThermalResonance: 274,
  signatureRadius: 552,
  warpSpeedMultiplier: 600
} as const;

export const PASSIVE_STAT_TARGET_ATTRIBUTE_IDS = Object.values(
  PASSIVE_STAT_ATTRIBUTE_IDS
);

export type EffectiveStatisticStatus = "available" | "unavailable";
export type EffectiveSectionStatus = "available" | "partial" | "unavailable";

export type EffectiveStatistic = Readonly<{
  attributeId: number | null;
  base: number | null;
  diagnostics: readonly EngineDiagnostic[];
  effective: number | null;
  explicit: boolean;
  modifiers: readonly ModifierTrace[];
  status: EffectiveStatisticStatus;
}>;

export type DamageTypeStatistics = Readonly<{
  em: EffectiveStatistic;
  explosive: EffectiveStatistic;
  kinetic: EffectiveStatistic;
  thermal: EffectiveStatistic;
}>;

export type DefenseLayerAnalysis = Readonly<{
  hitpoints: EffectiveStatistic;
  resistances: DamageTypeStatistics;
  resonances: DamageTypeStatistics;
}>;

export type PassiveDefenseAnalysis = Readonly<{
  armor: DefenseLayerAnalysis;
  diagnostics: readonly EngineDiagnostic[];
  hull: DefenseLayerAnalysis;
  peakShieldRecharge: EffectiveStatistic;
  shield: DefenseLayerAnalysis;
  shieldRechargeTime: EffectiveStatistic;
  status: EffectiveSectionStatus;
}>;

export type PassiveCapacityAnalysis = Readonly<{
  cargo: EffectiveStatistic;
  diagnostics: readonly EngineDiagnostic[];
  droneBandwidth: EffectiveStatistic;
  droneBay: EffectiveStatistic;
  status: EffectiveSectionStatus;
}>;

export type PassiveTargetingAnalysis = Readonly<{
  diagnostics: readonly EngineDiagnostic[];
  maxTargetRange: EffectiveStatistic;
  scanResolution: EffectiveStatistic;
  sensorStrengths: Readonly<{
    gravimetric: EffectiveStatistic;
    ladar: EffectiveStatistic;
    magnetometric: EffectiveStatistic;
    radar: EffectiveStatistic;
  }>;
  signatureRadius: EffectiveStatistic;
  status: EffectiveSectionStatus;
}>;

export type PassiveNavigationAnalysis = Readonly<{
  agility: EffectiveStatistic;
  alignTime: EffectiveStatistic;
  diagnostics: readonly EngineDiagnostic[];
  mass: EffectiveStatistic;
  maxVelocity: EffectiveStatistic;
  status: EffectiveSectionStatus;
  warpSpeed: EffectiveStatistic;
}>;

export type PassiveStatAnalysis = Readonly<{
  capacities: PassiveCapacityAnalysis;
  defense: PassiveDefenseAnalysis;
  navigation: PassiveNavigationAnalysis;
  targeting: PassiveTargetingAnalysis;
}>;

const SHIELD_PEAK_RECHARGE_FACTOR = 2.5;
const ALIGN_TIME_FACTOR = -Math.log(0.25) / 1_000_000;

export function analyzePassiveStats(
  results: ReadonlyMap<string, AttributeResult>,
  shipInstanceId = "ship"
): PassiveStatAnalysis {
  const get = (attributeId: number, requireExplicit = true) =>
    toStatistic(getResult(results, shipInstanceId, attributeId), requireExplicit);

  const shield = layer(
    get(PASSIVE_STAT_ATTRIBUTE_IDS.shieldHitpoints),
    damageTypes({
      em: get(PASSIVE_STAT_ATTRIBUTE_IDS.shieldEmResonance),
      explosive: get(PASSIVE_STAT_ATTRIBUTE_IDS.shieldExplosiveResonance),
      kinetic: get(PASSIVE_STAT_ATTRIBUTE_IDS.shieldKineticResonance),
      thermal: get(PASSIVE_STAT_ATTRIBUTE_IDS.shieldThermalResonance)
    })
  );
  const armor = layer(
    get(PASSIVE_STAT_ATTRIBUTE_IDS.armorHitpoints),
    damageTypes({
      em: get(PASSIVE_STAT_ATTRIBUTE_IDS.armorEmResonance),
      explosive: get(PASSIVE_STAT_ATTRIBUTE_IDS.armorExplosiveResonance),
      kinetic: get(PASSIVE_STAT_ATTRIBUTE_IDS.armorKineticResonance),
      thermal: get(PASSIVE_STAT_ATTRIBUTE_IDS.armorThermalResonance)
    })
  );
  const hull = layer(
    get(PASSIVE_STAT_ATTRIBUTE_IDS.hullHitpoints),
    damageTypes({
      em: get(PASSIVE_STAT_ATTRIBUTE_IDS.hullEmResonance, false),
      explosive: get(PASSIVE_STAT_ATTRIBUTE_IDS.hullExplosiveResonance, false),
      kinetic: get(PASSIVE_STAT_ATTRIBUTE_IDS.hullKineticResonance, false),
      thermal: get(PASSIVE_STAT_ATTRIBUTE_IDS.hullThermalResonance, false)
    })
  );
  const shieldRechargeTime = get(
    PASSIVE_STAT_ATTRIBUTE_IDS.shieldRechargeTime
  );
  const peakShieldRecharge = deriveStatistic(
    "peak-shield-recharge",
    [shield.hitpoints, shieldRechargeTime],
    ([capacity, rechargeMilliseconds]) =>
      rechargeMilliseconds > 0
        ? SHIELD_PEAK_RECHARGE_FACTOR * capacity / (rechargeMilliseconds / 1000)
        : null
  );
  const defenseValues = [
    ...layerValues(shield),
    ...layerValues(armor),
    ...layerValues(hull),
    shieldRechargeTime,
    peakShieldRecharge
  ];

  const cargo = get(PASSIVE_STAT_ATTRIBUTE_IDS.cargoCapacity);
  const droneBay = get(PASSIVE_STAT_ATTRIBUTE_IDS.droneBayCapacity);
  const droneBandwidth = get(PASSIVE_STAT_ATTRIBUTE_IDS.droneBandwidth);
  const capacityValues = [cargo, droneBay, droneBandwidth];

  const sensorStrengths = {
    gravimetric: get(PASSIVE_STAT_ATTRIBUTE_IDS.scanGravimetricStrength),
    ladar: get(PASSIVE_STAT_ATTRIBUTE_IDS.scanLadarStrength),
    magnetometric: get(PASSIVE_STAT_ATTRIBUTE_IDS.scanMagnetometricStrength),
    radar: get(PASSIVE_STAT_ATTRIBUTE_IDS.scanRadarStrength)
  };
  const maxTargetRange = get(PASSIVE_STAT_ATTRIBUTE_IDS.maxTargetRange);
  const scanResolution = get(PASSIVE_STAT_ATTRIBUTE_IDS.scanResolution);
  const signatureRadius = get(PASSIVE_STAT_ATTRIBUTE_IDS.signatureRadius);
  const targetingValues = [
    maxTargetRange,
    scanResolution,
    signatureRadius,
    ...Object.values(sensorStrengths)
  ];

  const maxVelocity = get(PASSIVE_STAT_ATTRIBUTE_IDS.maxVelocity);
  const mass = get(PASSIVE_STAT_ATTRIBUTE_IDS.mass);
  const agility = get(PASSIVE_STAT_ATTRIBUTE_IDS.agility);
  const alignTime = deriveStatistic(
    "align-time",
    [mass, agility],
    ([effectiveMass, effectiveAgility]) =>
      effectiveMass > 0 && effectiveAgility > 0
        ? ALIGN_TIME_FACTOR * effectiveMass * effectiveAgility
        : null
  );
  const warpSpeedMultiplier = get(
    PASSIVE_STAT_ATTRIBUTE_IDS.warpSpeedMultiplier
  );
  const baseWarpSpeed = get(PASSIVE_STAT_ATTRIBUTE_IDS.baseWarpSpeed);
  const warpSpeed = deriveStatistic(
    "warp-speed",
    [baseWarpSpeed, warpSpeedMultiplier],
    ([base, multiplier]) => base * multiplier
  );
  const navigationValues = [maxVelocity, mass, agility, alignTime, warpSpeed];

  return {
    capacities: {
      cargo,
      diagnostics: collectDiagnostics(capacityValues),
      droneBandwidth,
      droneBay,
      status: sectionStatus(capacityValues)
    },
    defense: {
      armor,
      diagnostics: collectDiagnostics(defenseValues),
      hull,
      peakShieldRecharge,
      shield,
      shieldRechargeTime,
      status: sectionStatus(defenseValues)
    },
    navigation: {
      agility,
      alignTime,
      diagnostics: collectDiagnostics(navigationValues),
      mass,
      maxVelocity,
      status: sectionStatus(navigationValues),
      warpSpeed
    },
    targeting: {
      diagnostics: collectDiagnostics(targetingValues),
      maxTargetRange,
      scanResolution,
      sensorStrengths,
      signatureRadius,
      status: sectionStatus(targetingValues)
    }
  };
}

export function unavailablePassiveStats(reason: string): PassiveStatAnalysis {
  const unavailable = (attributeId: number | null = null) =>
    unavailableStatistic(attributeId, reason);
  const resonance = (): DamageTypeStatistics => ({
    em: unavailable(),
    explosive: unavailable(),
    kinetic: unavailable(),
    thermal: unavailable()
  });
  const unavailableLayer = (): DefenseLayerAnalysis => ({
    hitpoints: unavailable(),
    resistances: resonance(),
    resonances: resonance()
  });
  const diagnostic = unavailable().diagnostics;

  return {
    capacities: {
      cargo: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.cargoCapacity),
      diagnostics: diagnostic,
      droneBandwidth: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.droneBandwidth),
      droneBay: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.droneBayCapacity),
      status: "unavailable"
    },
    defense: {
      armor: unavailableLayer(),
      diagnostics: diagnostic,
      hull: unavailableLayer(),
      peakShieldRecharge: unavailable(),
      shield: unavailableLayer(),
      shieldRechargeTime: unavailable(
        PASSIVE_STAT_ATTRIBUTE_IDS.shieldRechargeTime
      ),
      status: "unavailable"
    },
    navigation: {
      agility: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.agility),
      alignTime: unavailable(),
      diagnostics: diagnostic,
      mass: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.mass),
      maxVelocity: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.maxVelocity),
      status: "unavailable",
      warpSpeed: unavailable()
    },
    targeting: {
      diagnostics: diagnostic,
      maxTargetRange: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.maxTargetRange),
      scanResolution: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.scanResolution),
      sensorStrengths: {
        gravimetric: unavailable(
          PASSIVE_STAT_ATTRIBUTE_IDS.scanGravimetricStrength
        ),
        ladar: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.scanLadarStrength),
        magnetometric: unavailable(
          PASSIVE_STAT_ATTRIBUTE_IDS.scanMagnetometricStrength
        ),
        radar: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.scanRadarStrength)
      },
      signatureRadius: unavailable(PASSIVE_STAT_ATTRIBUTE_IDS.signatureRadius),
      status: "unavailable"
    }
  };
}

function layer(
  hitpoints: EffectiveStatistic,
  resonances: DamageTypeStatistics
): DefenseLayerAnalysis {
  return {
    hitpoints,
    resistances: {
      em: resonanceToResistance(resonances.em),
      explosive: resonanceToResistance(resonances.explosive),
      kinetic: resonanceToResistance(resonances.kinetic),
      thermal: resonanceToResistance(resonances.thermal)
    },
    resonances
  };
}

function damageTypes(input: DamageTypeStatistics) {
  return input;
}

function resonanceToResistance(resonance: EffectiveStatistic) {
  return deriveStatistic(
    "resistance",
    [resonance],
    ([value]) => 1 - value,
    resonance.attributeId
  );
}

function deriveStatistic(
  label: string,
  inputs: readonly EffectiveStatistic[],
  derive: (values: readonly number[]) => number | null,
  attributeId: number | null = null
): EffectiveStatistic {
  const diagnostics = collectDiagnostics(inputs);
  const unavailable = inputs.some((input) => input.status === "unavailable");
  const baseValues = inputs.map((input) => input.base);
  const effectiveValues = inputs.map((input) => input.effective);
  const base = baseValues.some((value) => value === null)
    ? null
    : derive(baseValues as number[]);
  const effective = unavailable || effectiveValues.some((value) => value === null)
    ? null
    : derive(effectiveValues as number[]);

  if (effective === null && !unavailable) {
    diagnostics.push({
      attributeId: attributeId ?? undefined,
      code: `${label}-derivation-unavailable`,
      message: `${label} cannot be derived from the effective Dogma values.`,
      severity: "unsupported"
    });
  }

  return {
    attributeId,
    base,
    diagnostics: deduplicateDiagnostics(diagnostics),
    effective,
    explicit: inputs.every((input) => input.explicit),
    modifiers: inputs.flatMap((input) => input.modifiers),
    status: effective === null ? "unavailable" : "available"
  };
}

function toStatistic(
  result: AttributeResult,
  requireExplicit: boolean
): EffectiveStatistic {
  if (requireExplicit && !result.explicit) {
    return unavailableStatistic(
      result.attributeId,
      `Ship attribute ${result.attributeId} is not explicitly present in the deployed Dogma projection.`,
      [...result.diagnostics, {
        attributeId: result.attributeId,
        code: "explicit-ship-attribute-unavailable",
        message: `Ship attribute ${result.attributeId} requires an explicit authoritative base value.`,
        severity: "unsupported"
      }],
      result.modifiers
    );
  }
  const unavailable =
    result.effective === null ||
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "unsupported"
    );

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

function getResult(
  results: ReadonlyMap<string, AttributeResult>,
  instanceId: string,
  attributeId: number
): AttributeResult {
  return results.get(attributeKey(instanceId, attributeId)) ?? {
    attributeId,
    base: null,
    diagnostics: [{
      attributeId,
      code: "passive-stat-result-missing",
      instanceId,
      message: `Passive statistic ${instanceId}:${attributeId} is missing.`,
      severity: "unsupported"
    }],
    effective: null,
    explicit: false,
    maxAttributeId: null,
    minAttributeId: null,
    modifiers: []
  };
}

function unavailableStatistic(
  attributeId: number | null,
  reason: string,
  diagnostics?: readonly EngineDiagnostic[],
  modifiers: readonly ModifierTrace[] = []
): EffectiveStatistic {
  return {
    attributeId,
    base: null,
    diagnostics: diagnostics ?? [{
      attributeId: attributeId ?? undefined,
      code: "passive-stat-analysis-unavailable",
      message: reason,
      severity: "unsupported"
    }],
    effective: null,
    explicit: false,
    modifiers,
    status: "unavailable"
  };
}

function layerValues(layerAnalysis: DefenseLayerAnalysis) {
  return [
    layerAnalysis.hitpoints,
    ...Object.values(layerAnalysis.resonances),
    ...Object.values(layerAnalysis.resistances)
  ];
}

function sectionStatus(
  values: readonly EffectiveStatistic[]
): EffectiveSectionStatus {
  const available = values.filter((value) => value.status === "available").length;
  if (available === values.length) return "available";
  return available ? "partial" : "unavailable";
}

function collectDiagnostics(values: readonly EffectiveStatistic[]) {
  return deduplicateDiagnostics(values.flatMap((value) => value.diagnostics));
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
