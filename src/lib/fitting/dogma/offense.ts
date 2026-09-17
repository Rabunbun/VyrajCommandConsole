import { attributeKey } from "./dependency";
import { evaluateDogmaAttributes } from "./evaluation";
import type {
  AttributeResult,
  DogmaAttributeDefinition,
  DogmaEffectDefinition,
  DogmaObjectGraph,
  EngineDiagnostic,
  ModifierTrace
} from "./types";

export const WEAPON_ATTRIBUTE_IDS = {
  cycleDuration: 51,
  damageMultiplier: 64,
  emDamage: 114,
  explosiveDamage: 116,
  kineticDamage: 117,
  missileDamageMultiplier: 212,
  missileExplosionVelocity: 653,
  missileExplosionRadius: 654,
  missileDamageReductionFactor: 1353,
  missileFlightTime: 281,
  missileVelocity: 37,
  optimalRange: 54,
  thermalDamage: 118,
  trackingSpeed: 160,
  falloff: 158
} as const;

const weaponEffectNames = new Map<number, string>([
  [10, "targetAttack"],
  [34, "projectileFired"],
  [101, "useMissiles"],
  [6995, "targetDisintegratorAttack"],
  [8037, "ChainLightning"]
]);

const weaponAttributeNames = new Map<number, string>([
  [WEAPON_ATTRIBUTE_IDS.cycleDuration, "speed"],
  [WEAPON_ATTRIBUTE_IDS.damageMultiplier, "damageMultiplier"],
  [WEAPON_ATTRIBUTE_IDS.emDamage, "emDamage"],
  [WEAPON_ATTRIBUTE_IDS.explosiveDamage, "explosiveDamage"],
  [WEAPON_ATTRIBUTE_IDS.kineticDamage, "kineticDamage"],
  [WEAPON_ATTRIBUTE_IDS.missileDamageMultiplier, "missileDamageMultiplier"],
  [WEAPON_ATTRIBUTE_IDS.missileExplosionVelocity, "aoeVelocity"],
  [WEAPON_ATTRIBUTE_IDS.missileExplosionRadius, "aoeCloudSize"],
  [WEAPON_ATTRIBUTE_IDS.missileDamageReductionFactor, "aoeDamageReductionFactor"],
  [WEAPON_ATTRIBUTE_IDS.missileFlightTime, "explosionDelay"],
  [WEAPON_ATTRIBUTE_IDS.missileVelocity, "maxVelocity"],
  [WEAPON_ATTRIBUTE_IDS.optimalRange, "maxRange"],
  [WEAPON_ATTRIBUTE_IDS.thermalDamage, "thermalDamage"],
  [WEAPON_ATTRIBUTE_IDS.trackingSpeed, "trackingSpeed"],
  [WEAPON_ATTRIBUTE_IDS.falloff, "falloff"]
]);

const TURRET_MARKER_EFFECT_ID = 42;
const LAUNCHER_MARKER_EFFECT_ID = 40;
const TURRET_FIRING_EFFECT_IDS = new Set([10, 34]);
const MISSILE_FIRING_EFFECT_IDS = new Set([101]);
const DEFERRED_WEAPON_EFFECT_IDS = new Set([6995, 8037]);

export type WeaponStatistic = Readonly<{
  attributeId: number;
  base: number | null;
  diagnostics: readonly EngineDiagnostic[];
  effective: number | null;
  explicit: boolean;
  modifiers: readonly ModifierTrace[];
  status: "available" | "unavailable";
}>;

export type WeaponDamageBreakdown = Readonly<{
  em: number;
  explosive: number;
  kinetic: number;
  thermal: number;
  total: number;
}>;

export type WeaponAttributeTrace = Readonly<{
  cycleDuration: WeaponStatistic;
  damage: Readonly<{
    em: WeaponStatistic;
    explosive: WeaponStatistic;
    kinetic: WeaponStatistic;
    thermal: WeaponStatistic;
  }>;
  damageMultiplier: WeaponStatistic;
}>;

export type TurretRangeAnalysis = Readonly<{
  falloff: WeaponStatistic;
  optimal: WeaponStatistic;
  tracking: WeaponStatistic;
}>;

