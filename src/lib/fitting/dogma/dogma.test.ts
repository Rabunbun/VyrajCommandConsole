import assert from "node:assert/strict";
import test from "node:test";
import {
  DOGMA_OPERATIONS,
  applyStackingPenalty,
  buildAttributeDependencies,
  buildDogmaObjectGraph,
  classifyDogmaEffect,
  collectEffectModifiers,
  describeAttributeBounds,
  evaluateDogmaAttributes,
  evaluateAttributeOperations,
  orderAttributeDependencies,
  resolveBaseAttribute,
  stackingPenaltyFactor,
  type DogmaAttributeDefinition,
  type DogmaEffectDefinition,
  type DogmaModifierDefinition,
  type DogmaTypeProjection
} from ".";

const attributeDefinition: DogmaAttributeDefinition = {
  attributeId: 48,
  defaultValue: 10,
  highIsGood: true,
  maxAttributeId: null,
  minAttributeId: null,
  name: "cpuOutput",
  stackable: false,
  unitId: 106
};

const shipProjection = projection(1, 25, 6, [{ attributeId: 48, value: 0 }]);
const moduleProjection = projection(2, 46, 7, [{ attributeId: 202, value: 1.1 }], [3300]);
const chargeProjection = projection(3, 85, 8, [{ attributeId: 120, value: -50 }]);
const skillProjection = projection(3300, 255, 16, [{ attributeId: 280, value: 5 }]);

test("base attributes preserve explicit zero, default, and absence", () => {
  const explicit = resolveBaseAttribute(shipProjection, attributeDefinition);
  assert.equal(explicit.base, 0);
  assert.equal(explicit.explicit, true);

  const fallback = resolveBaseAttribute(
    projection(9, 1, 6),
    attributeDefinition
  );
  assert.equal(fallback.base, 10);
  assert.equal(fallback.explicit, false);

  const absent = resolveBaseAttribute(projection(9, 1, 6), {
    ...attributeDefinition,
    defaultValue: null
  });
  assert.equal(absent.base, null);
  assert.equal(absent.effective, null);
});

test("attribute bounds are structural and unresolved bounds are diagnosed", () => {
  const result = resolveBaseAttribute(shipProjection, {
    ...attributeDefinition,
    maxAttributeId: 100,
    minAttributeId: 99
  });
  const bounds = describeAttributeBounds(result, new Map([[99, 1]]));
  assert.equal(bounds.min, 1);
  assert.equal(bounds.max, null);
  assert.equal(bounds.diagnostics[0]?.code, "unresolved-attribute-bound");
});

test("runtime graph pairs loaded charges but not cargo charges", () => {
  const graph = makeGraph();
  assert.equal(graph.objects.get("charge-loaded")?.otherInstanceId, "module-a");
  assert.equal(graph.objects.get("module-a")?.otherInstanceId, "charge-loaded");
  assert.equal(graph.objects.get("charge-cargo")?.otherInstanceId, null);
});

test("duplicate fitted types remain distinct instances", () => {
  const graph = makeGraph();
  assert.equal(graph.objects.get("module-a")?.projection?.typeId, 2);
  assert.equal(graph.objects.get("module-b")?.projection?.typeId, 2);
  assert.notEqual(graph.objects.get("module-a"), graph.objects.get("module-b"));
});

test("duplicate runtime instance IDs are rejected", () => {
  assert.throws(
    () =>
      buildDogmaObjectGraph({
        character: { instanceId: "character", projection: skillProjection },
        modules: [{ instanceId: "ship", kind: "module", projection: moduleProjection }],
        ship: { instanceId: "ship", projection: shipProjection }
      }),
    /Duplicate Dogma runtime instance/
  );
});

test("ItemModifier resolves item, ship, character, and other domains", () => {
  const graph = makeGraph();
  const cases = [
    ["itemID", "module-a"],
    ["shipID", "ship"],
    ["charID", "character"],
    ["otherID", "charge-loaded"]
  ] as const;
  for (const [domain, expected] of cases) {
    const result = collectEffectModifiers({
      effect: genericEffect(modifier({ domain })),
      graph,
      sourceInstanceId: "module-a"
    });
    assert.equal(result.modifiers[0]?.target.instanceId, expected);
  }
});

