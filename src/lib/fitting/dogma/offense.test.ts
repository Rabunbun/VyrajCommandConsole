import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeEffectiveFitResources,
  type DogmaAttributeDefinition,
  type DogmaEffectDefinition,
  type DogmaModifierDefinition,
  type DogmaTypeProjection,
  type EffectiveResourceModuleInput,
  type EffectiveResourceSkillInput
} from ".";

const ids = {
  ballisticControl: 22291,
  missile: 206,
  missileLauncher: 2410,
  missileSkill: 3319,
  projectileAmmo: 185,
  turret: 2889,
  turretSkill: 3302,
  weaponUpgrade: 519
} as const;

const attributes: DogmaAttributeDefinition[] = [
  attribute(6, "capacitorNeed", 0, true),
  attribute(11, "powerOutput", 0, true),
  attribute(30, "power", 0, true),
  attribute(37, "maxVelocity", 0, false),
  attribute(48, "cpuOutput", 0, true),
  attribute(50, "cpu", 0, true),
  attribute(51, "speed", 0, false),
  attribute(54, "maxRange", 0, false),
  attribute(64, "damageMultiplier", 1, false),
  attribute(114, "emDamage", 0, true),
  attribute(116, "explosiveDamage", 0, true),
  attribute(117, "kineticDamage", 0, true),
  attribute(118, "thermalDamage", 0, true),
  attribute(120, "weaponRangeMultiplier", 1, true),
  attribute(158, "falloff", 1, false),
  attribute(160, "trackingSpeed", 0, false),
  attribute(204, "speedMultiplier", 1, true),
  attribute(212, "missileDamageMultiplier", 1, false),
  attribute(213, "missileDamageMultiplierBonus", 1, true),
  attribute(244, "trackingSpeedMultiplier", 1, true),
  attribute(280, "skillLevel", 0, true),
  attribute(281, "explosionDelay", 0, false),
  attribute(517, "fallofMultiplier", 1, true),
  attribute(653, "aoeVelocity", 0, false),
  attribute(654, "aoeCloudSize", 0, false),
  attribute(1353, "aoeDamageReductionFactor", 1, true),
  attribute(2001, "turretDamageBonus", 0, true),
  attribute(2002, "missileKineticBonus", 0, true),
  attribute(2003, "missileSkillDamageBonus", 0, true)
];

const effects: DogmaEffectDefinition[] = [
  effect(9, "missileLaunching", 2, [], "requires-special-handler", null),
  effect(34, "projectileFired", 2, [], "requires-special-handler", 51),
  effect(40, "launcherFitted", 0, [], "metadata-nonexecuting", null),
  effect(42, "turretFitted", 0, [], "metadata-nonexecuting", null),
  effect(101, "useMissiles", 1, [], "requires-special-handler", 51),
  effect(596, "ammoInfluenceRange", 0, [modifier(596, 54, 120, 0, "otherID")]),
  effect(599, "ammoFallofMultiplier", 0, [modifier(599, 158, 517, 4, "otherID")]),
  effect(600, "ammoTrackingMultiplier", 0, [modifier(600, 160, 244, 4, "otherID")]),
  effect(9001, "turretHullDamage", 0, [
    modifier(9001, 64, 2001, 6, "shipID", "LocationRequiredSkillModifier", ids.turretSkill)
  ]),
  effect(9002, "weaponUpgradeDamage", 4, [
    modifier(9002, 64, 64, 4, "shipID", "LocationGroupModifier", null, 55)
  ]),
  effect(9003, "weaponUpgradeSpeed", 4, [
    modifier(9003, 51, 204, 4, "shipID", "LocationGroupModifier", null, 55)
  ]),
  effect(9004, "missileDamageControl", 4, [
    modifier(9004, 212, 213, 0, "charID")
  ]),
  effect(9005, "missileHullKinetic", 0, [
    modifier(9005, 117, 2002, 6, "charID", "OwnerRequiredSkillModifier", ids.missileSkill)
  ]),
  effect(9006, "missileSkillDamage", 0, [
    modifier(9006, 117, 2003, 6, "charID", "OwnerRequiredSkillModifier", ids.missileSkill)
  ]),
  effect(9007, "missileSkillLevel", 0, [
    modifier(9007, 2003, 280, 0, "itemID")
  ])
];

