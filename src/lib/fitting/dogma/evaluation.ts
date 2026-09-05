import { resolveBaseAttribute } from "./attributes";
import { attributeKey } from "./dependency";
import { collectEffectModifiers } from "./modifiers";
import { evaluateAttributeOperations } from "./operations";
import {
  DOGMA_EFFECT_CATEGORIES,
  DOGMA_OPERATIONS
} from "./semantics";
import { applyStackingPenalty } from "./stacking";
import type {
  AttributeResult,
  CollectedModifier,
  DogmaAttributeDefinition,
  DogmaEffectDefinition,
  DogmaObjectGraph,
  DogmaRuntimeObject,
  EngineDiagnostic
} from "./types";

const evaluatedEffectCategories = new Set<number>([
  DOGMA_EFFECT_CATEGORIES.PASSIVE,
  DOGMA_EFFECT_CATEGORIES.ONLINE
]);

const multiplicativeOperations = new Set<number>([
  DOGMA_OPERATIONS.PRE_MUL,
  DOGMA_OPERATIONS.PRE_DIV,
  DOGMA_OPERATIONS.POST_MUL,
  DOGMA_OPERATIONS.POST_DIV,
  DOGMA_OPERATIONS.POST_PERCENT
]);

export type DogmaAttributeTarget = Readonly<{
  attributeId: number;
  instanceId: string;
}>;

export type DogmaEvaluationResult = Readonly<{
  diagnostics: readonly EngineDiagnostic[];
  results: ReadonlyMap<string, AttributeResult>;
}>;

/**
 * Evaluates the requested attributes and their modifier dependencies. The
 * caller supplies authoritative static definitions; this pure boundary has no
 * database knowledge and assumes fitted modules/rigs are online.
 */
