import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFittingDogmaProjection,
  deterministicChecksum,
  planDogmaSynchronization,
  type DogmaProjectionInput,
  type SdeDogmaEffect
} from "./fitting-dogma-projection";

test("projection builds a fitting root plus modifier skill closure", () => {
  const built = buildFittingDogmaProjection(fixture());
  assert.equal(built.report.rootTypeCount, 2);
  assert.equal(built.report.closureTypeCount, 3);
  assert.equal(built.report.projectedTypeCount, 3);
  assert.equal(built.report.genericEffectCount, 1);
  assert.equal(built.report.metadataEffectCount, 1);
  assert.equal(built.report.requiresSpecialHandlerCount, 1);
  assert.equal(built.report.unknownEffectCount, 0);
  assert.deepEqual(built.encountered.operationIds, [4, 9]);
  assert.deepEqual(built.encountered.domains, ["itemID", "shipID"]);
  assert.deepEqual(built.projections.find((item) => item.typeId === 2)?.requiredSkillTypeIds, [3]);
});

test("projection checksum is deterministic across map insertion order", () => {
  const first = fixture();
  const second = fixture();
  second.types = new Map([...second.types].reverse());
  second.effects = new Map([...second.effects].reverse());
  assert.equal(
    buildFittingDogmaProjection(first).checksum,
    buildFittingDogmaProjection(second).checksum
  );
  assert.equal(deterministicChecksum({ b: 2, a: 1 }), deterministicChecksum({ a: 1, b: 2 }));
});

test("synchronization planning is deterministic and idempotent", () => {
  assert.deepEqual(planDogmaSynchronization([3, 2, 1], [2, 3, 4, 4]), {
    staleIds: [1],
    upsertIds: [2, 3, 4]
  });
  assert.deepEqual(planDogmaSynchronization([2, 3, 4], [2, 3, 4]), {
    staleIds: [],
    upsertIds: [2, 3, 4]
  });
});