test("location group and required-skill filters use static projection metadata", () => {
  const graph = makeGraph();
  const group = collectEffectModifiers({
    effect: genericEffect(
      modifier({ functionName: "LocationGroupModifier", groupId: 46 })
    ),
    graph,
    sourceInstanceId: "ship"
  });
  assert.deepEqual(
    group.modifiers.map((item) => item.target.instanceId).sort(),
    ["module-a", "module-b"]
  );

  const skill = collectEffectModifiers({
    effect: genericEffect(
      modifier({
        functionName: "LocationRequiredSkillModifier",
        skillTypeId: 3300
      })
    ),
    graph,
    sourceInstanceId: "ship"
  });
  assert.deepEqual(
    skill.modifiers.map((item) => item.target.instanceId).sort(),
    ["module-a", "module-b"]
  );
});

test("owner required-skill filters can select active owned drones", () => {
  const drone = projection(4, 100, 18, [], [3300]);
  const graph = buildDogmaObjectGraph({
    activeDrones: [{ instanceId: "drone-a", projection: drone }],
    character: { instanceId: "character", projection: skillProjection },
    modules: [],
    ship: { instanceId: "ship", projection: shipProjection }
  });
  const result = collectEffectModifiers({
    effect: genericEffect(
      modifier({
        domain: "charID",
        functionName: "OwnerRequiredSkillModifier",
        skillTypeId: 3300
      })
    ),
    graph,
    sourceInstanceId: "ship"
  });
  assert.equal(result.modifiers[0]?.target.instanceId, "drone-a");
});

test("non-generic effects emit capability diagnostics and no modifiers", () => {
  const result = collectEffectModifiers({
    effect: { ...genericEffect(modifier()), capability: "requires-special-handler" },
    graph: makeGraph(),
    sourceInstanceId: "module-a"
  });
  assert.equal(result.modifiers.length, 0);
  assert.equal(result.diagnostics[0]?.severity, "unsupported");
});

test("activation effects are deferred even when their modifiers are generic", () => {
  assert.equal(
    classifyDogmaEffect({
      categoryId: 1,
      effectId: 500,
      modifiers: [modifier()]
    }),
    "requires-special-handler"
  );
  assert.equal(
    classifyDogmaEffect({
      categoryId: 4,
      effectId: 501,
      modifiers: [modifier()]
    }),
    "generic-modifier"
  );
});

test("runtime lifecycle selects online and supported active modifiers without fabricating overload", () => {
  const onlineEffect = {
    ...genericEffect(modifier({ domain: "shipID", effectId: 501 })),
    categoryId: 4,
    effectId: 501,
    name: "onlineEffect"
  };
  const activeEffect = {
    ...genericEffect(modifier({ domain: "shipID", effectId: 500 })),
    capability: "requires-special-handler" as const,
    categoryId: 1,
    effectId: 500,
    name: "activeEffect"
  };
  const overloadEffect = {
    ...genericEffect(modifier({ domain: "shipID", effectId: 502 })),
    capability: "requires-special-handler" as const,
    categoryId: 5,
    effectId: 502,
    name: "overloadEffect"
  };
  const runtimeModule = {
    ...moduleProjection,
    effects: [
      { effectId: 501, isDefault: false },
      { effectId: 500, isDefault: true },
      { effectId: 502, isDefault: false }
    ]
  };
  const evaluate = (lifecycle: { active: boolean; online: boolean; overheated: boolean }) =>
    evaluateDogmaAttributes({
      attributeDefinitions: new Map([[48, { ...attributeDefinition, stackable: true }], [202, {
        ...attributeDefinition,
        attributeId: 202,
        defaultValue: 1,
        name: "multiplier",
        stackable: true
      }]]),
      effectDefinitions: new Map([
        [501, onlineEffect],
        [500, activeEffect],
        [502, overloadEffect]
      ]),
      graph: buildDogmaObjectGraph({
        character: { instanceId: "character", projection: null },
        modules: [{
          instanceId: "module-a",
          kind: "module",
          lifecycle,
          projection: runtimeModule
        }],
        ship: {
          instanceId: "ship",
          projection: projection(1, 25, 6, [{ attributeId: 48, value: 100 }])
        }
      }),
      targets: [{ attributeId: 48, instanceId: "ship" }]
    });

  assert.equal(evaluate({ active: false, online: false, overheated: false }).results.get("ship:48")?.effective, 100);
  assert.ok(Math.abs((evaluate({ active: false, online: true, overheated: false }).results.get("ship:48")?.effective ?? 0) - 110) < 1e-9);
  const activeValue = evaluate({ active: true, online: true, overheated: false }).results.get("ship:48")?.effective ?? 0;
  assert.ok(Math.abs(activeValue - 121) < 1e-9, `active value ${activeValue}`);
  const heated = evaluate({ active: true, online: true, overheated: true });
  assert.ok(Math.abs((heated.results.get("ship:48")?.effective ?? 0) - 121) < 1e-9);
  assert.equal(
    heated.diagnostics.some(
      (diagnostic) => diagnostic.code === "resource-effect-requires-special-handler"
    ),
    true
  );
});

