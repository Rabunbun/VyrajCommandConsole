import { createHash } from "node:crypto";
import {
  DOGMA_PROJECTION_VERSION,
  GENERIC_DOGMA_OPERATIONS,
  RECOGNIZED_DOGMA_DOMAINS,
  RECOGNIZED_DOGMA_FUNCTIONS,
  SPECIAL_DOGMA_OPERATIONS,
  classifyDogmaEffect,
  type DogmaAttributeDefinition,
  type DogmaEffectDefinition,
  type DogmaEffectCapability,
  type DogmaModifierDefinition,
  type DogmaTypeProjection
} from "../../src/lib/fitting/dogma";
import {
  extractDirectSkillRequirements,
  SKILL_CATEGORY_ID,
  type SdeTypeDogmaAttribute
} from "./fitting-skill-requirements";

export type SdeDogmaCategory = Readonly<{
  _key: number;
  name?: { en?: string };
  published?: boolean;
}>;

export type SdeDogmaGroup = Readonly<{
  _key: number;
  categoryID: number;
  name?: { en?: string };
  published?: boolean;
}>;

export type SdeDogmaType = Readonly<{
  _key: number;
  groupID: number;
  name?: { en?: string };
  published?: boolean;
}>;

export type SdeDogmaAttribute = Readonly<{
  _key: number;
  defaultValue?: number;
  highIsGood?: boolean;
  maxAttributeID?: number;
  minAttributeID?: number;
  name?: string;
  stackable?: boolean;
  unitID?: number;
}>;

export type SdeDogmaUnit = Readonly<{
  _key: number;
  name?: string;
}>;

export type SdeDogmaModifier = Readonly<{
  domain?: string;
  func?: string;
  groupID?: number;
  modifiedAttributeID?: number;
  modifyingAttributeID?: number;
  operation?: number;
  skillTypeID?: number;
}>;

export type SdeDogmaEffect = Readonly<{
  _key: number;
  dischargeAttributeID?: number;
  durationAttributeID?: number;
  effectCategoryID: number;
  modifierInfo?: readonly SdeDogmaModifier[];
  name?: string;
}>;

export type SdeTypeDogma = Readonly<{
  _key: number;
  dogmaAttributes?: readonly SdeTypeDogmaAttribute[];
  dogmaEffects?: readonly Readonly<{
    effectID: number;
    isDefault?: boolean;
  }>[];
}>;

export type DogmaProjectionInput = Readonly<{
  attributes: ReadonlyMap<number, SdeDogmaAttribute>;
  categories: ReadonlyMap<number, SdeDogmaCategory>;
  effects: ReadonlyMap<number, SdeDogmaEffect>;
  groups: ReadonlyMap<number, SdeDogmaGroup>;
  rootTypeIds: ReadonlySet<number>;
  sdeBuild: string;
  typeDogma: ReadonlyMap<number, SdeTypeDogma>;
  types: ReadonlyMap<number, SdeDogmaType>;
  units: ReadonlyMap<number, SdeDogmaUnit>;
}>;

export type BuiltDogmaProjection = Readonly<{
  attributes: readonly DogmaAttributeDefinition[];
  checksum: string;
  effects: readonly DogmaEffectDefinition[];
  encountered: Readonly<{
    domains: readonly string[];
    functions: readonly string[];
    operationIds: readonly number[];
  }>;
  modifiers: readonly DogmaModifierDefinition[];
  projections: readonly Readonly<DogmaTypeProjection & { checksum: string }>[];
  report: Readonly<{
    attributeDefinitionCount: number;
    closureTypeCount: number;
    effectDefinitionCount: number;
    genericEffectCount: number;
    malformedReferenceCount: number;
    metadataEffectCount: number;
    modifierCount: number;
    projectedTypeCount: number;
    requiresSpecialHandlerCount: number;
    rootTypeCount: number;
    unknownEffectCount: number;
  }>;
  sdeBuild: string;
}>;