const hull = projection(100, 25, 6, [
  [11, 1000], [48, 500], [2001, 25], [2002, 50]
], [effectReference(9001), effectReference(9005)]);
const turret = projection(ids.turret, 55, 7, [
  [6, 0], [30, 1], [50, 1], [51, 4000], [54, 2000], [64, 2], [158, 5000], [160, 100]
], [effectReference(34, true), effectReference(42)], [ids.turretSkill]);
const projectileAmmo = projection(ids.projectileAmmo, 83, 8, [
  [114, 10], [116, 2], [117, 0], [118, 8], [120, 0.5], [244, 0.75], [517, 1.5]
], [effectReference(596), effectReference(599), effectReference(600)]);
const weaponUpgrade = projection(ids.weaponUpgrade, 59, 7, [
  [30, 1], [50, 1], [64, 1.1], [204, 0.9]
], [effectReference(9002), effectReference(9003)]);
const missileLauncher = projection(ids.missileLauncher, 510, 7, [
  [6, 0], [30, 1], [50, 1], [51, 10_000]
], [effectReference(40), effectReference(101, true)], [ids.missileSkill]);
const missile = projection(ids.missile, 385, 8, [
  [37, 4000], [114, 0], [116, 0], [117, 100], [118, 0], [281, 5000],
  [653, 100], [654, 150], [1353, 0.7]
], [effectReference(9, true)], [ids.missileSkill]);
const ballisticControl = projection(ids.ballisticControl, 367, 7, [
  [30, 1], [50, 1], [213, 1.1]
], [effectReference(9004)]);
const missileSkill = projection(ids.missileSkill, 256, 16, [
  [280, 0], [2003, 5]
], [effectReference(9006), effectReference(9007)]);

test("turret volley, cycle DPS, damage split, ammo range, and generic bonuses compose", () => {
  const result = analyze([
    fitted("turret", turret, projectileAmmo),
    fitted("gyro", weaponUpgrade, null, "low", 0)
  ]);
  const weapon = result.offense.weapons[0];

  closeTo(weapon.volley?.total, 55);
  closeTo(weapon.dps?.total, 15.277777777777779);
  closeTo(weapon.volley?.em, 27.5);
  closeTo(weapon.volley?.thermal, 22);
  assert.equal(weapon.attributes?.damageMultiplier.modifiers.length, 2);
  assert.equal(weapon.attributes?.cycleDuration.modifiers.length, 1);
  assert.equal(weapon.range && "optimal" in weapon.range ? weapon.range.optimal.effective : null, 1000);
  assert.equal(weapon.range && "falloff" in weapon.range ? weapon.range.falloff.effective : null, 7500);
  assert.equal(weapon.range && "tracking" in weapon.range ? weapon.range.tracking.effective : null, 75);
});

test("duplicate turrets remain independent and stacking-penalized upgrades remain traceable", () => {
  const result = analyze([
    fitted("turret-a", turret, projectileAmmo, "high", 0),
    fitted("turret-b", turret, projectileAmmo, "high", 1),
    fitted("gyro-a", weaponUpgrade, null, "low", 0),
    fitted("gyro-b", weaponUpgrade, null, "low", 1)
  ]);
  assert.equal(result.offense.weapons.length, 2);
  assert.ok(result.offense.combinedDps.total > 30.5);
  assert.ok(result.offense.combinedDps.total < 37.4);
  assert.deepEqual(result.offense.weapons.map((weapon) => weapon.instanceId), ["turret-a", "turret-b"]);
  assert.deepEqual(
    result.offense.weapons[0].attributes?.damageMultiplier.modifiers
      .filter((trace) => trace.effectId === 9002)
      .map((trace) => trace.stackingPosition),
    [0, 1]
  );
});

test("missile paper damage uses charge damage, character multiplier, range, and application attributes", () => {
  const result = analyze([
    fitted("launcher", missileLauncher, missile),
    fitted("bcs", ballisticControl, null, "low", 0)
  ]);
  const weapon = result.offense.weapons[0];

  closeTo(weapon.volley?.kinetic, 165);
  closeTo(weapon.dps?.total, 16.5);
  assert.equal(weapon.attributes?.damageMultiplier.modifiers[0]?.sourceTypeId, ids.ballisticControl);
  assert.equal(weapon.attributes?.damage.kinetic.modifiers[0]?.sourceTypeId, hull.typeId);
  assert.equal(weapon.range && "theoreticalRange" in weapon.range ? weapon.range.theoreticalRange : null, 20_000);
  assert.equal(weapon.range && "explosionRadius" in weapon.range ? weapon.range.explosionRadius.effective : null, 150);
});

test("lower explicit skill levels produce lower paper damage through the same owner modifier", () => {
  const allV = analyze(
    [fitted("launcher", missileLauncher, missile)],
    [],
    [skill(missileSkill, 5)]
  );
  const lower = analyze(
    [fitted("launcher", missileLauncher, missile)],
    [],
    [skill(missileSkill, 2)],
    "explicit"
  );

  closeTo(allV.offense.combinedDps.total, 18.75);
  closeTo(lower.offense.combinedDps.total, 16.5);
  assert.ok(lower.offense.combinedDps.total < allV.offense.combinedDps.total);
});

