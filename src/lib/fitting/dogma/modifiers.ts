import { validateModifierSemantics } from "./semantics";
import type {
  CollectedModifier,
  DogmaEffectDefinition,
  DogmaObjectGraph,
  DogmaRuntimeObject,
  EngineDiagnostic
} from "./types";

export type ModifierCollectionResult = Readonly<{
  diagnostics: readonly EngineDiagnostic[];
  modifiers: readonly CollectedModifier[];
}>;

export function collectEffectModifiers(input: {
  effect: DogmaEffectDefinition;
  graph: DogmaObjectGraph;
  sourceInstanceId: string;
}): ModifierCollectionResult {
  const source = input.graph.objects.get(input.sourceInstanceId);
  if (!source) {
    return {
      diagnostics: [{
        code: "missing-modifier-source",
        instanceId: input.sourceInstanceId,
        message: `Dogma modifier source ${input.sourceInstanceId} does not exist.`,
        severity: "error"
      }],
      modifiers: []
    };
  }

  if (input.effect.capability !== "generic-modifier") {
    return {
      diagnostics: [{
        code: "effect-requires-capability",
        effectId: input.effect.effectId,
        instanceId: source.instanceId,
        message: `Effect ${input.effect.effectId} is ${input.effect.capability} and was not collected as a generic modifier.`,
        severity: input.effect.capability === "metadata-nonexecuting" ? "info" : "unsupported"
      }],
      modifiers: []
    };
  }

  const diagnostics: EngineDiagnostic[] = [];
  const collected: CollectedModifier[] = [];
  for (const definition of input.effect.modifiers) {
    diagnostics.push(...validateModifierSemantics(definition));
    if (
      definition.modifiedAttributeId === null ||
      definition.modifyingAttributeId === null ||
      definition.operation === null
    ) {
      diagnostics.push({
        code: "incomplete-generic-modifier",
        effectId: definition.effectId,
        message: `Generic modifier ${definition.effectId}/${definition.ordinal} is incomplete.`,
        severity: "error"
      });
      continue;
    }

    const candidates = resolveCandidates(definition, source, input.graph);
    if (!candidates.length) {
      diagnostics.push({
        code: "modifier-target-not-found",
        effectId: definition.effectId,
        instanceId: source.instanceId,
        message: `No target resolved for modifier ${definition.effectId}/${definition.ordinal}.`,
        severity: "warning"
      });
    }
    for (const target of candidates) {
      collected.push({
        definition,
        source: {
          attributeId: definition.modifyingAttributeId,
          effectId: definition.effectId,
          instanceId: source.instanceId,
          typeId: source.projection?.typeId ?? null
        },
        target: {
          attributeId: definition.modifiedAttributeId,
          instanceId: target.instanceId
        }
      });
    }
  }

  return { diagnostics, modifiers: collected };
}

function resolveCandidates(
  definition: DogmaEffectDefinition["modifiers"][number],
  source: DogmaRuntimeObject,
  graph: DogmaObjectGraph
) {
  if (definition.functionName === "ItemModifier") {
    const target = resolveDirectDomain(definition.domain, source, graph);
    return target ? [target] : [];
  }

  const pool = [...graph.objects.values()].filter((object) => {
    if (definition.functionName === "OwnerRequiredSkillModifier") {
      return object.ownerInstanceId === graph.characterInstanceId;
    }
    return object.locationInstanceId === graph.shipInstanceId;
  });

  if (definition.functionName === "LocationGroupModifier") {
    return pool.filter(
      (object) => object.projection?.groupId === definition.groupId
    );
  }
  if (
    definition.functionName === "LocationRequiredSkillModifier" ||
    definition.functionName === "OwnerRequiredSkillModifier"
  ) {
    return pool.filter(
      (object) =>
        definition.skillTypeId !== null &&
        object.projection?.requiredSkillTypeIds.includes(definition.skillTypeId)
    );
  }
  if (definition.functionName === "LocationModifier") {
    return pool;
  }
  return [];
}

function resolveDirectDomain(
  domain: string | null,
  source: DogmaRuntimeObject,
  graph: DogmaObjectGraph
) {
  switch (domain) {
    case "itemID":
      return source;
    case "shipID":
      return graph.objects.get(graph.shipInstanceId);
    case "charID":
      return graph.objects.get(graph.characterInstanceId);
    case "otherID":
      return source.otherInstanceId
        ? graph.objects.get(source.otherInstanceId)
        : undefined;
    case "structureID":
      return [...graph.objects.values()].find((object) => object.kind === "structure");
    default:
      return undefined;
  }
}
