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
  advancedWeaponUpgrades: 11207,
  ancillaryCurrentRouter: 31358,
  coProcessor: 3888,
  cpuManagement: 3426,
  powerGridManagement: 3413,
  railgun: 3090,
  reactorControl: 1355,
  weaponUpgrades: 3318
} as const;

const attributeDefinitions: DogmaAttributeDefinition[] = [
  attribute(11, "powerOutput", 0, true),
  attribute(30, "power", 0, true),
  attribute(48, "cpuOutput", 0, true),
  attribute(50, "cpu", 0, true),
  attribute(145, "powerOutputMultiplier", 1, true),
  attribute(202, "cpuMultiplier", 1, true),
  attribute(280, "skillLevel", 0, true),
  attribute(310, "cpuNeedBonus", 0, true),
  attribute(313, "powerEngineeringOutputBonus", 0, true),
  attribute(323, "powerNeedBonus", 0, true),
  attribute(424, "cpuOutputBonus2", 0, true)
];

const effects: DogmaEffectDefinition[] = [
  effect(56, "powerOutputMultiply", 4, [modifier(56, 11, 145, 4)]),
  effect(132, "skillEffect", 0, [
    modifier(132, 280, 280, 9)
  ], "requires-special-handler"),
  effect(211, "weaponUpgradesSkillBoostCpuNeedBonus", 0, [
    modifier(211, 310, 280, 0, "itemID")
  ]),
  effect(218, "engineeringSkillBoostPowerOutputBonus", 0, [
    modifier(218, 313, 280, 0, "itemID")
  ]),
  effect(246, "advancedWeaponUpgradesSkillBoostPowerNeedBonus", 0, [
    modifier(246, 323, 280, 0, "itemID")
  ]),
  effect(368, "electronicsSkillBoostCpuOutputBonus", 0, [
    modifier(368, 424, 280, 0, "itemID")
  ]),
  effect(397, "electronicsCpuOutputBonus", 0, [
    modifier(397, 48, 424, 6)
  ]),
  effect(490, "engineeringPowerOutputBonus", 0, [
    modifier(490, 11, 313, 6)
  ]),
  effect(536, "cpuMultiplier", 4, [modifier(536, 48, 202, 4)]),
  effect(581, "weaponUpgradesCpuNeed", 0, [
    modifier(581, 50, 310, 6, "shipID", "LocationRequiredSkillModifier", 3300)
  ]),
  effect(1638, "advancedWeaponUpgradesPowerNeed", 0, [
    modifier(1638, 30, 323, 6, "shipID", "LocationRequiredSkillModifier", 3300)
  ])
];

const hull = projection(626, 26, 6, [[11, 700], [48, 300]]);
const cpuManagement = projection(ids.cpuManagement, 1216, 16, [
  [280, 0],
  [424, 5]
], [132, 368, 397]);
const powerGridManagement = projection(ids.powerGridManagement, 1216, 16, [
  [280, 0],
  [313, 5]
], [132, 218, 490]);
const weaponUpgrades = projection(ids.weaponUpgrades, 1216, 16, [
  [280, 0],
  [310, -5]
], [132, 211, 581]);
const advancedWeaponUpgrades = projection(ids.advancedWeaponUpgrades, 1216, 16, [
  [280, 0],
  [323, -2]
], [132, 246, 1638]);
const coProcessor = projection(ids.coProcessor, 285, 7, [
  [30, 1],
  [50, 0],
  [202, 1.1]
], [536]);
const reactorControl = projection(ids.reactorControl, 769, 7, [
  [30, 0],
  [50, 22],
  [145, 1.15]
], [56]);
const ancillaryCurrentRouter = projection(ids.ancillaryCurrentRouter, 781, 7, [
  [313, 10]
], [490]);
const railgun = projection(ids.railgun, 74, 7, [
  [30, 2310],
  [50, 74]
], [], [3300, 3307, 12207]);
const unrelatedModule = projection(9999, 999, 7, [[30, 10], [50, 10]]);