export type MissileRangeAnalysis = Readonly<{
  damageReductionFactor: WeaponStatistic;
  explosionRadius: WeaponStatistic;
  explosionVelocity: WeaponStatistic;
  flightTime: WeaponStatistic;
  theoreticalRange: number | null;
  velocity: WeaponStatistic;
}>;

export type EffectiveWeaponAnalysis = Readonly<{
  attributes: WeaponAttributeTrace | null;
  chargeTypeId: number | null;
  cycleDurationMs: number | null;
  diagnostics: readonly EngineDiagnostic[];
  dps: WeaponDamageBreakdown | null;
  index: number;
  instanceId: string;
  kind: "missile" | "turret" | "unsupported";
  online: boolean;
  range: MissileRangeAnalysis | TurretRangeAnalysis | null;
  rack: "high" | "mid" | "low" | "rig" | "subsystem";
  status: "available" | "unavailable" | "unsupported";
  typeId: number;
  volley: WeaponDamageBreakdown | null;
}>;

export type EffectiveOffenseAnalysis = Readonly<{
  combinedDps: WeaponDamageBreakdown;
  combinedVolley: WeaponDamageBreakdown;
  diagnostics: readonly EngineDiagnostic[];
  missileDps: WeaponDamageBreakdown;
  missileVolley: WeaponDamageBreakdown;
  status: "available" | "partial" | "unavailable";
  turretDps: WeaponDamageBreakdown;
  turretVolley: WeaponDamageBreakdown;
  weapons: readonly EffectiveWeaponAnalysis[];
}>;

export type OffenseModuleInput = Readonly<{
  charge: Readonly<{ instanceId: string; projection: import("./types").DogmaTypeProjection }> | null;
  index: number;
  instanceId: string;
  online: boolean;
  projection: import("./types").DogmaTypeProjection;
  rack: EffectiveWeaponAnalysis["rack"];
}>;

