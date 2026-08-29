import assert from "node:assert/strict";
import test from "node:test";

import {
  extractDirectSkillRequirements,
  SKILL_REQUIREMENT_ATTRIBUTE_PAIRS,
  TYPE_ID_DOGMA_UNIT,
  validateSkillRequirementDogmaDefinitions,
  type SdeDogmaAttributeDefinition,
  type SdeDogmaUnitDefinition
} from "./fitting-skill-requirements";

test("extracts all six direct requirement positions in ordinal order", () => {
  const attributes = SKILL_REQUIREMENT_ATTRIBUTE_PAIRS.flatMap((pair) => [
    { attributeID: pair.skill.id, value: 30_000 + pair.ordinal },
    { attributeID: pair.level.id, value: pair.ordinal > 5 ? 5 : pair.ordinal }
  ]);

  assert.deepEqual(extractDirectSkillRequirements(100, attributes), [
    { ordinal: 1, requiredLevel: 1, skillTypeId: 30_001 },
    { ordinal: 2, requiredLevel: 2, skillTypeId: 30_002 },
    { ordinal: 3, requiredLevel: 3, skillTypeId: 30_003 },
    { ordinal: 4, requiredLevel: 4, skillTypeId: 30_004 },
    { ordinal: 5, requiredLevel: 5, skillTypeId: 30_005 },
    { ordinal: 6, requiredLevel: 5, skillTypeId: 30_006 }
  ]);
});

test("omits absent requirement pairs and explicit skill zero", () => {
  assert.deepEqual(extractDirectSkillRequirements(100, undefined), []);
  assert.deepEqual(
    extractDirectSkillRequirements(100, [
      { attributeID: 182, value: 0 },
      { attributeID: 277, value: 5 }
    ]),
    []
  );
});

test("rejects a positive skill with a missing or invalid level", () => {
  assert.throws(
    () =>
      extractDirectSkillRequirements(100, [
        { attributeID: 182, value: 3300 }
      ]),
    /requiredSkill1Level is missing/
  );
  assert.throws(
    () =>
      extractDirectSkillRequirements(100, [
        { attributeID: 182, value: 3300 },
        { attributeID: 277, value: 0 }
      ]),
    /instead of an integer from 1 through 5/
  );
  assert.throws(
    () =>
      extractDirectSkillRequirements(100, [
        { attributeID: 182, value: 3300 },
        { attributeID: 277, value: 6 }
      ]),
    /instead of an integer from 1 through 5/
  );
});

test("preserves source ordinals without recursively expanding skill prerequisites", () => {
  const result = extractDirectSkillRequirements(100, [
    { attributeID: 184, value: 3436 },
    { attributeID: 279, value: 4 }
  ]);

  assert.deepEqual(result, [
    { ordinal: 3, requiredLevel: 4, skillTypeId: 3436 }
  ]);
});

test("validates all canonical attribute names, defaults, and units", () => {
  const attributes = new Map<number, SdeDogmaAttributeDefinition>();

  for (const pair of SKILL_REQUIREMENT_ATTRIBUTE_PAIRS) {
    attributes.set(pair.skill.id, {
      _key: pair.skill.id,
      defaultValue: 0,
      name: pair.skill.name,
      unitID: TYPE_ID_DOGMA_UNIT.id
    });
    attributes.set(pair.level.id, {
      _key: pair.level.id,
      defaultValue: 0,
      name: pair.level.name
    });
  }

  const units = new Map<number, SdeDogmaUnitDefinition>([
    [
      TYPE_ID_DOGMA_UNIT.id,
      { _key: TYPE_ID_DOGMA_UNIT.id, name: TYPE_ID_DOGMA_UNIT.name }
    ]
  ]);

  assert.doesNotThrow(() =>
    validateSkillRequirementDogmaDefinitions(attributes, units)
  );

  attributes.set(182, {
    _key: 182,
    defaultValue: 0,
    name: "renamedRequiredSkill",
    unitID: TYPE_ID_DOGMA_UNIT.id
  });
  assert.throws(
    () => validateSkillRequirementDogmaDefinitions(attributes, units),
    /expected to be requiredSkill1/
  );
});