test("active and overheated flags do not alter paper DPS while offline weapons contribute zero", () => {
  const inactive = analyze([fitted("turret", turret, projectileAmmo)]);
  const activeHot = analyze([
    fitted("turret", turret, projectileAmmo, "high", 0, { active: true, online: true, overheated: true })
  ]);
  const offline = analyze([
    fitted("turret", turret, projectileAmmo, "high", 0, { active: true, online: false, overheated: true })
  ]);
  closeTo(inactive.offense.combinedDps.total, activeHot.offense.combinedDps.total);
  assert.equal(offline.offense.combinedDps.total, 0);
  assert.equal(offline.offense.combinedVolley.total, 0);
});

test("unloaded weapons stay visible as partial diagnostics without fabricated damage", () => {
  const result = analyze([fitted("turret", turret, null)]);
  assert.equal(result.offense.status, "partial");
  assert.equal(result.offense.weapons[0].status, "unavailable");
  assert.equal(result.offense.combinedDps.total, 0);
  assert.equal(result.offense.diagnostics[0]?.code, "weapon-charge-required");
});

test("specialized weapon effects are explicitly deferred", () => {
  const entropicEffect = effect(6995, "targetDisintegratorAttack", 2, [], "requires-special-handler", 51);
  const vortonEffect = effect(8037, "ChainLightning", 2, [], "requires-special-handler", 51);
  const entropic = projection(47918, 1986, 7, [[30, 1], [50, 1], [51, 5000]], [
    effectReference(42), effectReference(6995, true)
  ]);
  const result = analyze([fitted("entropic", entropic, projectileAmmo)], [entropicEffect, vortonEffect]);
  assert.equal(result.offense.status, "partial");
  assert.equal(result.offense.weapons[0].kind, "unsupported");
  assert.equal(result.offense.weapons[0].diagnostics[0]?.effectId, 6995);
});

function analyze(
  modules: EffectiveResourceModuleInput[],
  additionalEffects: DogmaEffectDefinition[] = [],
  skills: EffectiveResourceSkillInput[] = [],
  profileKind: "all-v" | "explicit" = "all-v"
) {
  return analyzeEffectiveFitResources({
    attributeDefinitions: attributes,
    effectDefinitions: [...effects, ...additionalEffects],
    hull,
    modules,
    profile: { kind: profileKind, skills },
    staticDataAvailable: true
  });
}

function skill(projection: DogmaTypeProjection, activeLevel: number): EffectiveResourceSkillInput {
  return { activeLevel, projection };
}

function fitted(
  instanceId: string,
  item: DogmaTypeProjection,
  charge: DogmaTypeProjection | null,
  rack: EffectiveResourceModuleInput["rack"] = "high",
  index = 0,
  lifecycle = { active: false, online: true, overheated: false }
): EffectiveResourceModuleInput {
  return { charge: charge ? { projection: charge } : null, index, instanceId, lifecycle, projection: item, rack };
}

function attribute(attributeId: number, name: string, defaultValue: number, stackable: boolean): DogmaAttributeDefinition {
  return { attributeId, defaultValue, highIsGood: null, maxAttributeId: null, minAttributeId: null, name, stackable, unitId: null };
}

function effect(
  effectId: number,
  name: string,
  categoryId: number,
  modifiers: DogmaModifierDefinition[],
  capability: DogmaEffectDefinition["capability"] = "generic-modifier",
  durationAttributeId: number | null = null
): DogmaEffectDefinition {
  return { capability, categoryId, dischargeAttributeId: null, durationAttributeId, effectId, modifiers, name };
}

function modifier(
  effectId: number,
  modifiedAttributeId: number,
  modifyingAttributeId: number,
  operation: number,
  domain: string,
  functionName = "ItemModifier",
  skillTypeId: number | null = null,
  groupId: number | null = null
): DogmaModifierDefinition {
  return { domain, effectId, functionName, groupId, modifiedAttributeId, modifyingAttributeId, operation, ordinal: 1, skillTypeId };
}

function projection(
  typeId: number,
  groupId: number,
  categoryId: number,
  values: Array<[number, number]>,
  effects: Array<{ effectId: number; isDefault: boolean }>,
  requiredSkillTypeIds: number[] = []
): DogmaTypeProjection {
  return { attributes: values.map(([attributeId, value]) => ({ attributeId, value })), categoryId, effects, groupId, requiredSkillTypeIds, typeId };
}

function effectReference(effectId: number, isDefault = false) {
  return { effectId, isDefault };
}

function closeTo(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined);
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
}