export function analyzeWeaponOffense(input: {
  attributeDefinitions: ReadonlyMap<number, DogmaAttributeDefinition>;
  effectDefinitions: ReadonlyMap<number, DogmaEffectDefinition>;
  graph: DogmaObjectGraph;
  modules: readonly OffenseModuleInput[];
}): EffectiveOffenseAnalysis {
  const classified = input.modules.flatMap((module) => {
    const classification = classifyWeapon(module, input.effectDefinitions);
    return classification ? [{ module, ...classification }] : [];
  });
  const supportedKinds = new Set(
    classified.flatMap(({ kind }) => kind === "unsupported" ? [] : [kind])
  );
  const metadataDiagnostics = validateWeaponMetadata(
    input.attributeDefinitions,
    input.effectDefinitions,
    new Set(classified.map(({ effectId }) => effectId)),
    supportedKinds
  );
  const targets = classified.flatMap(({ kind, module }) => {
    if (kind === "unsupported" || !module.charge) return [];
    return [
      { attributeId: WEAPON_ATTRIBUTE_IDS.cycleDuration, instanceId: module.instanceId },
      {
        attributeId:
          kind === "turret"
            ? WEAPON_ATTRIBUTE_IDS.damageMultiplier
            : WEAPON_ATTRIBUTE_IDS.missileDamageMultiplier,
        instanceId: kind === "turret" ? module.instanceId : input.graph.characterInstanceId
      },
      ...damageAttributeIds.map((attributeId) => ({
        attributeId,
        instanceId: module.charge?.instanceId as string
      })),
      ...(kind === "turret"
        ? [
            { attributeId: WEAPON_ATTRIBUTE_IDS.optimalRange, instanceId: module.instanceId },
            { attributeId: WEAPON_ATTRIBUTE_IDS.falloff, instanceId: module.instanceId },
            { attributeId: WEAPON_ATTRIBUTE_IDS.trackingSpeed, instanceId: module.instanceId }
          ]
        : missileRangeAttributeIds.map((attributeId) => ({
            attributeId,
            instanceId: module.charge?.instanceId as string
          })))
    ];
  });
  const evaluated = evaluateDogmaAttributes({
    attributeDefinitions: input.attributeDefinitions,
    effectDefinitions: input.effectDefinitions,
    graph: input.graph,
    targets
  });
  const weapons = classified.map(({ diagnostic, kind, module }) => {
    if (kind === "unsupported") {
      return unavailableWeapon(module, "unsupported", diagnostic);
    }
    if (!module.charge) {
      return unavailableWeapon(module, kind, {
        code: "weapon-charge-required",
        instanceId: module.instanceId,
        message: "Paper damage requires a compatible loaded charge.",
        severity: "warning"
      });
    }

    const chargeId = module.charge.instanceId;
    const cycleDuration = statistic(evaluated.results, module.instanceId, WEAPON_ATTRIBUTE_IDS.cycleDuration, true);
    const multiplier = statistic(
      evaluated.results,
      kind === "turret" ? module.instanceId : input.graph.characterInstanceId,
      kind === "turret"
        ? WEAPON_ATTRIBUTE_IDS.damageMultiplier
        : WEAPON_ATTRIBUTE_IDS.missileDamageMultiplier,
      kind === "turret"
    );
    const damage = {
      em: statistic(evaluated.results, chargeId, WEAPON_ATTRIBUTE_IDS.emDamage, true),
      explosive: statistic(evaluated.results, chargeId, WEAPON_ATTRIBUTE_IDS.explosiveDamage, true),
      kinetic: statistic(evaluated.results, chargeId, WEAPON_ATTRIBUTE_IDS.kineticDamage, true),
      thermal: statistic(evaluated.results, chargeId, WEAPON_ATTRIBUTE_IDS.thermalDamage, true)
    };
    const core = [cycleDuration, multiplier, ...Object.values(damage)];
    const invalidCycle =
      cycleDuration.effective !== null && cycleDuration.effective <= 0
        ? [{
            attributeId: WEAPON_ATTRIBUTE_IDS.cycleDuration,
            code: "weapon-cycle-invalid",
            instanceId: module.instanceId,
            message: "The evaluated firing cycle is not positive.",
            severity: "unsupported" as const
          }]
        : [];
    const coreAvailable =
      core.every((value) => value.status === "available" && value.effective !== null) &&
      invalidCycle.length === 0;
    const effectiveVolley = coreAvailable
      ? multiplyDamage(damage, "effective", multiplier.effective as number)
      : null;
    const volley = module.online ? effectiveVolley : zeroDamage();
    const dps =
      volley && cycleDuration.effective !== null && cycleDuration.effective > 0
        ? divideDamage(volley, cycleDuration.effective / 1000)
        : module.online
          ? null
          : zeroDamage();
    const range = kind === "turret"
      ? turretRange(evaluated.results, module.instanceId)
      : missileRange(evaluated.results, chargeId);
    const diagnostics = deduplicateDiagnostics([
      ...core.flatMap((value) => value.diagnostics),
      ...rangeStatistics(range).flatMap((value) => value.diagnostics),
      ...invalidCycle
    ]);

    return {
      attributes: {
        cycleDuration,
        damage,
        damageMultiplier: multiplier
      },
      chargeTypeId: module.charge.projection.typeId,
      cycleDurationMs: cycleDuration.effective,
      diagnostics,
      dps,
      index: module.index,
      instanceId: module.instanceId,
      kind,
      online: module.online,
      range,
      rack: module.rack,
      status: coreAvailable ? "available" as const : "unavailable" as const,
      typeId: module.projection.typeId,
      volley
    };
  });

  const turretWeapons = weapons.filter((weapon) => weapon.kind === "turret");
  const missileWeapons = weapons.filter((weapon) => weapon.kind === "missile");
  const turretVolley = sumDamage(turretWeapons.map((weapon) => weapon.volley));
  const missileVolley = sumDamage(missileWeapons.map((weapon) => weapon.volley));
  const turretDps = sumDamage(turretWeapons.map((weapon) => weapon.dps));
  const missileDps = sumDamage(missileWeapons.map((weapon) => weapon.dps));
  const diagnostics = deduplicateDiagnostics([
    ...metadataDiagnostics,
    ...weapons.flatMap((weapon) => weapon.diagnostics),
    ...evaluated.diagnostics
  ]);
  const incomplete =
    metadataDiagnostics.length > 0 ||
    weapons.some((weapon) => weapon.status !== "available") ||
    diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === "error" || diagnostic.severity === "unsupported"
    );

  return {
    combinedDps: addDamage(turretDps, missileDps),
    combinedVolley: addDamage(turretVolley, missileVolley),
    diagnostics,
    missileDps,
    missileVolley,
    status: incomplete ? "partial" : "available",
    turretDps,
    turretVolley,
    weapons
  };
}