export function buildFittingDogmaProjection(
  input: DogmaProjectionInput
): BuiltDogmaProjection {
  if (!input.rootTypeIds.size) {
    throw new Error("Fitting Dogma projection has no root types.");
  }
  if (!input.sdeBuild.trim()) {
    throw new Error("Fitting Dogma projection requires an SDE build identifier.");
  }

  validateGroupHierarchy(input.groups, input.categories);
  const closureTypeIds = buildTypeClosure(input);
  const selectedEffects = new Set<number>();
  const selectedAttributes = new Set<number>();
  const projections: Array<DogmaTypeProjection & { checksum: string }> = [];

  for (const typeId of [...closureTypeIds].sort(compareNumbers)) {
    const type = requireRecord(input.types, typeId, "type");
    const group = requireRecord(input.groups, type.groupID, "group");
    requireRecord(input.categories, group.categoryID, "category");
    const dogma = requireRecord(input.typeDogma, typeId, "typeDogma");
    const attributes = normalizeTypeAttributes(typeId, dogma.dogmaAttributes);
    const effects = normalizeTypeEffects(typeId, dogma.dogmaEffects);
    attributes.forEach((attribute) => selectedAttributes.add(attribute.attributeId));
    effects.forEach((effect) => selectedEffects.add(effect.effectId));
    const requiredSkillTypeIds = extractDirectSkillRequirements(
      typeId,
      dogma.dogmaAttributes
    )
      .map((requirement) => requirement.skillTypeId)
      .sort(compareNumbers);
    const projection: DogmaTypeProjection = {
      attributes,
      categoryId: group.categoryID,
      effects,
      groupId: type.groupID,
      requiredSkillTypeIds,
      typeId
    };
    projections.push({ ...projection, checksum: deterministicChecksum(projection) });
  }

  const modifiers: DogmaModifierDefinition[] = [];
  const effectDefinitions: DogmaEffectDefinition[] = [];
  const operationIds = new Set<number>();
  const domains = new Set<string>();
  const functions = new Set<string>();
  for (const effectId of [...selectedEffects].sort(compareNumbers)) {
    const effect = requireRecord(input.effects, effectId, "effect");
    const normalizedModifiers = normalizeModifiers(effect);
    validateEffectSemantics(normalizedModifiers);
    normalizedModifiers.forEach((modifier) => {
      modifiers.push(modifier);
      if (modifier.operation !== null) operationIds.add(modifier.operation);
      if (modifier.domain !== null) domains.add(modifier.domain);
      functions.add(modifier.functionName);
      if (modifier.modifiedAttributeId !== null) {
        selectedAttributes.add(modifier.modifiedAttributeId);
      }
      if (modifier.modifyingAttributeId !== null) {
        selectedAttributes.add(modifier.modifyingAttributeId);
      }
      if (modifier.groupId !== null) {
        requireRecord(input.groups, modifier.groupId, "modifier group filter");
      }
      if (modifier.skillTypeId !== null) {
        validateSkillType(input, modifier.skillTypeId);
      }
    });
    addOptionalAttribute(selectedAttributes, effect.durationAttributeID);
    addOptionalAttribute(selectedAttributes, effect.dischargeAttributeID);
    const definition: DogmaEffectDefinition = {
      capability: classifyDogmaEffect({
        categoryId: effect.effectCategoryID,
        effectId,
        modifiers: normalizedModifiers
      }),
      categoryId: effect.effectCategoryID,
      dischargeAttributeId: effect.dischargeAttributeID ?? null,
      durationAttributeId: effect.durationAttributeID ?? null,
      effectId,
      modifiers: normalizedModifiers,
      name: requireName(effect.name, `effect ${effectId}`)
    };
    if (definition.capability === "unsupported-unknown") {
      throw new Error(
        `Effect ${effectId}/${definition.name} has unsupported or unknown fitting semantics.`
      );
    }
    effectDefinitions.push(definition);
  }

  expandAttributeReferences(selectedAttributes, input.attributes);
  const attributeDefinitions = [...selectedAttributes]
    .sort(compareNumbers)
    .map((attributeId) => normalizeAttributeDefinition(input, attributeId));

  const sortedModifiers = [...modifiers].sort(compareModifiers);
  const sortedEffects = [...effectDefinitions].sort(
    (left, right) => left.effectId - right.effectId
  );
  const capabilityCounts = countCapabilities(sortedEffects);
  const checksum = deterministicChecksum({
    attributes: attributeDefinitions,
    effects: sortedEffects,
    projectionVersion: DOGMA_PROJECTION_VERSION,
    projections,
    sdeBuild: input.sdeBuild
  });

  return {
    attributes: attributeDefinitions,
    checksum,
    effects: sortedEffects,
    encountered: {
      domains: [...domains].sort(),
      functions: [...functions].sort(),
      operationIds: [...operationIds].sort(compareNumbers)
    },
    modifiers: sortedModifiers,
    projections,
    report: {
      attributeDefinitionCount: attributeDefinitions.length,
      closureTypeCount: closureTypeIds.size,
      effectDefinitionCount: sortedEffects.length,
      genericEffectCount: capabilityCounts["generic-modifier"],
      malformedReferenceCount: 0,
      metadataEffectCount: capabilityCounts["metadata-nonexecuting"],
      modifierCount: sortedModifiers.length,
      projectedTypeCount: projections.length,
      requiresSpecialHandlerCount:
        capabilityCounts["requires-special-handler"],
      rootTypeCount: input.rootTypeIds.size,
      unknownEffectCount: capabilityCounts["unsupported-unknown"]
    },
    sdeBuild: input.sdeBuild
  };
}