test("bare hull output preserves base values and applies CPU/PG Management", () => {
  const base = analyze({ skills: [] });
  assert.equal(base.cpu.baseOutput, 300);
  assert.equal(base.cpu.effectiveOutput, 300);
  assert.equal(base.powergrid.baseOutput, 700);
  assert.equal(base.powergrid.effectiveOutput, 700);

  const allV = analyze({
    skills: [skill(cpuManagement, 5), skill(powerGridManagement, 5)]
  });
  assert.equal(allV.cpu.effectiveOutput, 375);
  assert.equal(allV.powergrid.effectiveOutput, 875);
  assert.equal(allV.status, "available");
});

test("online Co-Processor and Reactor Control effects modify ship output generically", () => {
  const result = analyze({
    modules: [module("co-pro", "low", 0, coProcessor), module("rcu", "low", 1, reactorControl)],
    skills: [skill(cpuManagement, 5), skill(powerGridManagement, 5)]
  });

  closeTo(result.cpu.effectiveOutput, 412.5);
  closeTo(result.powergrid.effectiveOutput, 1006.25);
  assert.equal(result.cpu.effectiveUsed, 22);
  assert.equal(result.powergrid.effectiveUsed, 1);
  assert.equal(result.modules.find((item) => item.instanceId === "co-pro")?.cpu.base, 0);
  assert.equal(result.modules.find((item) => item.instanceId === "rcu")?.powergrid.base, 0);
  assert.deepEqual(
    result.cpu.effectiveOutput === null
      ? []
      : result.modules.map((item) => item.instanceId),
    ["co-pro", "rcu"]
  );
});

test("Weapon Upgrades and Advanced Weapon Upgrades filter by required skill", () => {
  const result = analyze({
    modules: [
      module("rail", "high", 0, railgun),
      module("unrelated", "mid", 0, unrelatedModule)
    ],
    skills: [skill(weaponUpgrades, 5), skill(advancedWeaponUpgrades, 5)]
  });
  const rail = result.modules.find((item) => item.instanceId === "rail");
  const unrelated = result.modules.find((item) => item.instanceId === "unrelated");

  assert.equal(rail?.cpu.effective, 55.5);
  assert.equal(rail?.powergrid.effective, 2079);
  assert.equal(unrelated?.cpu.effective, 10);
  assert.equal(unrelated?.powergrid.effective, 10);
  assert.equal(result.powergrid.overage, 1389);
  assert.equal(rail?.cpu.modifiers[0]?.sourceTypeId, ids.weaponUpgrades);
  assert.equal(rail?.powergrid.modifiers[0]?.sourceTypeId, ids.advancedWeaponUpgrades);
  assert.equal(unrelated?.cpu.modifiers.length, 0);
});

test("duplicate module types remain separate instances and sum independently", () => {
  const result = analyze({
    modules: [
      module("rail-a", "high", 0, railgun),
      module("rail-b", "high", 1, railgun)
    ],
    skills: [skill(weaponUpgrades, 5), skill(advancedWeaponUpgrades, 5)]
  });

  assert.equal(result.modules.length, 2);
  assert.equal(result.cpu.effectiveUsed, 111);
  assert.equal(result.powergrid.effectiveUsed, 4158);
  assert.deepEqual(result.modules.map((item) => item.instanceId), ["rail-a", "rail-b"]);
});

test("Ancillary Current Router contributes through the same projected PG effect", () => {
  const result = analyze({
    modules: [module("acr", "rig", 0, ancillaryCurrentRouter)],
    skills: [skill(powerGridManagement, 5)]
  });

  closeTo(result.powergrid.effectiveOutput, 962.5);
  assert.equal(result.modules[0]?.powergrid.base, 0);
});