test("special-handler diagnostics are scoped to authoritative modifier targets", () => {
  const damageAttribute = {
    ...attributeDefinition,
    attributeId: 114,
    defaultValue: 0,
    name: "emDamage",
    stackable: true
  };
  const bonusAttribute = {
    ...attributeDefinition,
    attributeId: 200,
    defaultValue: 0,
    name: "specialDamageBonus",
    stackable: true
  };
  const specialEffect: DogmaEffectDefinition = {
    ...genericEffect(modifier({
      domain: "charID",
      effectId: 6396,
      functionName: "OwnerRequiredSkillModifier",
      modifiedAttributeId: 114,
      modifyingAttributeId: 200,
      skillTypeId: 999
    })),
    capability: "requires-special-handler",
    effectId: 6396,
    name: "skillStructureMissileDamageBonus"
  };
  const specialSkill = {
    ...projection(37796, 1, 16, [{ attributeId: 200, value: 5 }]),
    effects: [{ effectId: 6396, isDefault: false }]
  };
  const graph = buildDogmaObjectGraph({
    character: { instanceId: "character", projection: null },
    modules: [{
      charge: {
        instanceId: "ordinary-charge",
        projection: projection(10, 85, 8, [{ attributeId: 114, value: 10 }])
      },
      instanceId: "weapon",
      kind: "module",
      projection: moduleProjection
    }],
    ship: { instanceId: "ship", projection: shipProjection },
    skills: [{ activeLevel: 5, instanceId: "skill:37796", projection: specialSkill }]
  });
  const result = evaluateDogmaAttributes({
    attributeDefinitions: new Map([[114, damageAttribute], [200, bonusAttribute]]),
    effectDefinitions: new Map([[6396, specialEffect]]),
    graph,
    targets: [{ attributeId: 114, instanceId: "ordinary-charge" }]
  });

  assert.equal(result.results.get("ordinary-charge:114")?.effective, 10);
  assert.equal(result.diagnostics.length, 0);
});

test("dependency ordering is deterministic", () => {
  const dependencies = [
    { sourceAttributeId: 2, sourceInstanceId: "a", targetAttributeId: 3, targetInstanceId: "a" },
    { sourceAttributeId: 1, sourceInstanceId: "a", targetAttributeId: 2, targetInstanceId: "a" }
  ];
  assert.deepEqual(orderAttributeDependencies(dependencies).orderedKeys, ["a:1", "a:2", "a:3"]);
});

test("dependency cycles are diagnosed without arbitrary resolution", () => {
  const ordered = orderAttributeDependencies([
    { sourceAttributeId: 1, sourceInstanceId: "a", targetAttributeId: 2, targetInstanceId: "a" },
    { sourceAttributeId: 2, sourceInstanceId: "a", targetAttributeId: 1, targetInstanceId: "a" }
  ]);
  assert.equal(ordered.diagnostics[0]?.code, "attribute-dependency-cycle");
  assert.deepEqual(ordered.orderedKeys, []);
});

test("collected modifiers become attribute dependencies", () => {
  const collected = collectEffectModifiers({
    effect: genericEffect(modifier({ domain: "shipID" })),
    graph: makeGraph(),
    sourceInstanceId: "module-a"
  });
  assert.deepEqual(buildAttributeDependencies(collected.modifiers)[0], {
    sourceAttributeId: 202,
    sourceInstanceId: "module-a",
    targetAttributeId: 48,
    targetInstanceId: "ship"
  });
});

