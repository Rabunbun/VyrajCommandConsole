import type {
  DogmaEffectCapability,
  DogmaModifierDefinition,
  EngineDiagnostic
} from "./types";

export const DOGMA_OPERATIONS = {
  PRE_ASSIGNMENT: -1,
  PRE_MUL: 0,
  PRE_DIV: 1,
  MOD_ADD: 2,
  MOD_SUB: 3,
  POST_MUL: 4,
  POST_DIV: 5,
  POST_PERCENT: 6,
  POST_ASSIGNMENT: 7,
  SKILL_TIME: 8,
  SKILL_POINTS: 9
} as const;

export type DogmaOperation = (typeof DOGMA_OPERATIONS)[keyof typeof DOGMA_OPERATIONS];

export const GENERIC_DOGMA_OPERATIONS = new Set<number>([
  DOGMA_OPERATIONS.PRE_ASSIGNMENT,
  DOGMA_OPERATIONS.PRE_MUL,
  DOGMA_OPERATIONS.PRE_DIV,
  DOGMA_OPERATIONS.MOD_ADD,
  DOGMA_OPERATIONS.MOD_SUB,
  DOGMA_OPERATIONS.POST_MUL,
  DOGMA_OPERATIONS.POST_DIV,
  DOGMA_OPERATIONS.POST_PERCENT,
  DOGMA_OPERATIONS.POST_ASSIGNMENT
]);

export const SPECIAL_DOGMA_OPERATIONS = new Set<number>([
  DOGMA_OPERATIONS.SKILL_TIME,
  DOGMA_OPERATIONS.SKILL_POINTS
]);

export const DOGMA_OPERATION_STAGE: Readonly<Record<number, number>> = {
  [-1]: 0,
  0: 1,
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  7: 8
};

export const RECOGNIZED_DOGMA_DOMAINS = new Set([
  "charID",
  "itemID",
  "otherID",
  "shipID",
  "structureID",
  "target",
  "targetID"
]);

export const RECOGNIZED_DOGMA_FUNCTIONS = new Set([
  "EffectStopper",
  "ItemModifier",
  "LocationGroupModifier",
  "LocationModifier",
  "LocationRequiredSkillModifier",
  "OwnerRequiredSkillModifier"
]);

export const METADATA_NONEXECUTING_EFFECT_IDS = new Set([
  11, // low slot marker
  12, // high slot marker
  13, // mid slot marker
  16, // online lifecycle marker
  40, // launcher hardpoint marker
  42, // turret hardpoint marker
  2663, // rig slot marker
  3772 // subsystem slot marker
]);

export const DOGMA_EFFECT_CATEGORIES = {
  PASSIVE: 0,
  ACTIVATION: 1,
  TARGET: 2,
  AREA: 3,
  ONLINE: 4,
  OVERLOAD: 5,
  DUNGEON: 6,
  SYSTEM: 7
} as const;

export function classifyDogmaEffect(input: {
  categoryId: number;
  effectId: number;
  modifiers: readonly DogmaModifierDefinition[];
}): DogmaEffectCapability {
  if (METADATA_NONEXECUTING_EFFECT_IDS.has(input.effectId)) {
    return "metadata-nonexecuting";
  }

  if (!input.modifiers.length) {
    return "requires-special-handler";
  }

  if (
    input.categoryId === DOGMA_EFFECT_CATEGORIES.ACTIVATION ||
    input.categoryId === DOGMA_EFFECT_CATEGORIES.TARGET ||
    input.categoryId === DOGMA_EFFECT_CATEGORIES.AREA ||
    input.categoryId === DOGMA_EFFECT_CATEGORIES.OVERLOAD ||
    input.categoryId === DOGMA_EFFECT_CATEGORIES.DUNGEON ||
    input.categoryId === DOGMA_EFFECT_CATEGORIES.SYSTEM
  ) {
    return "requires-special-handler";
  }

  if (
    input.modifiers.some(
      (modifier) =>
        modifier.functionName === "EffectStopper" ||
        modifier.domain === "structureID" ||
        modifier.domain === "target" ||
        modifier.domain === "targetID" ||
        modifier.operation === null ||
        SPECIAL_DOGMA_OPERATIONS.has(modifier.operation)
    )
  ) {
    return "requires-special-handler";
  }

  if (
    input.modifiers.every(
      (modifier) =>
        modifier.domain !== null &&
        RECOGNIZED_DOGMA_DOMAINS.has(modifier.domain) &&
        RECOGNIZED_DOGMA_FUNCTIONS.has(modifier.functionName) &&
        modifier.operation !== null &&
        GENERIC_DOGMA_OPERATIONS.has(modifier.operation) &&
        modifier.modifiedAttributeId !== null &&
        modifier.modifyingAttributeId !== null
    )
  ) {
    return "generic-modifier";
  }

  return "unsupported-unknown";
}

export function validateModifierSemantics(
  modifier: DogmaModifierDefinition
): EngineDiagnostic[] {
  const diagnostics: EngineDiagnostic[] = [];

  if (!RECOGNIZED_DOGMA_FUNCTIONS.has(modifier.functionName)) {
    diagnostics.push({
      code: "unknown-modifier-function",
      effectId: modifier.effectId,
      message: `Unknown Dogma modifier function ${modifier.functionName}.`,
      severity: "error"
    });
  }

  if (
    modifier.domain !== null &&
    !RECOGNIZED_DOGMA_DOMAINS.has(modifier.domain)
  ) {
    diagnostics.push({
      code: "unknown-modifier-domain",
      effectId: modifier.effectId,
      message: `Unknown Dogma modifier domain ${modifier.domain}.`,
      severity: "error"
    });
  }

  if (
    modifier.operation !== null &&
    !GENERIC_DOGMA_OPERATIONS.has(modifier.operation) &&
    !SPECIAL_DOGMA_OPERATIONS.has(modifier.operation)
  ) {
    diagnostics.push({
      code: "unknown-modifier-operation",
      effectId: modifier.effectId,
      message: `Unknown Dogma modifier operation ${modifier.operation}.`,
      severity: "error"
    });
  }

  return diagnostics;
}
