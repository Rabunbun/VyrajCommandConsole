import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeEffectiveFitResources,
  FITTING_RESOURCE_ATTRIBUTE_IDS,
  PASSIVE_STAT_ATTRIBUTE_IDS,
  type DogmaAttributeDefinition,
  type DogmaEffectDefinition,
  type DogmaModifierDefinition,
  type DogmaTypeProjection,
  type EffectiveResourceModuleInput,
  type EffectiveResourceSkillInput
} from ".";

const sourceAttributes = {
  agilityPercent: 2004,
  armorAdd: 2001,
  cargoMultiplier: 2003,
  cargoSkillBonus: 496,
  massAdd: 796,
  rangePercent: 2005,
  resonancePercent: 2002,
  scanPercent: 2006,
  sensorPercent: 2007,
  shieldSkillBonus: 337,
  signaturePercent: 2008,
  velocityPercent: 2009,
  warpPercent: 2010
} as const;

const definitions: DogmaAttributeDefinition[] = [
  attribute(FITTING_RESOURCE_ATTRIBUTE_IDS.cpuOutput, "cpuOutput", 0, true),
  attribute(FITTING_RESOURCE_ATTRIBUTE_IDS.powergridOutput, "powerOutput", 0, true),
  attribute(FITTING_RESOURCE_ATTRIBUTE_IDS.cpuNeed, "cpu", 0, true),
  attribute(FITTING_RESOURCE_ATTRIBUTE_IDS.powergridNeed, "power", 0, true),
  attribute(FITTING_RESOURCE_ATTRIBUTE_IDS.skillLevel, "skillLevel", 0, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.mass, "mass", 0, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.hullHitpoints, "hp", 0, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.maxVelocity, "maxVelocity", 0, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.cargoCapacity, "capacity", 0, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.agility, "agility", 0, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.maxTargetRange, "maxTargetRange", 0, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.scanRadarStrength, "scanRadarStrength", 0, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.scanLadarStrength, "scanLadarStrength", 0, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.scanMagnetometricStrength, "scanMagnetometricStrength", 0, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.scanGravimetricStrength, "scanGravimetricStrength", 0, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.shieldHitpoints, "shieldCapacity", 0, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.armorHitpoints, "armorHP", 0, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.armorEmResonance, "armorEmDamageResonance", 1, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.armorExplosiveResonance, "armorExplosiveDamageResonance", 1, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.armorKineticResonance, "armorKineticDamageResonance", 1, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.armorThermalResonance, "armorThermalDamageResonance", 1, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.shieldEmResonance, "shieldEmDamageResonance", 1, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.shieldExplosiveResonance, "shieldExplosiveDamageResonance", 1, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.shieldKineticResonance, "shieldKineticDamageResonance", 1, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.shieldThermalResonance, "shieldThermalDamageResonance", 1, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.droneBayCapacity, "droneCapacity", 0, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.shieldRechargeTime, "shieldRechargeRate", 0, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.signatureRadius, "signatureRadius", 100, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.scanResolution, "scanResolution", 0, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.warpSpeedMultiplier, "warpSpeedMultiplier", 3, false),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.hullEmResonance, "hullEmDamageResonance", 1, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.hullExplosiveResonance, "hullExplosiveDamageResonance", 1, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.hullKineticResonance, "hullKineticDamageResonance", 1, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.hullThermalResonance, "hullThermalDamageResonance", 1, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.droneBandwidth, "droneBandwidth", 0, true),
  attribute(PASSIVE_STAT_ATTRIBUTE_IDS.baseWarpSpeed, "baseWarpSpeed", 0, true),
  ...Object.entries(sourceAttributes).map(([name, attributeId]) =>
    attribute(attributeId, name, 0, true)
  )
];

const effects: DogmaEffectDefinition[] = [
  effect(21, "shieldCapacityBonusOnline", 4, [modifier(21, 263, 2001, 2)]),
  effect(59, "cargoCapacityMultiply", 4, [modifier(59, 38, 2003, 4)]),
  effect(1001, "armorHitpointsAdd", 4, [modifier(1001, 265, 2001, 2)]),
  effect(1002, "armorResonance", 4, [modifier(1002, 267, 2002, 6)]),
  effect(1003, "velocity", 4, [modifier(1003, 37, 2009, 6)]),
  effect(1004, "agility", 4, [modifier(1004, 70, 2004, 6)]),
  effect(1005, "mass", 4, [modifier(1005, 4, 796, 2)]),
  effect(1006, "targeting", 4, [
    modifier(1006, 76, 2005, 6),
    modifier(1006, 564, 2006, 6),
    modifier(1006, 210, 2007, 6),
    modifier(1006, 552, 2008, 6)
  ]),
  effect(1007, "warp", 4, [modifier(1007, 600, 2010, 6)]),
  effect(446, "shieldManagement", 0, [modifier(446, 263, 337, 6)]),
  effect(447, "shieldManagementLevel", 0, [modifier(447, 337, 280, 0, "itemID")]),
  effect(532, "gallenteIndustrialLevel", 0, [modifier(532, 496, 280, 0)]),
  effect(726, "shipBonusCargo2GI", 0, [modifier(726, 38, 496, 6)]),
  effect(2000, "unsupportedShield", 4, [modifier(2000, 263, 2001, 2)], "requires-special-handler")
];