export function evaluateDogmaAttributes(input: {
  attributeDefinitions: ReadonlyMap<number, DogmaAttributeDefinition>;
  effectDefinitions: ReadonlyMap<number, DogmaEffectDefinition>;
  graph: DogmaObjectGraph;
  targets: readonly DogmaAttributeTarget[];
}): DogmaEvaluationResult {
  const diagnostics: EngineDiagnostic[] = [];
  const neededAttributeIds = collectNeededAttributeIds(
    input.attributeDefinitions,
    input.effectDefinitions,
    input.targets.map((target) => target.attributeId)
  );
  const modifiers = collectRelevantModifiers({
    diagnostics,
    effectDefinitions: input.effectDefinitions,
    graph: input.graph,
    neededAttributeIds
  });
  const modifiersByTarget = groupModifiersByTarget(modifiers);
  const results = new Map<string, AttributeResult>();
  const visiting = new Set<string>();

  const evaluate = (instanceId: string, attributeId: number): AttributeResult => {
    const key = attributeKey(instanceId, attributeId);
    const cached = results.get(key);
    if (cached) return cached;

    const object = input.graph.objects.get(instanceId);
    const definition = input.attributeDefinitions.get(attributeId);
    if (!object || !object.projection || !definition) {
      const result = unavailableAttribute(
        attributeId,
        !object || !object.projection
          ? `Dogma runtime object ${instanceId} has no static projection.`
          : `Dogma attribute definition ${attributeId} is unavailable.`,
        instanceId
      );
      results.set(key, result);
      return result;
    }

    if (visiting.has(key)) {
      const result = unavailableAttribute(
        attributeId,
        `Dogma attribute dependency cycle reached ${key}.`,
        instanceId,
        "attribute-dependency-cycle"
      );
      results.set(key, result);
      return result;
    }

    visiting.add(key);
    const base = resolveObjectBaseAttribute(object, definition);
    const operationModifiers = [];
    const localDiagnostics: EngineDiagnostic[] = [
      ...base.diagnostics,
      ...diagnostics.filter(
        (diagnostic) => diagnostic.attributeId === attributeId
      )
    ];

    for (const modifier of modifiersByTarget.get(key) ?? []) {
      const source = evaluate(
        modifier.source.instanceId,
        modifier.source.attributeId
      );
      localDiagnostics.push(...source.diagnostics);
      if (source.effective === null) {
        localDiagnostics.push({
          attributeId,
          code: "modifier-source-unavailable",
          effectId: modifier.source.effectId,
          instanceId: modifier.source.instanceId,
          message: `Modifier source ${modifier.source.instanceId}:${modifier.source.attributeId} is unavailable.`,
          severity: "unsupported"
        });
        continue;
      }

      operationModifiers.push({ modifier, rawValue: source.effective });
    }

    const multiplicative = operationModifiers.filter(({ modifier }) =>
      multiplicativeOperations.has(modifier.definition.operation as number)
    );
    const stacking = applyStackingPenalty({
      candidates: multiplicative.map(({ modifier, rawValue }) => {
        const sourceObject = input.graph.objects.get(modifier.source.instanceId);

        return {
          effectId: modifier.source.effectId,
          operation: modifier.definition.operation as number,
          ordinal: modifier.definition.ordinal,
          rawValue,
          sourceCategoryId: sourceObject?.projection?.categoryId ?? null,
          sourceInstanceId: modifier.source.instanceId,
          sourceKind: sourceObject?.kind ?? "character"
        };
      }),
      targetAttribute: definition
    });
    localDiagnostics.push(...stacking.diagnostics);
    const stackingByModifier = new Map(
      stacking.modifiers.map((item) => [modifierIdentity(item.candidate), item])
    );
    const evaluated = evaluateAttributeOperations({
      attributeId,
      base: base.base,
      explicit: base.explicit,
      maxAttributeId: base.maxAttributeId,
      minAttributeId: base.minAttributeId,
      modifiers: operationModifiers.flatMap(({ modifier, rawValue }) => {
        const stacked = multiplicativeOperations.has(
          modifier.definition.operation as number
        )
          ? stackingByModifier.get(
              modifierIdentity({
                effectId: modifier.source.effectId,
                ordinal: modifier.definition.ordinal,
                sourceInstanceId: modifier.source.instanceId
              })
            )
          : null;

        if (stacked && stacked.effectiveValue === null) return [];

        return [{
          effectId: modifier.source.effectId,
          effectiveMultiplier: stacked?.effectiveMultiplier ?? null,
          effectiveValue: stacked?.effectiveValue ?? rawValue,
          modifyingAttributeId: modifier.source.attributeId,
          operation: modifier.definition.operation as number,
          ordinal: modifier.definition.ordinal,
          rawMultiplier: stacked?.rawMultiplier ?? null,
          rawValue,
          sourceInstanceId: modifier.source.instanceId,
          sourceTypeId: modifier.source.typeId,
          stackingFactor: stacked?.penaltyFactor ?? null,
          stackingPosition: stacked?.position ?? null
        }];
      })
    });
    let effective = evaluated.effective;
    if (effective !== null && evaluated.minAttributeId !== null) {
      const minimum = evaluate(instanceId, evaluated.minAttributeId);
      localDiagnostics.push(...minimum.diagnostics);
      effective = minimum.effective === null
        ? null
        : Math.max(effective, minimum.effective);
    }
    if (effective !== null && evaluated.maxAttributeId !== null) {
      const maximum = evaluate(instanceId, evaluated.maxAttributeId);
      localDiagnostics.push(...maximum.diagnostics);
      effective = maximum.effective === null
        ? null
        : Math.min(effective, maximum.effective);
    }
    const result = {
      ...evaluated,
      diagnostics: deduplicateDiagnostics([
        ...localDiagnostics,
        ...evaluated.diagnostics
      ]),
      effective
    };
    visiting.delete(key);
    results.set(key, result);
    return result;
  };

  for (const target of input.targets) {
    evaluate(target.instanceId, target.attributeId);
  }

  return {
    diagnostics: deduplicateDiagnostics([
      ...diagnostics,
      ...input.targets.flatMap(
        (target) =>
          results.get(attributeKey(target.instanceId, target.attributeId))
            ?.diagnostics ?? []
      )
    ]),
    results
  };
}

function collectNeededAttributeIds(
  attributes: ReadonlyMap<number, DogmaAttributeDefinition>,
  effects: ReadonlyMap<number, DogmaEffectDefinition>,
  targetAttributeIds: readonly number[]
) {
  const needed = new Set(targetAttributeIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const attributeId of [...needed]) {
      const definition = attributes.get(attributeId);
      for (const boundId of [
        definition?.minAttributeId,
        definition?.maxAttributeId
      ]) {
        if (boundId !== null && boundId !== undefined && !needed.has(boundId)) {
          needed.add(boundId);
          changed = true;
        }
      }
    }
    for (const effect of effects.values()) {
      if (!evaluatedEffectCategories.has(effect.categoryId)) continue;
      for (const modifier of effect.modifiers) {
        if (
          modifier.modifiedAttributeId !== null &&
          modifier.modifyingAttributeId !== null &&
          needed.has(modifier.modifiedAttributeId) &&
          !needed.has(modifier.modifyingAttributeId)
        ) {
          needed.add(modifier.modifyingAttributeId);
          changed = true;
        }
      }
    }
  }

  return needed;
}

