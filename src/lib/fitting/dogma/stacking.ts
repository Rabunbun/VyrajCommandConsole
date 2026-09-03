import { DOGMA_OPERATIONS } from "./semantics";
import type {
  DogmaAttributeDefinition,
  DogmaRuntimeObjectKind,
  EngineDiagnostic
} from "./types";

export const STACKING_PENALTY_DENOMINATOR = 7.1289;

const STACKING_OPERATIONS = new Set<number>([
  DOGMA_OPERATIONS.PRE_MUL,
  DOGMA_OPERATIONS.PRE_DIV,
  DOGMA_OPERATIONS.POST_MUL,
  DOGMA_OPERATIONS.POST_DIV,
  DOGMA_OPERATIONS.POST_PERCENT
]);

const EXEMPT_SOURCE_CATEGORY_IDS = new Set([
  6, // Ship
  8, // Charge
  16, // Skill
  20, // Implant
  32 // Subsystem
]);

export type StackingEligibility = "eligible" | "exempt" | "uncertain";

export type StackingCandidate = Readonly<{
  effectId: number;
  operation: number;
  ordinal: number;
  rawValue: number;
  sourceCategoryId: number | null;
  sourceInstanceId: string;
  sourceKind: DogmaRuntimeObjectKind;
}>;

export type StackingResult = Readonly<{
  diagnostics: readonly EngineDiagnostic[];
  modifiers: readonly Readonly<{
    candidate: StackingCandidate;
    effectiveMultiplier: number | null;
    effectiveValue: number | null;
    penaltyFactor: number | null;
    position: number | null;
    rawMultiplier: number | null;
  }>[];
}>;

export function stackingPenaltyFactor(position: number) {
  if (!Number.isInteger(position) || position < 0) {
    throw new Error("Stacking position must be a nonnegative integer.");
  }
  return Math.exp(-(position * position) / STACKING_PENALTY_DENOMINATOR);
}

export function determineStackingEligibility(input: {
  candidate: StackingCandidate;
  targetAttribute: DogmaAttributeDefinition;
}): StackingEligibility {
  if (input.targetAttribute.stackable) return "exempt";
  if (!STACKING_OPERATIONS.has(input.candidate.operation)) return "exempt";
  if (input.candidate.sourceKind === "character") return "exempt";
  if (input.candidate.sourceCategoryId === null) return "uncertain";
  if (EXEMPT_SOURCE_CATEGORY_IDS.has(input.candidate.sourceCategoryId)) {
    return "exempt";
  }
  return "eligible";
}

export function applyStackingPenalty(input: {
  candidates: readonly StackingCandidate[];
  targetAttribute: DogmaAttributeDefinition;
}): StackingResult {
  const diagnostics: EngineDiagnostic[] = [];
  const eligible: Array<StackingCandidate & { rawMultiplier: number }> = [];
  const output: Array<StackingResult["modifiers"][number]> = [];

  for (const candidate of input.candidates) {
    const rawMultiplier = toMultiplier(candidate.operation, candidate.rawValue);
    if (rawMultiplier === null) {
      output.push({
        candidate,
        effectiveMultiplier: null,
        effectiveValue: null,
        penaltyFactor: null,
        position: null,
        rawMultiplier: null
      });
      diagnostics.push({
        code: "nonmultiplicative-stacking-candidate",
        effectId: candidate.effectId,
        message: `Operation ${candidate.operation} cannot enter the stacking multiplier stage.`,
        severity: "error"
      });
      continue;
    }

    const eligibility = determineStackingEligibility({
      candidate,
      targetAttribute: input.targetAttribute
    });
    if (eligibility === "uncertain") {
      output.push({
        candidate,
        effectiveMultiplier: null,
        effectiveValue: null,
        penaltyFactor: null,
        position: null,
        rawMultiplier
      });
      diagnostics.push({
        code: "uncertain-stacking-eligibility",
        effectId: candidate.effectId,
        instanceId: candidate.sourceInstanceId,
        message: `Stacking eligibility is uncertain because the source category is unavailable.`,
        severity: "unsupported"
      });
      continue;
    }
    if (eligibility === "exempt" || rawMultiplier === 1) {
      output.push({
        candidate,
        effectiveMultiplier: rawMultiplier,
        effectiveValue: candidate.rawValue,
        penaltyFactor: 1,
        position: null,
        rawMultiplier
      });
      continue;
    }
    eligible.push({ ...candidate, rawMultiplier });
  }

  const operationGroups = new Map<
    number,
    Array<StackingCandidate & { rawMultiplier: number }>
  >();
  for (const item of eligible) {
    const group = operationGroups.get(item.operation) ?? [];
    group.push(item);
    operationGroups.set(item.operation, group);
  }
  for (const operation of [...operationGroups.keys()].sort((left, right) => left - right)) {
    const operationCandidates = operationGroups.get(operation) ?? [];
    const benefits = operationCandidates.filter((item) => item.rawMultiplier > 1);
    const penalties = operationCandidates.filter((item) => item.rawMultiplier < 1);
    for (const chain of [benefits, penalties]) {
      chain.sort(compareStackingCandidates);
      chain.forEach((item, position) => {
        const penaltyFactor = stackingPenaltyFactor(position);
        const effectiveMultiplier =
          1 + (item.rawMultiplier - 1) * penaltyFactor;
        output.push({
          candidate: item,
          effectiveMultiplier,
          effectiveValue: fromMultiplier(
            item.operation,
            item.rawValue,
            effectiveMultiplier
          ),
          penaltyFactor,
          position,
          rawMultiplier: item.rawMultiplier
        });
      });
    }
  }

  output.sort((left, right) =>
    left.candidate.sourceInstanceId.localeCompare(
      right.candidate.sourceInstanceId,
      "en"
    ) ||
    left.candidate.effectId - right.candidate.effectId ||
    left.candidate.ordinal - right.candidate.ordinal
  );
  return { diagnostics, modifiers: output };
}

function toMultiplier(operation: number, value: number) {
  switch (operation) {
    case DOGMA_OPERATIONS.PRE_MUL:
    case DOGMA_OPERATIONS.POST_MUL:
      return value;
    case DOGMA_OPERATIONS.PRE_DIV:
    case DOGMA_OPERATIONS.POST_DIV:
      return value === 0 ? null : 1 / value;
    case DOGMA_OPERATIONS.POST_PERCENT:
      return 1 + value / 100;
    default:
      return null;
  }
}

function fromMultiplier(
  operation: number,
  rawValue: number,
  multiplier: number
) {
  switch (operation) {
    case DOGMA_OPERATIONS.PRE_MUL:
    case DOGMA_OPERATIONS.POST_MUL:
      return multiplier;
    case DOGMA_OPERATIONS.PRE_DIV:
    case DOGMA_OPERATIONS.POST_DIV:
      return multiplier === 0 ? rawValue : 1 / multiplier;
    case DOGMA_OPERATIONS.POST_PERCENT:
      return (multiplier - 1) * 100;
    default:
      return rawValue;
  }
}

function compareStackingCandidates(
  left: StackingCandidate & { rawMultiplier: number },
  right: StackingCandidate & { rawMultiplier: number }
) {
  return (
    Math.abs(right.rawMultiplier - 1) - Math.abs(left.rawMultiplier - 1) ||
    left.sourceInstanceId.localeCompare(right.sourceInstanceId, "en") ||
    left.effectId - right.effectId ||
    left.ordinal - right.ordinal
  );
}