export function unavailableOffense(reason: string): EffectiveOffenseAnalysis {
  return {
    combinedDps: zeroDamage(),
    combinedVolley: zeroDamage(),
    diagnostics: [{ code: "offense-analysis-unavailable", message: reason, severity: "unsupported" }],
    missileDps: zeroDamage(),
    missileVolley: zeroDamage(),
    status: "unavailable",
    turretDps: zeroDamage(),
    turretVolley: zeroDamage(),
    weapons: []
  };
}

function classifyWeapon(
  module: OffenseModuleInput,
  effects: ReadonlyMap<number, DogmaEffectDefinition>
): { diagnostic: EngineDiagnostic; effectId: number; kind: "unsupported" } | { diagnostic: null; effectId: number; kind: "missile" | "turret" } | null {
  const effectIds = new Set(module.projection.effects.map((effect) => effect.effectId));
  const defaultEffectIds = module.projection.effects
    .filter((effect) => effect.isDefault)
    .map((effect) => effect.effectId);
  const firingEffectId = defaultEffectIds.find(
    (effectId) =>
      TURRET_FIRING_EFFECT_IDS.has(effectId) ||
      MISSILE_FIRING_EFFECT_IDS.has(effectId) ||
      DEFERRED_WEAPON_EFFECT_IDS.has(effectId)
  );
  if (firingEffectId === undefined) return null;
  const expectedName = weaponEffectNames.get(firingEffectId);
  if (!expectedName || effects.get(firingEffectId)?.name !== expectedName) {
    return {
      diagnostic: {
        code: "weapon-effect-metadata-mismatch",
        effectId: firingEffectId,
        instanceId: module.instanceId,
        message: `Weapon effect ${firingEffectId} does not match its canonical CCP metadata.`,
        severity: "unsupported"
      },
      effectId: firingEffectId,
      kind: "unsupported"
    };
  }
  if (DEFERRED_WEAPON_EFFECT_IDS.has(firingEffectId)) {
    return {
      diagnostic: {
        code: "weapon-family-deferred",
        effectId: firingEffectId,
        instanceId: module.instanceId,
        message: `Effect ${firingEffectId} (${expectedName}) requires specialized weapon semantics and is deferred.`,
        severity: "unsupported"
      },
      effectId: firingEffectId,
      kind: "unsupported"
    };
  }
  if (TURRET_FIRING_EFFECT_IDS.has(firingEffectId) && effectIds.has(TURRET_MARKER_EFFECT_ID)) {
    return { diagnostic: null, effectId: firingEffectId, kind: "turret" };
  }
  if (MISSILE_FIRING_EFFECT_IDS.has(firingEffectId) && effectIds.has(LAUNCHER_MARKER_EFFECT_ID)) {
    return { diagnostic: null, effectId: firingEffectId, kind: "missile" };
  }
  return {
    diagnostic: {
      code: "weapon-hardpoint-metadata-mismatch",
      effectId: firingEffectId,
      instanceId: module.instanceId,
      message: "The firing effect and authoritative hardpoint marker do not identify the same weapon family.",
      severity: "unsupported"
    },
    effectId: firingEffectId,
    kind: "unsupported"
  };
}