test("explicit lower skill levels change results without mutating fit inputs", () => {
  const modules = [module("rail", "high", 0, railgun)];
  const before = structuredClone(modules);
  const lower = analyze({
    modules,
    profileKind: "explicit",
    skills: [
      skill(cpuManagement, 3),
      skill(powerGridManagement, 4),
      skill(weaponUpgrades, 2),
      skill(advancedWeaponUpgrades, 1)
    ]
  });
  const allV = analyze({
    modules,
    skills: [
      skill(cpuManagement, 5),
      skill(powerGridManagement, 5),
      skill(weaponUpgrades, 5),
      skill(advancedWeaponUpgrades, 5)
    ]
  });

  assert.equal(lower.cpu.effectiveOutput, 345);
  assert.equal(lower.powergrid.effectiveOutput, 840);
  closeTo(lower.modules[0]?.cpu.effective, 66.6);
  assert.equal(lower.modules[0]?.powergrid.effective, 2263.8);
  assert.notEqual(lower.cpu.effectiveOutput, allV.cpu.effectiveOutput);
  assert.deepEqual(modules, before);
});

test("unavailable profiles never masquerade base values as effective", () => {
  const result = analyzeEffectiveFitResources({
    attributeDefinitions,
    effectDefinitions: effects,
    hull,
    modules: [],
    profile: { kind: "unavailable", reason: "No linked snapshot." },
    staticDataAvailable: true
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.cpu.effectiveOutput, null);
  assert.equal(result.powergrid.effectiveOutput, null);
  assert.equal(result.diagnostics[0]?.code, "effective-resource-analysis-unavailable");
});

test("active resource effects are deferred instead of being fabricated", () => {
  const activeEffect = effect(
    9001,
    "activeCpuEffect",
    1,
    [modifier(9001, 48, 202, 4)],
    "requires-special-handler"
  );
  const activeHull = projection(7001, 25, 6, [[48, 300], [11, 700], [202, 2]], [9001]);
  const result = analyzeEffectiveFitResources({
    attributeDefinitions,
    effectDefinitions: [...effects, activeEffect],
    hull: activeHull,
    modules: [],
    profile: { kind: "all-v", skills: [] },
    staticDataAvailable: true
  });

  assert.equal(result.status, "available");
  assert.equal(result.cpu.effectiveOutput, 300);
  assert.equal(result.diagnostics.length, 0);
});

test("passive resource effects requiring a special handler make analysis unavailable", () => {
  const specialEffect = effect(
    9002,
    "specialCpuEffect",
    0,
    [modifier(9002, 48, 202, 4)],
    "requires-special-handler"
  );
  const specialHull = projection(7002, 25, 6, [[48, 300], [11, 700], [202, 2]], [9002]);
  const result = analyzeEffectiveFitResources({
    attributeDefinitions,
    effectDefinitions: [...effects, specialEffect],
    hull: specialHull,
    modules: [],
    profile: { kind: "all-v", skills: [] },
    staticDataAvailable: true
  });

  assert.equal(result.status, "unavailable");
  assert.equal(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "resource-effect-requires-special-handler"
    ),
    true
  );
});

test("modifier traces retain profile, source, operation, and before/after provenance", () => {
  const result = analyze({
    modules: [module("co", "low", 0, coProcessor)],
    skills: [skill(cpuManagement, 5)]
  });
  const skillTrace = result.cpu.output.modifiers.find(
    (trace) => trace.sourceTypeId === ids.cpuManagement
  );
  const moduleTrace = result.cpu.output.modifiers.find(
    (trace) => trace.sourceInstanceId === "co"
  );

  assert.ok(skillTrace);
  assert.equal(skillTrace.effectId, 397);
  assert.equal(skillTrace.modifyingAttributeId, 424);
  assert.equal(skillTrace.rawValue, 25);
  assert.equal(skillTrace.before, 330);
  closeTo(skillTrace.after, 412.5);
  assert.ok(moduleTrace);
  assert.equal(moduleTrace.effectId, 536);
  assert.equal(moduleTrace.operation, 4);
  assert.equal(moduleTrace.rawMultiplier, 1.1);
  assert.equal(moduleTrace.effectiveMultiplier, 1.1);
  assert.equal(moduleTrace.before, 300);
  assert.equal(moduleTrace.after, 330);
});