const hull = projection(626, 26, 6, [
  [11, 700], [48, 300], [4, 11_310_000], [9, 2000], [37, 195], [38, 480],
  [70, 0.56], [76, 52_500], [208, 0], [209, 0], [210, 16], [211, 0],
  [263, 1100], [265, 2000], [267, 0.5], [268, 0.9], [269, 0.65],
  [270, 0.65], [271, 1], [272, 0.5], [273, 0.6], [274, 0.8],
  [283, 125], [479, 1_250_000], [552, 145], [564, 280], [600, 4],
  [1271, 75], [1281, 1]
]);

const shieldManagement = projection(3416, 1216, 16, [[280, 0], [337, 5]], [447, 446]);
const gallenteIndustrial = projection(3340, 1213, 16, [[280, 0]], [532]);

test("HP modifiers, shield skills, and peak recharge remain independently traceable", () => {
  const result = analyze({
    modules: [module("extender", "mid", 0, projection(3831, 38, 7, [[2001, 500]], [21])), module("plate", "low", 0, projection(20353, 328, 7, [[2001, 800]], [1001]))],
    skills: [skill(shieldManagement, 5)]
  });

  assert.equal(result.defense.shield.hitpoints.effective, 2000);
  assert.equal(result.defense.armor.hitpoints.effective, 2800);
  assert.equal(result.defense.peakShieldRecharge.effective, 4);
  assert.deepEqual(result.defense.shield.hitpoints.modifiers.map((trace) => trace.effectId), [21, 446]);
});

test("resonance becomes resistance and passive resistance stacking is penalized", () => {
  const resist = (id: number, instanceId: string) => module(instanceId, "low", id, projection(10_000 + id, 98, 7, [[2002, -20]], [1002]));
  const result = analyze({ modules: [resist(0, "resist-a"), resist(1, "resist-b")], skills: [] });
  const resonance = result.defense.armor.resonances.em;

  assert.ok(resonance.effective !== null);
  assert.ok(resonance.effective > 0.33 && resonance.effective < 0.331);
  assert.ok((result.defense.armor.resistances.em.effective ?? 0) > 0.669);
  assert.deepEqual(resonance.modifiers.map((trace) => trace.stackingPosition), [0, 1]);
  assert.ok((resonance.modifiers[1]?.effectiveMultiplier ?? 1) > 0.8);
});

test("cargo hull skill and passive module, rig, and penalty chain combine generically", () => {
  const industrialHull = projection(657, 28, 6, [...hull.attributes.filter((value) => value.attributeId !== 38).map((value) => [value.attributeId, value.value] as [number, number]), [38, 5800], [496, 5]], [726]);
  const result = analyze({
    hull: industrialHull,
    modules: [
      module("expander", "low", 0, projection(1319, 326, 7, [[2003, 1.275]], [59])),
      module("cargo-rig", "rig", 0, projection(31119, 312, 7, [[2003, 1.15]], [59])),
      module("overdrive", "low", 1, projection(1236, 762, 7, [[2003, 0.8]], [59]))
    ],
    skills: [skill(gallenteIndustrial, 5)]
  });

  closeTo(result.capacities.cargo.effective, 8504.25);
  assert.equal(result.capacities.cargo.modifiers.length, 4);
  assert.deepEqual(result.capacities.cargo.modifiers.map((trace) => trace.sourceInstanceId), ["cargo-rig", "expander", "overdrive", "ship"]);
});

test("Drone Bay and bandwidth preserve authoritative base and effective values", () => {
  const result = analyze({ modules: [], skills: [] });
  assert.equal(result.capacities.droneBay.base, 125);
  assert.equal(result.capacities.droneBay.effective, 125);
  assert.equal(result.capacities.droneBandwidth.effective, 75);
});

test("target range, resolution, sensor strength, and signature radius evaluate", () => {
  const targeting = projection(11_000, 212, 7, [[2005, 20], [2006, 10], [2007, 25], [2008, -10]], [1006]);
  const result = analyze({ modules: [module("targeting", "low", 0, targeting)], skills: [] });

  assert.equal(result.targeting.maxTargetRange.effective, 63_000);
  assert.equal(result.targeting.scanResolution.effective, 308);
  assert.equal(result.targeting.sensorStrengths.magnetometric.effective, 20);
  assert.equal(result.targeting.signatureRadius.effective, 130.5);
});

test("velocity, mass, inertia, align time, and warp speed use effective inputs", () => {
  const navigation = projection(12_000, 762, 7, [[2009, 12.5], [2004, -15], [796, 100_000], [2010, 20]], [1003, 1004, 1005, 1007]);
  const result = analyze({ modules: [module("navigation", "low", 0, navigation)], skills: [] });

  closeTo(result.navigation.maxVelocity.effective, 219.375);
  assert.equal(result.navigation.mass.effective, 11_410_000);
  closeTo(result.navigation.agility.effective, 0.476);
  closeTo(result.navigation.alignTime.effective, 7.529186482339905);
  assert.equal(result.navigation.warpSpeed.effective, 4.8);
});

