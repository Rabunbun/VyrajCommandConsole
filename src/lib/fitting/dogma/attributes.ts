import type {
  AttributeResult,
  DogmaAttributeDefinition,
  DogmaTypeProjection,
  EngineDiagnostic
} from "./types";

export function resolveBaseAttribute(
  projection: DogmaTypeProjection,
  definition: DogmaAttributeDefinition
): AttributeResult {
  const explicitValue = projection.attributes.find(
    (attribute) => attribute.attributeId === definition.attributeId
  );
  const explicit = explicitValue !== undefined;
  const base = explicitValue?.value ?? definition.defaultValue;

  return {
    attributeId: definition.attributeId,
    base,
    diagnostics: [],
    effective: base,
    explicit,
    maxAttributeId: definition.maxAttributeId,
    minAttributeId: definition.minAttributeId,
    modifiers: []
  };
}

export function describeAttributeBounds(
  result: AttributeResult,
  resolvedValues: ReadonlyMap<number, number>
): { diagnostics: EngineDiagnostic[]; max: number | null; min: number | null } {
  const diagnostics: EngineDiagnostic[] = [];
  const min = resolveBound("minimum", result.minAttributeId, resolvedValues, diagnostics);
  const max = resolveBound("maximum", result.maxAttributeId, resolvedValues, diagnostics);
  return { diagnostics, max, min };
}

function resolveBound(
  label: string,
  attributeId: number | null,
  values: ReadonlyMap<number, number>,
  diagnostics: EngineDiagnostic[]
) {
  if (attributeId === null) {
    return null;
  }

  const value = values.get(attributeId);
  if (value === undefined) {
    diagnostics.push({
      attributeId,
      code: "unresolved-attribute-bound",
      message: `The ${label} Dogma attribute ${attributeId} is unresolved; no clamp was applied.`,
      severity: "unsupported"
    });
    return null;
  }
  return value;
}
