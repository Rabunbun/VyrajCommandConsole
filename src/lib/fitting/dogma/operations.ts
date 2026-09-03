import {
  DOGMA_OPERATIONS,
  DOGMA_OPERATION_STAGE,
  GENERIC_DOGMA_OPERATIONS,
  SPECIAL_DOGMA_OPERATIONS
} from "./semantics";
import type {
  AttributeResult,
  EngineDiagnostic,
  ModifierTrace
} from "./types";

export type ResolvedOperationModifier = Readonly<{
  effectId: number;
  effectiveMultiplier?: number | null;
  effectiveValue?: number;
  modifyingAttributeId: number;
  operation: number;
  ordinal: number;
  rawValue: number;
  rawMultiplier?: number | null;
  sourceInstanceId: string;
  sourceTypeId: number | null;
  stackingFactor?: number | null;
  stackingPosition?: number | null;
}>;

export function evaluateAttributeOperations(input: {
  attributeId: number;
  base: number | null;
  explicit?: boolean;
  maxAttributeId?: number | null;
  minAttributeId?: number | null;
  modifiers: readonly ResolvedOperationModifier[];
}): AttributeResult {
  const diagnostics: EngineDiagnostic[] = [];
  if (input.base === null) {
    return {
      attributeId: input.attributeId,
      base: null,
      diagnostics: [{
        attributeId: input.attributeId,
        code: "missing-attribute-base",
        message: `Dogma attribute ${input.attributeId} has no explicit value or authoritative default.`,
        severity: "unsupported"
      }],
      effective: null,
      explicit: input.explicit ?? false,
      maxAttributeId: input.maxAttributeId ?? null,
      minAttributeId: input.minAttributeId ?? null,
      modifiers: []
    };
  }

  const sorted = [...input.modifiers].sort(compareModifiers);
  let value = input.base;
  const traces: ModifierTrace[] = [];
  for (const modifier of sorted) {
    if (SPECIAL_DOGMA_OPERATIONS.has(modifier.operation)) {
      diagnostics.push({
        attributeId: input.attributeId,
        code: "special-operation-not-evaluated",
        effectId: modifier.effectId,
        instanceId: modifier.sourceInstanceId,
        message: `Dogma operation ${modifier.operation} requires an explicit semantic handler.`,
        severity: "unsupported"
      });
      continue;
    }
    if (!GENERIC_DOGMA_OPERATIONS.has(modifier.operation)) {
      diagnostics.push({
        attributeId: input.attributeId,
        code: "unknown-operation-not-evaluated",
        effectId: modifier.effectId,
        message: `Unknown Dogma operation ${modifier.operation} was not evaluated.`,
        severity: "error"
      });
      continue;
    }

    const operand = modifier.effectiveValue ?? modifier.rawValue;
    const before = value;
    const applied = applyOperation(value, modifier.operation, operand);
    if (!applied.ok) {
      diagnostics.push({
        attributeId: input.attributeId,
        code: applied.code,
        effectId: modifier.effectId,
        message: applied.message,
        severity: "error"
      });
      continue;
    }
    value = applied.value;
    traces.push({
      after: value,
      before,
      effectId: modifier.effectId,
      effectiveContribution: value - before,
      effectiveMultiplier: modifier.effectiveMultiplier ?? null,
      effectiveValue: operand,
      modifyingAttributeId: modifier.modifyingAttributeId,
      operation: modifier.operation,
      ordinal: modifier.ordinal,
      rawValue: modifier.rawValue,
      rawMultiplier: modifier.rawMultiplier ?? null,
      sourceInstanceId: modifier.sourceInstanceId,
      sourceTypeId: modifier.sourceTypeId,
      stackingFactor: modifier.stackingFactor ?? null,
      stackingPosition: modifier.stackingPosition ?? null
    });
  }

  return {
    attributeId: input.attributeId,
    base: input.base,
    diagnostics,
    effective: value,
    explicit: input.explicit ?? true,
    maxAttributeId: input.maxAttributeId ?? null,
    minAttributeId: input.minAttributeId ?? null,
    modifiers: traces
  };
}

function applyOperation(value: number, operation: number, operand: number):
  | { ok: true; value: number }
  | { code: string; message: string; ok: false } {
  switch (operation) {
    case DOGMA_OPERATIONS.PRE_ASSIGNMENT:
    case DOGMA_OPERATIONS.POST_ASSIGNMENT:
      return { ok: true, value: operand };
    case DOGMA_OPERATIONS.PRE_MUL:
    case DOGMA_OPERATIONS.POST_MUL:
      return { ok: true, value: value * operand };
    case DOGMA_OPERATIONS.PRE_DIV:
    case DOGMA_OPERATIONS.POST_DIV:
      return operand === 0
        ? {
            code: "dogma-division-by-zero",
            message: `Dogma operation ${operation} attempted division by zero.`,
            ok: false
          }
        : { ok: true, value: value / operand };
    case DOGMA_OPERATIONS.MOD_ADD:
      return { ok: true, value: value + operand };
    case DOGMA_OPERATIONS.MOD_SUB:
      return { ok: true, value: value - operand };
    case DOGMA_OPERATIONS.POST_PERCENT:
      return { ok: true, value: value * (1 + operand / 100) };
    default:
      return {
        code: "unsupported-dogma-operation",
        message: `Dogma operation ${operation} is unsupported.`,
        ok: false
      };
  }
}

function compareModifiers(
  left: ResolvedOperationModifier,
  right: ResolvedOperationModifier
) {
  const stageDifference =
    (DOGMA_OPERATION_STAGE[left.operation] ?? Number.MAX_SAFE_INTEGER) -
    (DOGMA_OPERATION_STAGE[right.operation] ?? Number.MAX_SAFE_INTEGER);
  return (
    stageDifference ||
    left.effectId - right.effectId ||
    left.ordinal - right.ordinal ||
    left.sourceInstanceId.localeCompare(right.sourceInstanceId, "en")
  );
}