test("All V, lower active levels, unavailable, and stale profiles remain distinct", () => {
  const allV = analyze({ skills: [skill(shieldManagement, 5)] });
  const lower = analyze({ profileKind: "explicit", skills: [skill(shieldManagement, 2)] });
  const stale = analyze({ profileDiagnostics: [{ code: "effective-resource-profile-stale", message: "stale", severity: "warning" }], profileKind: "explicit", skills: [skill(shieldManagement, 2)] });
  const unavailable = analyzeUnavailable();

  assert.equal(allV.defense.shield.hitpoints.effective, 1375);
  assert.equal(lower.defense.shield.hitpoints.effective, 1210);
  assert.equal(stale.profileStale, true);
  assert.equal(stale.defense.shield.hitpoints.effective, 1210);
  assert.equal(unavailable.defense.status, "unavailable");
  assert.equal(unavailable.navigation.alignTime.effective, null);
});

test("an unsupported passive effect invalidates only its statistic section", () => {
  const special = projection(13_000, 38, 7, [[2001, 500]], [2000]);
  const result = analyze({ modules: [module("special", "mid", 0, special)], skills: [] });

  assert.equal(result.status, "available");
  assert.equal(result.defense.shield.hitpoints.status, "unavailable");
  assert.equal(result.defense.status, "partial");
  assert.equal(result.capacities.status, "available");
  assert.equal(result.targeting.status, "available");
});

test("missing explicit mass isolates mass and align while other navigation remains available", () => {
  const masslessHull = projection(14_000, 26, 6, hull.attributes.filter((attributeValue) => attributeValue.attributeId !== 4).map((attributeValue) => [attributeValue.attributeId, attributeValue.value]));
  const result = analyze({ hull: masslessHull, modules: [], skills: [] });

  assert.equal(result.navigation.mass.status, "unavailable");
  assert.equal(result.navigation.alignTime.status, "unavailable");
  assert.equal(result.navigation.maxVelocity.status, "available");
  assert.equal(result.navigation.warpSpeed.status, "available");
  assert.equal(result.navigation.status, "partial");
});

function analyze(options: {
  hull?: DogmaTypeProjection;
  modules?: EffectiveResourceModuleInput[];
  profileDiagnostics?: Parameters<typeof analyzeEffectiveFitResources>[0]["profileDiagnostics"];
  profileKind?: "all-v" | "explicit";
  skills: EffectiveResourceSkillInput[];
}) {
  return analyzeEffectiveFitResources({
    attributeDefinitions: definitions,
    effectDefinitions: effects,
    hull: options.hull ?? hull,
    modules: options.modules ?? [],
    profile: { kind: options.profileKind ?? "all-v", skills: options.skills },
    profileDiagnostics: options.profileDiagnostics,
    staticDataAvailable: true
  });
}

function analyzeUnavailable() {
  return analyzeEffectiveFitResources({
    attributeDefinitions: definitions,
    effectDefinitions: effects,
    hull,
    modules: [],
    profile: { kind: "unavailable", reason: "No linked snapshot." },
    staticDataAvailable: true
  });
}

function skill(projectionValue: DogmaTypeProjection, activeLevel: number): EffectiveResourceSkillInput {
  return { activeLevel, projection: projectionValue };
}

function module(instanceId: string, rack: EffectiveResourceModuleInput["rack"], index: number, projectionValue: DogmaTypeProjection): EffectiveResourceModuleInput {
  return { index, instanceId, projection: projectionValue, rack };
}

function projection(typeId: number, groupId: number, categoryId: number, attributes: Array<[number, number]>, effectIds: number[] = []): DogmaTypeProjection {
  return {
    attributes: attributes.map(([attributeId, value]) => ({ attributeId, value })),
    categoryId,
    effects: effectIds.map((effectId) => ({ effectId, isDefault: false })),
    groupId,
    requiredSkillTypeIds: [],
    typeId
  };
}

function attribute(attributeId: number, name: string, defaultValue: number, stackable: boolean): DogmaAttributeDefinition {
  return { attributeId, defaultValue, highIsGood: null, maxAttributeId: null, minAttributeId: null, name, stackable, unitId: null };
}

function effect(effectId: number, name: string, categoryId: number, modifiers: DogmaModifierDefinition[], capability: DogmaEffectDefinition["capability"] = "generic-modifier"): DogmaEffectDefinition {
  return { capability, categoryId, dischargeAttributeId: null, durationAttributeId: null, effectId, modifiers, name };
}

function modifier(effectId: number, modifiedAttributeId: number, modifyingAttributeId: number, operation: number, domain = "shipID"): DogmaModifierDefinition {
  return { domain, effectId, functionName: "ItemModifier", groupId: null, modifiedAttributeId, modifyingAttributeId, operation, ordinal: 1, skillTypeId: null };
}

function closeTo(actual: number | null, expected: number) {
  assert.ok(actual !== null);
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} !== ${expected}`);
}