export function deterministicChecksum(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function planDogmaSynchronization(
  existingIds: readonly number[],
  incomingIds: readonly number[]
) {
  const incoming = new Set(incomingIds);
  return {
    staleIds: [...new Set(existingIds)]
      .filter((id) => !incoming.has(id))
      .sort(compareNumbers),
    upsertIds: [...new Set(incomingIds)].sort(compareNumbers)
  };
}

function buildTypeClosure(input: DogmaProjectionInput) {
  const closure = new Set(input.rootTypeIds);
  const queue = [...closure].sort(compareNumbers);
  while (queue.length) {
    const typeId = queue.shift() as number;
    requireRecord(input.types, typeId, "type");
    const dogma = requireRecord(input.typeDogma, typeId, "typeDogma");
    for (const effectReference of dogma.dogmaEffects ?? []) {
      const effect = requireRecord(input.effects, effectReference.effectID, "effect");
      for (const modifier of effect.modifierInfo ?? []) {
        if (modifier.skillTypeID !== undefined && !closure.has(modifier.skillTypeID)) {
          validateSkillType(input, modifier.skillTypeID);
          closure.add(modifier.skillTypeID);
          queue.push(modifier.skillTypeID);
          queue.sort(compareNumbers);
        }
      }
    }
  }
  return closure;
}

function normalizeTypeAttributes(
  typeId: number,
  attributes: readonly SdeTypeDogmaAttribute[] | undefined
) {
  const seen = new Set<number>();
  return [...(attributes ?? [])]
    .map((attribute) => {
      if (seen.has(attribute.attributeID)) {
        throw new Error(`Type ${typeId} repeats Dogma attribute ${attribute.attributeID}.`);
      }
      if (!Number.isFinite(attribute.value)) {
        throw new Error(`Type ${typeId} has a non-finite Dogma attribute value.`);
      }
      seen.add(attribute.attributeID);
      return { attributeId: attribute.attributeID, value: attribute.value };
    })
    .sort((left, right) => left.attributeId - right.attributeId);
}

function normalizeTypeEffects(
  typeId: number,
  effects: SdeTypeDogma["dogmaEffects"]
) {
  const seen = new Set<number>();
  return [...(effects ?? [])]
    .map((effect) => {
      if (seen.has(effect.effectID)) {
        throw new Error(`Type ${typeId} repeats Dogma effect ${effect.effectID}.`);
      }
      seen.add(effect.effectID);
      return { effectId: effect.effectID, isDefault: effect.isDefault === true };
    })
    .sort((left, right) => left.effectId - right.effectId);
}

function normalizeModifiers(effect: SdeDogmaEffect): DogmaModifierDefinition[] {
  return [...(effect.modifierInfo ?? [])].map((modifier, index) => ({
    domain: modifier.domain ?? null,
    effectId: effect._key,
    functionName: requireName(modifier.func, `effect ${effect._key} modifier ${index + 1} function`),
    groupId: modifier.groupID ?? null,
    modifiedAttributeId: modifier.modifiedAttributeID ?? null,
    modifyingAttributeId: modifier.modifyingAttributeID ?? null,
    operation: modifier.operation ?? null,
    ordinal: index + 1,
    skillTypeId: modifier.skillTypeID ?? null
  }));
}

function validateEffectSemantics(modifiers: readonly DogmaModifierDefinition[]) {
  for (const modifier of modifiers) {
    if (!RECOGNIZED_DOGMA_FUNCTIONS.has(modifier.functionName)) {
      throw new Error(`Unknown Dogma modifier function ${modifier.functionName}.`);
    }
    if (
      modifier.domain !== null &&
      !RECOGNIZED_DOGMA_DOMAINS.has(modifier.domain)
    ) {
      throw new Error(`Unknown Dogma modifier domain ${modifier.domain}.`);
    }
    if (
      modifier.operation !== null &&
      !GENERIC_DOGMA_OPERATIONS.has(modifier.operation) &&
      !SPECIAL_DOGMA_OPERATIONS.has(modifier.operation)
    ) {
      throw new Error(`Unknown Dogma modifier operation ${modifier.operation}.`);
    }
    if (
      modifier.functionName !== "EffectStopper" &&
      (modifier.domain === null ||
        modifier.operation === null ||
        modifier.modifiedAttributeId === null ||
        modifier.modifyingAttributeId === null)
    ) {
      throw new Error(
        `Malformed Dogma modifier ${modifier.effectId}/${modifier.ordinal}.`
      );
    }
  }
}

function normalizeAttributeDefinition(
  input: DogmaProjectionInput,
  attributeId: number
): DogmaAttributeDefinition {
  const attribute = requireRecord(input.attributes, attributeId, "attribute");
  if (attribute.unitID !== undefined) {
    requireRecord(input.units, attribute.unitID, "Dogma unit");
  }
  return {
    attributeId,
    defaultValue: attribute.defaultValue ?? null,
    highIsGood: attribute.highIsGood ?? null,
    maxAttributeId: attribute.maxAttributeID ?? null,
    minAttributeId: attribute.minAttributeID ?? null,
    name: requireName(attribute.name, `attribute ${attributeId}`),
    stackable: attribute.stackable ?? true,
    unitId: attribute.unitID ?? null
  };
}

function expandAttributeReferences(
  selected: Set<number>,
  attributes: ReadonlyMap<number, SdeDogmaAttribute>
) {
  const queue = [...selected];
  while (queue.length) {
    const attributeId = queue.shift() as number;
    const attribute = requireRecord(attributes, attributeId, "attribute");
    for (const referencedId of [attribute.minAttributeID, attribute.maxAttributeID]) {
      if (referencedId !== undefined && !selected.has(referencedId)) {
        selected.add(referencedId);
        queue.push(referencedId);
      }
    }
  }
}

function validateGroupHierarchy(
  groups: ReadonlyMap<number, SdeDogmaGroup>,
  categories: ReadonlyMap<number, SdeDogmaCategory>
) {
  if (!groups.size || !categories.size) {
    throw new Error("CCP SDE category/group hierarchy is empty.");
  }
  for (const group of groups.values()) {
    requireRecord(categories, group.categoryID, `category for group ${group._key}`);
  }
}

function validateSkillType(input: DogmaProjectionInput, typeId: number) {
  const type = requireRecord(input.types, typeId, "skill filter type");
  const group = requireRecord(input.groups, type.groupID, "skill filter group");
  if (group.categoryID !== SKILL_CATEGORY_ID || type.published !== true) {
    throw new Error(
      `Modifier skill filter ${typeId} is not an authoritative published Category ${SKILL_CATEGORY_ID} skill.`
    );
  }
  requireRecord(input.typeDogma, typeId, "skill filter typeDogma");
}

function countCapabilities(effects: readonly DogmaEffectDefinition[]) {
  const counts: Record<DogmaEffectCapability, number> = {
    "generic-modifier": 0,
    "metadata-nonexecuting": 0,
    "requires-special-handler": 0,
    "unsupported-unknown": 0
  };
  effects.forEach((effect) => counts[effect.capability]++);
  return counts;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function compareModifiers(left: DogmaModifierDefinition, right: DogmaModifierDefinition) {
  return left.effectId - right.effectId || left.ordinal - right.ordinal;
}

function compareNumbers(left: number, right: number) {
  return left - right;
}

function addOptionalAttribute(selected: Set<number>, value: number | undefined) {
  if (value !== undefined) selected.add(value);
}

function requireRecord<T>(
  records: ReadonlyMap<number, T>,
  id: number,
  label: string
) {
  const record = records.get(id);
  if (!record) throw new Error(`Missing ${label} ${id}.`);
  return record;
}

function requireName(value: string | undefined, label: string) {
  if (!value?.trim()) throw new Error(`Missing ${label} name.`);
  return value;
}