test("stacking traces expose raw/effective multipliers when the target requires penalties", () => {
  const definitions = attributeDefinitions.map((definition) =>
    definition.attributeId === 48
      ? { ...definition, stackable: false }
      : definition
  );
  const result = analyze({
    attributeDefinitions: definitions,
    modules: [
      module("co-a", "low", 0, coProcessor),
      module("co-b", "low", 1, coProcessor)
    ],
    skills: []
  });
  assert.ok((result.cpu.effectiveOutput ?? 0) > 358);
  assert.ok((result.cpu.effectiveOutput ?? 0) < 360);
  const traces = result.cpu.output.modifiers.filter(
    (trace) => trace.effectId === 536
  );
  assert.deepEqual(traces.map((trace) => trace.stackingPosition), [0, 1]);
  assert.equal(traces[0]?.rawMultiplier, 1.1);
  assert.ok((traces[1]?.effectiveMultiplier ?? 1) < 1.1);
});

function analyze(options: {
  attributeDefinitions?: DogmaAttributeDefinition[];
  modules?: EffectiveResourceModuleInput[];
  profileKind?: "all-v" | "explicit";
  skills: EffectiveResourceSkillInput[];
}) {
  return analyzeEffectiveFitResources({
    attributeDefinitions: options.attributeDefinitions ?? attributeDefinitions,
    effectDefinitions: effects,
    hull,
    modules: options.modules ?? [],
    profile: { kind: options.profileKind ?? "all-v", skills: options.skills },
    staticDataAvailable: true
  });
}

function skill(
  projectionValue: DogmaTypeProjection,
  activeLevel: number
): EffectiveResourceSkillInput {
  return { activeLevel, projection: projectionValue };
}

function module(
  instanceId: string,
  rack: EffectiveResourceModuleInput["rack"],
  index: number,
  projectionValue: DogmaTypeProjection
): EffectiveResourceModuleInput {
  return { index, instanceId, projection: projectionValue, rack };
}

function projection(
  typeId: number,
  groupId: number,
  categoryId: number,
  attributes: Array<[number, number]>,
  effectIds: number[] = [],
  requiredSkillTypeIds: number[] = []
): DogmaTypeProjection {
  return {
    attributes: attributes.map(([attributeId, value]) => ({ attributeId, value })),
    categoryId,
    effects: effectIds.map((effectId) => ({ effectId, isDefault: false })),
    groupId,
    requiredSkillTypeIds,
    typeId
  };
}

function attribute(
  attributeId: number,
  name: string,
  defaultValue: number,
  stackable: boolean
): DogmaAttributeDefinition {
  return {
    attributeId,
    defaultValue,
    highIsGood: null,
    maxAttributeId: null,
    minAttributeId: null,
    name,
    stackable,
    unitId: null
  };
}

function effect(
  effectId: number,
  name: string,
  categoryId: number,
  modifiers: DogmaModifierDefinition[],
  capability: DogmaEffectDefinition["capability"] = "generic-modifier"
): DogmaEffectDefinition {
  return {
    capability,
    categoryId,
    dischargeAttributeId: null,
    durationAttributeId: null,
    effectId,
    modifiers,
    name
  };
}

function modifier(
  effectId: number,
  modifiedAttributeId: number,
  modifyingAttributeId: number,
  operation: number,
  domain = "shipID",
  functionName = "ItemModifier",
  skillTypeId: number | null = null
): DogmaModifierDefinition {
  return {
    domain,
    effectId,
    functionName,
    groupId: null,
    modifiedAttributeId,
    modifyingAttributeId,
    operation,
    ordinal: 1,
    skillTypeId
  };
}

function closeTo(actual: number | null | undefined, expected: number) {
  assert.ok(actual !== null && actual !== undefined);
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
}
