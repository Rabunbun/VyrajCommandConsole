export const SKILL_CATEGORY_ID = 16;
export const TYPE_ID_DOGMA_UNIT = {
  id: 116,
  name: "typeID"
} as const;

export const SKILL_REQUIREMENT_ATTRIBUTE_PAIRS = [
  {
    level: { id: 277, name: "requiredSkill1Level" },
    ordinal: 1,
    skill: { id: 182, name: "requiredSkill1" }
  },
  {
    level: { id: 278, name: "requiredSkill2Level" },
    ordinal: 2,
    skill: { id: 183, name: "requiredSkill2" }
  },
  {
    level: { id: 279, name: "requiredSkill3Level" },
    ordinal: 3,
    skill: { id: 184, name: "requiredSkill3" }
  },
  {
    level: { id: 1286, name: "requiredSkill4Level" },
    ordinal: 4,
    skill: { id: 1285, name: "requiredSkill4" }
  },
  {
    level: { id: 1287, name: "requiredSkill5Level" },
    ordinal: 5,
    skill: { id: 1289, name: "requiredSkill5" }
  },
  {
    level: { id: 1288, name: "requiredSkill6Level" },
    ordinal: 6,
    skill: { id: 1290, name: "requiredSkill6" }
  }
] as const;

export type SkillRequirementOrdinal =
  (typeof SKILL_REQUIREMENT_ATTRIBUTE_PAIRS)[number]["ordinal"];

export type SdeDogmaAttributeDefinition = {
  _key: number;
  defaultValue?: number;
  name?: string;
  unitID?: number;
};

export type SdeDogmaUnitDefinition = {
  _key: number;
  name?: string;
};

export type SdeTypeDogmaAttribute = {
  attributeID: number;
  value: number;
};

export type ExtractedSkillRequirement = {
  ordinal: SkillRequirementOrdinal;
  requiredLevel: number;
  skillTypeId: number;
};

export function validateSkillRequirementDogmaDefinitions(
  attributes: ReadonlyMap<number, SdeDogmaAttributeDefinition>,
  units: ReadonlyMap<number, SdeDogmaUnitDefinition>
) {
  const typeIdUnit = units.get(TYPE_ID_DOGMA_UNIT.id);

  if (typeIdUnit?.name !== TYPE_ID_DOGMA_UNIT.name) {
    throw new Error(
      `Dogma unit ${TYPE_ID_DOGMA_UNIT.id} was expected to be ${TYPE_ID_DOGMA_UNIT.name}, but SDE reported ${typeIdUnit?.name || "missing"}.`
    );
  }

  for (const pair of SKILL_REQUIREMENT_ATTRIBUTE_PAIRS) {
    validateAttributeDefinition(
      attributes.get(pair.skill.id),
      pair.skill.id,
      pair.skill.name,
      TYPE_ID_DOGMA_UNIT.id
    );
    validateAttributeDefinition(
      attributes.get(pair.level.id),
      pair.level.id,
      pair.level.name,
      null
    );
  }
}

export function extractDirectSkillRequirements(
  typeId: number,
  attributes: readonly SdeTypeDogmaAttribute[] | undefined
): ExtractedSkillRequirement[] {
  const values = new Map<number, number>();
  const relevantAttributeIds = new Set<number>(
    SKILL_REQUIREMENT_ATTRIBUTE_PAIRS.flatMap((pair) => [
      pair.skill.id,
      pair.level.id
    ])
  );

  for (const attribute of attributes || []) {
    if (!relevantAttributeIds.has(attribute.attributeID)) {
      continue;
    }

    if (values.has(attribute.attributeID)) {
      throw new Error(
        `Type ${typeId} repeats Dogma attribute ${attribute.attributeID}.`
      );
    }

    values.set(attribute.attributeID, attribute.value);
  }

  const requirements: ExtractedSkillRequirement[] = [];

  for (const pair of SKILL_REQUIREMENT_ATTRIBUTE_PAIRS) {
    const skillTypeId = values.get(pair.skill.id);

    if (skillTypeId === undefined || skillTypeId === 0) {
      continue;
    }

    if (!Number.isSafeInteger(skillTypeId) || skillTypeId < 1) {
      throw new Error(
        `Type ${typeId} has invalid ${pair.skill.name} value ${formatValue(skillTypeId)}.`
      );
    }

    const requiredLevel = values.get(pair.level.id);

    if (
      requiredLevel === undefined ||
      !Number.isSafeInteger(requiredLevel) ||
      requiredLevel < 1 ||
      requiredLevel > 5
    ) {
      throw new Error(
        `Type ${typeId} has positive ${pair.skill.name} ${skillTypeId}, but ${pair.level.name} is ${formatValue(requiredLevel)} instead of an integer from 1 through 5.`
      );
    }

    requirements.push({
      ordinal: pair.ordinal,
      requiredLevel,
      skillTypeId
    });
  }

  return requirements;
}

function validateAttributeDefinition(
  actual: SdeDogmaAttributeDefinition | undefined,
  attributeId: number,
  expectedName: string,
  expectedUnitId: number | null
) {
  if (actual?.name !== expectedName) {
    throw new Error(
      `Dogma attribute ${attributeId} was expected to be ${expectedName}, but SDE reported ${actual?.name || "missing"}.`
    );
  }

  const actualUnitId = actual.unitID ?? null;

  if (actualUnitId !== expectedUnitId) {
    throw new Error(
      `Dogma attribute ${attributeId}/${expectedName} expected unit ${formatValue(expectedUnitId)}, but SDE reported ${formatValue(actualUnitId)}.`
    );
  }

  if (actual.defaultValue !== 0) {
    throw new Error(
      `Dogma attribute ${attributeId}/${expectedName} expected default 0, but SDE reported ${formatValue(actual.defaultValue)}.`
    );
  }
}

function formatValue(value: unknown) {
  return value === undefined ? "missing" : JSON.stringify(value);
}