function collectRelevantModifiers(input: {
  diagnostics: EngineDiagnostic[];
  effectDefinitions: ReadonlyMap<number, DogmaEffectDefinition>;
  graph: DogmaObjectGraph;
  neededAttributeIds: ReadonlySet<number>;
}) {
  const modifiers: CollectedModifier[] = [];

  for (const object of input.graph.objects.values()) {
    for (const reference of object.projection?.effects ?? []) {
      const effect = input.effectDefinitions.get(reference.effectId);
      if (!effect) {
        input.diagnostics.push({
          code: "effect-definition-unavailable",
          effectId: reference.effectId,
          instanceId: object.instanceId,
          message: `Dogma effect definition ${reference.effectId} is unavailable.`,
          severity: "error"
        });
        continue;
      }
      if (!evaluatedEffectCategories.has(effect.categoryId)) continue;

      const relevantDefinitions = effect.modifiers.filter(
        (modifier) =>
          modifier.modifiedAttributeId !== null &&
          input.neededAttributeIds.has(modifier.modifiedAttributeId)
      );
      if (!relevantDefinitions.length) continue;

      if (effect.capability !== "generic-modifier") {
        if (isSupersededSkillLevelEffect(object, relevantDefinitions)) continue;
        for (const attributeId of new Set(
          relevantDefinitions.flatMap((modifier) =>
            modifier.modifiedAttributeId === null
              ? []
              : [modifier.modifiedAttributeId]
          )
        )) {
          input.diagnostics.push({
            attributeId,
            code: "resource-effect-requires-special-handler",
            effectId: effect.effectId,
            instanceId: object.instanceId,
            message: `Effect ${effect.effectId} (${effect.name}) affects the requested Dogma dependency graph but is ${effect.capability}.`,
            severity: "unsupported"
          });
        }
        continue;
      }

      const collected = collectEffectModifiers({
        effect: { ...effect, modifiers: relevantDefinitions },
        graph: input.graph,
        sourceInstanceId: object.instanceId
      });
      input.diagnostics.push(
        ...collected.diagnostics.filter(
          (diagnostic) => diagnostic.code !== "modifier-target-not-found"
        )
      );
      modifiers.push(...collected.modifiers);
    }
  }

  return modifiers;
}

function isSupersededSkillLevelEffect(
  object: DogmaRuntimeObject,
  modifiers: readonly DogmaEffectDefinition["modifiers"][number][]
) {
  const overridden = new Set(
    object.attributeOverrides.map((attribute) => attribute.attributeId)
  );

  return (
    object.kind === "skill" &&
    modifiers.every(
      (modifier) =>
        modifier.modifiedAttributeId !== null &&
        overridden.has(modifier.modifiedAttributeId)
    )
  );
}

function resolveObjectBaseAttribute(
  object: DogmaRuntimeObject,
  definition: DogmaAttributeDefinition
) {
  const override = object.attributeOverrides.find(
    (attribute) => attribute.attributeId === definition.attributeId
  );
  if (!object.projection) {
    throw new Error(`Dogma runtime object ${object.instanceId} has no projection.`);
  }
  if (!override) return resolveBaseAttribute(object.projection, definition);

  return resolveBaseAttribute(
    {
      ...object.projection,
      attributes: [
        ...object.projection.attributes.filter(
          (attribute) => attribute.attributeId !== definition.attributeId
        ),
        override
      ]
    },
    definition
  );
}

function groupModifiersByTarget(modifiers: readonly CollectedModifier[]) {
  const grouped = new Map<string, CollectedModifier[]>();
  for (const modifier of modifiers) {
    const key = attributeKey(
      modifier.target.instanceId,
      modifier.target.attributeId
    );
    const current = grouped.get(key) ?? [];
    current.push(modifier);
    grouped.set(key, current);
  }
  return grouped;
}

function modifierIdentity(input: {
  effectId: number;
  ordinal: number;
  sourceInstanceId: string;
}) {
  return `${input.sourceInstanceId}:${input.effectId}:${input.ordinal}`;
}

function unavailableAttribute(
  attributeId: number,
  message: string,
  instanceId: string,
  code = "attribute-static-data-unavailable"
): AttributeResult {
  return {
    attributeId,
    base: null,
    diagnostics: [{ code, instanceId, message, severity: "unsupported" }],
    effective: null,
    explicit: false,
    maxAttributeId: null,
    minAttributeId: null,
    modifiers: []
  };
}

function deduplicateDiagnostics(diagnostics: readonly EngineDiagnostic[]) {
  return Array.from(
    new Map(
      diagnostics.map((diagnostic) => [
        [
          diagnostic.code,
          diagnostic.effectId ?? "",
          diagnostic.instanceId ?? "",
          diagnostic.attributeId ?? "",
          diagnostic.message
        ].join(":"),
        diagnostic
      ])
    ).values()
  );
}