test("generic operations and canonical stage ordering are applied", () => {
  const values = [
    operation(DOGMA_OPERATIONS.POST_ASSIGNMENT, 99, 8),
    operation(DOGMA_OPERATIONS.POST_PERCENT, 10, 7),
    operation(DOGMA_OPERATIONS.POST_DIV, 2, 6),
    operation(DOGMA_OPERATIONS.POST_MUL, 3, 5),
    operation(DOGMA_OPERATIONS.MOD_SUB, 1, 4),
    operation(DOGMA_OPERATIONS.MOD_ADD, 5, 3),
    operation(DOGMA_OPERATIONS.PRE_DIV, 2, 2),
    operation(DOGMA_OPERATIONS.PRE_MUL, 4, 1),
    operation(DOGMA_OPERATIONS.PRE_ASSIGNMENT, 10, 0)
  ];
  const result = evaluateAttributeOperations({
    attributeId: 1,
    base: 20,
    modifiers: values
  });
  assert.equal(result.effective, 99);
  assert.deepEqual(result.modifiers.map((trace) => trace.operation), [-1, 0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(result.modifiers.length, 9);
});

test("zero and negative modifier values are preserved", () => {
  const result = evaluateAttributeOperations({
    attributeId: 1,
    base: 10,
    modifiers: [
      operation(DOGMA_OPERATIONS.MOD_ADD, 0, 1),
      operation(DOGMA_OPERATIONS.POST_PERCENT, -50, 2)
    ]
  });
  assert.equal(result.effective, 5);
});

test("division by zero and special operations are diagnostics", () => {
  const result = evaluateAttributeOperations({
    attributeId: 1,
    base: 10,
    modifiers: [
      operation(DOGMA_OPERATIONS.POST_DIV, 0, 1),
      operation(DOGMA_OPERATIONS.SKILL_POINTS, 5, 2)
    ]
  });
  assert.equal(result.effective, 10);
  assert.deepEqual(result.diagnostics.map((item) => item.code), [
    "dogma-division-by-zero",
    "special-operation-not-evaluated"
  ]);
});

test("modifier traces retain complete provenance", () => {
  const result = evaluateAttributeOperations({
    attributeId: 48,
    base: 100,
    modifiers: [{
      ...operation(DOGMA_OPERATIONS.POST_PERCENT, 8.6911998, 1),
      effectiveValue: 8.6911998,
      sourceTypeId: 3888,
      stackingFactor: 0.86911998,
      stackingPosition: 1
    }]
  });
  const trace = result.modifiers[0];
  assert.ok(trace);
  assert.ok(Math.abs(trace.after - 108.6911998) < 1e-12);
  assert.ok(Math.abs(trace.effectiveContribution - 8.6911998) < 1e-12);
  assert.deepEqual({ ...trace, after: 0, effectiveContribution: 0 }, {
    after: 0,
    before: 100,
    effectId: 1001,
    effectiveContribution: 0,
    effectiveMultiplier: null,
    effectiveValue: 8.6911998,
    modifyingAttributeId: 202,
    operation: 6,
    ordinal: 1,
    rawValue: 8.6911998,
    rawMultiplier: null,
    sourceInstanceId: "source-1",
    sourceTypeId: 3888,
    stackingFactor: 0.86911998,
    stackingPosition: 1
  });
});

test("stacking penalty factors match the audited curve", () => {
  assert.equal(stackingPenaltyFactor(0), 1);
  assert.ok(Math.abs(stackingPenaltyFactor(1) - 0.86911998) < 1e-8);
  assert.ok(Math.abs(stackingPenaltyFactor(3) - 0.28295515) < 1e-8);
});

test("stacking orders positive and negative chains independently by magnitude", () => {
  const result = applyStackingPenalty({
    candidates: [
      candidate("positive-weak", 10),
      candidate("negative-weak", -10),
      candidate("positive-strong", 20),
      candidate("negative-strong", -20)
    ],
    targetAttribute: attributeDefinition
  });
  const byId = new Map(result.modifiers.map((item) => [item.candidate.sourceInstanceId, item]));
  assert.equal(byId.get("positive-strong")?.position, 0);
  assert.equal(byId.get("positive-weak")?.position, 1);
  assert.equal(byId.get("negative-strong")?.position, 0);
  assert.equal(byId.get("negative-weak")?.position, 1);
});

test("equal magnitude stacking order is deterministic and later modifiers contribute", () => {
  const result = applyStackingPenalty({
    candidates: [candidate("b", 10), candidate("a", 10), candidate("c", 10), candidate("d", 10), candidate("e", 10)],
    targetAttribute: attributeDefinition
  });
  const ordered = [...result.modifiers]
    .filter((item) => item.position !== null)
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  assert.deepEqual(ordered.map((item) => item.candidate.sourceInstanceId), ["a", "b", "c", "d", "e"]);
  assert.ok((ordered[4]?.effectiveMultiplier ?? 1) > 1);
});

test("different operation stages use independent stacking chains", () => {
  const result = applyStackingPenalty({
    candidates: [
      candidate("percent", 10),
      {
        ...candidate("pre-multiply", 1.1),
        operation: DOGMA_OPERATIONS.PRE_MUL
      }
    ],
    targetAttribute: attributeDefinition
  });
  assert.deepEqual(
    result.modifiers.map((item) => item.position),
    [0, 0]
  );
});

test("exempt sources are unpenalized", () => {
  const result = applyStackingPenalty({
    candidates: [{ ...candidate("skill", 10), sourceCategoryId: 16 }],
    targetAttribute: attributeDefinition
  });
  assert.equal(result.modifiers[0]?.penaltyFactor, 1);
  assert.equal(result.modifiers[0]?.position, null);
});

test("unknown source category emits uncertain eligibility diagnostic", () => {
  const result = applyStackingPenalty({
    candidates: [{ ...candidate("unknown", 10), sourceCategoryId: null }],
    targetAttribute: attributeDefinition
  });
  assert.equal(result.modifiers[0]?.effectiveValue, null);
  assert.equal(result.diagnostics[0]?.code, "uncertain-stacking-eligibility");
});

function makeGraph() {
  return buildDogmaObjectGraph({
    cargo: [{ instanceId: "charge-cargo", projection: chargeProjection }],
    character: { instanceId: "character", projection: skillProjection },
    modules: [
      {
        charge: { instanceId: "charge-loaded", projection: chargeProjection },
        instanceId: "module-a",
        kind: "module",
        projection: moduleProjection
      },
      { instanceId: "module-b", kind: "module", projection: moduleProjection }
    ],
    ship: { instanceId: "ship", projection: shipProjection }
  });
}

function projection(
  typeId: number,
  groupId: number,
  categoryId: number,
  attributes: DogmaTypeProjection["attributes"] = [],
  requiredSkillTypeIds: readonly number[] = []
): DogmaTypeProjection {
  return { attributes, categoryId, effects: [], groupId, requiredSkillTypeIds, typeId };
}

function modifier(
  overrides: Partial<DogmaModifierDefinition> = {}
): DogmaModifierDefinition {
  return {
    domain: "itemID",
    effectId: 1001,
    functionName: "ItemModifier",
    groupId: null,
    modifiedAttributeId: 48,
    modifyingAttributeId: 202,
    operation: DOGMA_OPERATIONS.POST_MUL,
    ordinal: 1,
    skillTypeId: null,
    ...overrides
  };
}

function genericEffect(modifierDefinition: DogmaModifierDefinition): DogmaEffectDefinition {
  return {
    capability: "generic-modifier",
    categoryId: 4,
    dischargeAttributeId: null,
    durationAttributeId: null,
    effectId: modifierDefinition.effectId,
    modifiers: [modifierDefinition],
    name: "testEffect"
  };
}

function operation(operationId: number, rawValue: number, ordinal: number) {
  return {
    effectId: 1001,
    modifyingAttributeId: 202,
    operation: operationId,
    ordinal,
    rawValue,
    sourceInstanceId: `source-${ordinal}`,
    sourceTypeId: 2
  };
}

function candidate(instanceId: string, rawValue: number) {
  return {
    effectId: 1001,
    operation: DOGMA_OPERATIONS.POST_PERCENT,
    ordinal: 1,
    rawValue,
    sourceCategoryId: 7,
    sourceInstanceId: instanceId,
    sourceKind: "module" as const
  };
}