function validateWeaponMetadata(
  attributes: ReadonlyMap<number, DogmaAttributeDefinition>,
  effects: ReadonlyMap<number, DogmaEffectDefinition>,
  referencedEffectIds: ReadonlySet<number>,
  supportedKinds: ReadonlySet<"missile" | "turret">
) {
  const diagnostics: EngineDiagnostic[] = [];
  const requiredAttributeIds = new Set<number>([
    ...(supportedKinds.size
      ? [
          WEAPON_ATTRIBUTE_IDS.cycleDuration,
          WEAPON_ATTRIBUTE_IDS.emDamage,
          WEAPON_ATTRIBUTE_IDS.explosiveDamage,
          WEAPON_ATTRIBUTE_IDS.kineticDamage,
          WEAPON_ATTRIBUTE_IDS.thermalDamage
        ]
      : []),
    ...(supportedKinds.has("turret")
      ? [
          WEAPON_ATTRIBUTE_IDS.damageMultiplier,
          WEAPON_ATTRIBUTE_IDS.optimalRange,
          WEAPON_ATTRIBUTE_IDS.falloff,
          WEAPON_ATTRIBUTE_IDS.trackingSpeed
        ]
      : []),
    ...(supportedKinds.has("missile")
      ? [
          WEAPON_ATTRIBUTE_IDS.missileDamageMultiplier,
          WEAPON_ATTRIBUTE_IDS.missileVelocity,
          WEAPON_ATTRIBUTE_IDS.missileFlightTime,
          WEAPON_ATTRIBUTE_IDS.missileExplosionVelocity,
          WEAPON_ATTRIBUTE_IDS.missileExplosionRadius,
          WEAPON_ATTRIBUTE_IDS.missileDamageReductionFactor
        ]
      : [])
  ]);
  for (const [attributeId, expectedName] of weaponAttributeNames) {
    if (!requiredAttributeIds.has(attributeId)) continue;
    const actual = attributes.get(attributeId);
    if (!actual || actual.name !== expectedName) {
      diagnostics.push({
        attributeId,
        code: "weapon-attribute-metadata-mismatch",
        message: `Dogma attribute ${attributeId} must be ${expectedName}; received ${actual?.name ?? "missing"}.`,
        severity: "unsupported"
      });
    }
  }
  for (const [effectId, expectedName] of weaponEffectNames) {
    if (!referencedEffectIds.has(effectId)) continue;
    const actual = effects.get(effectId);
    if (!actual || actual.name !== expectedName) {
      diagnostics.push({
        code: "weapon-effect-metadata-mismatch",
        effectId,
        message: `Dogma effect ${effectId} must be ${expectedName}; received ${actual?.name ?? "missing"}.`,
        severity: "unsupported"
      });
    }
  }
  return diagnostics;
}

function turretRange(results: ReadonlyMap<string, AttributeResult>, instanceId: string): TurretRangeAnalysis {
  return {
    falloff: statistic(results, instanceId, WEAPON_ATTRIBUTE_IDS.falloff, true),
    optimal: statistic(results, instanceId, WEAPON_ATTRIBUTE_IDS.optimalRange, true),
    tracking: statistic(results, instanceId, WEAPON_ATTRIBUTE_IDS.trackingSpeed, true)
  };
}

function missileRange(results: ReadonlyMap<string, AttributeResult>, chargeId: string): MissileRangeAnalysis {
  const velocity = statistic(results, chargeId, WEAPON_ATTRIBUTE_IDS.missileVelocity, true);
  const flightTime = statistic(results, chargeId, WEAPON_ATTRIBUTE_IDS.missileFlightTime, true);
  return {
    damageReductionFactor: statistic(results, chargeId, WEAPON_ATTRIBUTE_IDS.missileDamageReductionFactor, true),
    explosionRadius: statistic(results, chargeId, WEAPON_ATTRIBUTE_IDS.missileExplosionRadius, true),
    explosionVelocity: statistic(results, chargeId, WEAPON_ATTRIBUTE_IDS.missileExplosionVelocity, true),
    flightTime,
    theoreticalRange:
      velocity.effective !== null && flightTime.effective !== null
        ? velocity.effective * (flightTime.effective / 1000)
        : null,
    velocity
  };
}

function rangeStatistics(range: MissileRangeAnalysis | TurretRangeAnalysis) {
  return "optimal" in range
    ? [range.optimal, range.falloff, range.tracking]
    : [
        range.velocity,
        range.flightTime,
        range.explosionVelocity,
        range.explosionRadius,
        range.damageReductionFactor
      ];
}