for (const operation of [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  test(`known operation ${operation} is accepted`, () => {
    const input = fixture();
    input.effects.set(100, effectWith({ operation }));
    const built = buildFittingDogmaProjection(input);
    assert.ok(built.encountered.operationIds.includes(operation));
  });
}

test("unknown operation is rejected", () => {
  const input = fixture();
  input.effects.set(100, effectWith({ operation: 999 }));
  assert.throws(() => buildFittingDogmaProjection(input), /Unknown Dogma modifier operation 999/);
});

test("unknown domain is rejected", () => {
  const input = fixture();
  input.effects.set(100, effectWith({ domain: "futureDomain" }));
  assert.throws(() => buildFittingDogmaProjection(input), /Unknown Dogma modifier domain/);
});

test("unknown function is rejected", () => {
  const input = fixture();
  input.effects.set(100, effectWith({ func: "FutureModifier" }));
  assert.throws(() => buildFittingDogmaProjection(input), /Unknown Dogma modifier function/);
});

test("bad type attribute reference is rejected", () => {
  const input = fixture();
  const dogma = input.typeDogma.get(1)!;
  input.typeDogma.set(1, {
    ...dogma,
    dogmaAttributes: [
      ...(dogma.dogmaAttributes ?? []),
      { attributeID: 999, value: 1 }
    ]
  });
  assert.throws(() => buildFittingDogmaProjection(input), /Missing attribute 999/);
});

test("bad effect reference is rejected", () => {
  const input = fixture();
  input.typeDogma.set(1, { _key: 1, dogmaEffects: [{ effectID: 999 }] });
  assert.throws(() => buildFittingDogmaProjection(input), /Missing effect 999/);
});

test("bad skill filter is rejected", () => {
  const input = fixture();
  input.types.set(3, { ...input.types.get(3)!, published: false });
  assert.throws(() => buildFittingDogmaProjection(input), /not an authoritative published/);
});

test("bad modifier attribute reference is rejected", () => {
  const input = fixture();
  input.effects.set(100, effectWith({ modifiedAttributeID: 999 }));
  assert.throws(() => buildFittingDogmaProjection(input), /Missing attribute 999/);
});

test("malformed generic modifier is rejected", () => {
  const input = fixture();
  input.effects.set(100, effectWith({ modifyingAttributeID: undefined }));
  assert.throws(() => buildFittingDogmaProjection(input), /Malformed Dogma modifier/);
});

test("bad group filter is rejected", () => {
  const input = fixture();
  input.effects.set(100, effectWith({ groupID: 999 }));
  assert.throws(() => buildFittingDogmaProjection(input), /Missing modifier group filter 999/);
});

test("bad unit reference is rejected", () => {
  const input = fixture();
  input.attributes.set(1, { ...input.attributes.get(1)!, unitID: 999 });
  assert.throws(() => buildFittingDogmaProjection(input), /Missing Dogma unit 999/);
});

function fixture(): MutableProjectionInput {
  return {
    attributes: new Map([
      [1, { _key: 1, defaultValue: 0, name: "target", stackable: false }],
      [2, { _key: 2, defaultValue: 1, name: "source", stackable: true }],
      [182, { _key: 182, defaultValue: 0, name: "requiredSkill1" }],
      [277, { _key: 277, defaultValue: 0, name: "requiredSkill1Level" }],
      [280, { _key: 280, defaultValue: 0, name: "skillLevel" }],
      [275, { _key: 275, defaultValue: 0, name: "skillLevelConstant" }]
    ]),
    categories: new Map([
      [6, { _key: 6, name: { en: "Ship" }, published: true }],
      [7, { _key: 7, name: { en: "Module" }, published: true }],
      [16, { _key: 16, name: { en: "Skill" }, published: true }]
    ]),
    effects: new Map([
      [12, { _key: 12, effectCategoryID: 0, name: "hiPower" }],
      [100, effectWith({})],
      [200, {
        _key: 200,
        effectCategoryID: 0,
        modifierInfo: [{
          domain: "itemID",
          func: "ItemModifier",
          modifiedAttributeID: 280,
          modifyingAttributeID: 275,
          operation: 9
        }],
        name: "skillEffect"
      }]
    ]),
    groups: new Map([
      [10, { _key: 10, categoryID: 6, name: { en: "Cruiser" }, published: true }],
      [11, { _key: 11, categoryID: 7, name: { en: "Module" }, published: true }],
      [12, { _key: 12, categoryID: 16, name: { en: "Skill" }, published: true }]
    ]),
    rootTypeIds: new Set([1, 2]),
    sdeBuild: "fixture-1",
    typeDogma: new Map([
      [1, { _key: 1, dogmaAttributes: [{ attributeID: 1, value: 100 }], dogmaEffects: [{ effectID: 100 }] }],
      [2, {
        _key: 2,
        dogmaAttributes: [
          { attributeID: 2, value: 1.1 },
          { attributeID: 182, value: 3 },
          { attributeID: 277, value: 1 }
        ],
        dogmaEffects: [{ effectID: 12 }]
      }],
      [3, {
        _key: 3,
        dogmaAttributes: [
          { attributeID: 275, value: 1 },
          { attributeID: 280, value: 0 }
        ],
        dogmaEffects: [{ effectID: 200 }]
      }]
    ]),
    types: new Map([
      [1, { _key: 1, groupID: 10, name: { en: "Test Ship" }, published: true }],
      [2, { _key: 2, groupID: 11, name: { en: "Test Module" }, published: true }],
      [3, { _key: 3, groupID: 12, name: { en: "Test Skill" }, published: true }]
    ]),
    units: new Map()
  };
}

type MutableProjectionInput = {
  -readonly [Key in keyof DogmaProjectionInput]: DogmaProjectionInput[Key] extends ReadonlyMap<infer K, infer V>
    ? Map<K, V>
    : DogmaProjectionInput[Key];
};

function effectWith(
  overrides: Partial<NonNullable<SdeDogmaEffect["modifierInfo"]>[number]>
): SdeDogmaEffect {
  return {
    _key: 100,
    effectCategoryID: 0,
    modifierInfo: [{
      domain: "shipID",
      func: "LocationRequiredSkillModifier",
      modifiedAttributeID: 1,
      modifyingAttributeID: 2,
      operation: 4,
      skillTypeID: 3,
      ...overrides
    }],
    name: "testShipBonus"
  };
}