function statistic(
  results: ReadonlyMap<string, AttributeResult>,
  instanceId: string,
  attributeId: number,
  requireExplicit: boolean
): WeaponStatistic {
  const result = results.get(attributeKey(instanceId, attributeId));
  const diagnostics = result?.diagnostics ?? [{
    attributeId,
    code: "weapon-attribute-result-missing",
    instanceId,
    message: `Weapon attribute result ${instanceId}:${attributeId} is missing.`,
    severity: "unsupported" as const
  }];
  const unavailable =
    !result ||
    result.effective === null ||
    (requireExplicit && !result.explicit) ||
    diagnostics.some((item) => item.severity === "error" || item.severity === "unsupported");
  return {
    attributeId,
    base: result?.base ?? null,
    diagnostics,
    effective: unavailable ? null : result.effective,
    explicit: result?.explicit ?? false,
    modifiers: result?.modifiers ?? [],
    status: unavailable ? "unavailable" : "available"
  };
}

function unavailableWeapon(
  module: OffenseModuleInput,
  kind: EffectiveWeaponAnalysis["kind"],
  diagnostic: EngineDiagnostic
): EffectiveWeaponAnalysis {
  return {
    attributes: null,
    chargeTypeId: module.charge?.projection.typeId ?? null,
    cycleDurationMs: null,
    diagnostics: [diagnostic],
    dps: null,
    index: module.index,
    instanceId: module.instanceId,
    kind,
    online: module.online,
    range: null,
    rack: module.rack,
    status: kind === "unsupported" ? "unsupported" : "unavailable",
    typeId: module.projection.typeId,
    volley: null
  };
}

const damageAttributeIds = [
  WEAPON_ATTRIBUTE_IDS.emDamage,
  WEAPON_ATTRIBUTE_IDS.explosiveDamage,
  WEAPON_ATTRIBUTE_IDS.kineticDamage,
  WEAPON_ATTRIBUTE_IDS.thermalDamage
];

const missileRangeAttributeIds = [
  WEAPON_ATTRIBUTE_IDS.missileVelocity,
  WEAPON_ATTRIBUTE_IDS.missileFlightTime,
  WEAPON_ATTRIBUTE_IDS.missileExplosionVelocity,
  WEAPON_ATTRIBUTE_IDS.missileExplosionRadius,
  WEAPON_ATTRIBUTE_IDS.missileDamageReductionFactor
];

function multiplyDamage(
  damage: WeaponAttributeTrace["damage"],
  field: "base" | "effective",
  multiplier: number
): WeaponDamageBreakdown {
  return damageBreakdown(
    (damage.em[field] as number) * multiplier,
    (damage.explosive[field] as number) * multiplier,
    (damage.kinetic[field] as number) * multiplier,
    (damage.thermal[field] as number) * multiplier
  );
}

function divideDamage(damage: WeaponDamageBreakdown, seconds: number) {
  return damageBreakdown(
    damage.em / seconds,
    damage.explosive / seconds,
    damage.kinetic / seconds,
    damage.thermal / seconds
  );
}

function sumDamage(values: readonly (WeaponDamageBreakdown | null)[]) {
  return values.reduce<WeaponDamageBreakdown>(
    (total, value) => value ? addDamage(total, value) : total,
    zeroDamage()
  );
}

function addDamage(left: WeaponDamageBreakdown, right: WeaponDamageBreakdown) {
  return damageBreakdown(
    left.em + right.em,
    left.explosive + right.explosive,
    left.kinetic + right.kinetic,
    left.thermal + right.thermal
  );
}

function damageBreakdown(em: number, explosive: number, kinetic: number, thermal: number) {
  return { em, explosive, kinetic, thermal, total: em + explosive + kinetic + thermal };
}

function zeroDamage() {
  return damageBreakdown(0, 0, 0, 0);
}

function deduplicateDiagnostics(diagnostics: readonly EngineDiagnostic[]) {
  return Array.from(new Map(diagnostics.map((diagnostic) => [
    `${diagnostic.code}:${diagnostic.effectId ?? ""}:${diagnostic.instanceId ?? ""}:${diagnostic.attributeId ?? ""}:${diagnostic.message}`,
    diagnostic
  ])).values());
}
