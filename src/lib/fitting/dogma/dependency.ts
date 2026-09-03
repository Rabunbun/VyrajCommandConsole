import type {
  AttributeDependency,
  CollectedModifier,
  EngineDiagnostic
} from "./types";

export type AttributeDependencyOrder = Readonly<{
  diagnostics: readonly EngineDiagnostic[];
  orderedKeys: readonly string[];
}>;

export function buildAttributeDependencies(
  modifiers: readonly CollectedModifier[]
): AttributeDependency[] {
  return modifiers.map((modifier) => ({
    sourceAttributeId: modifier.source.attributeId,
    sourceInstanceId: modifier.source.instanceId,
    targetAttributeId: modifier.target.attributeId,
    targetInstanceId: modifier.target.instanceId
  }));
}

export function orderAttributeDependencies(
  dependencies: readonly AttributeDependency[]
): AttributeDependencyOrder {
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const dependency of dependencies) {
    const source = attributeKey(
      dependency.sourceInstanceId,
      dependency.sourceAttributeId
    );
    const target = attributeKey(
      dependency.targetInstanceId,
      dependency.targetAttributeId
    );
    ensureNode(adjacency, indegree, source);
    ensureNode(adjacency, indegree, target);
    if (source !== target && !adjacency.get(source)?.has(target)) {
      adjacency.get(source)?.add(target);
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  }

  const ready = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([key]) => key)
    .sort(compareKeys);
  const ordered: string[] = [];
  while (ready.length) {
    const key = ready.shift() as string;
    ordered.push(key);
    for (const target of [...(adjacency.get(key) ?? [])].sort(compareKeys)) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
        ready.sort(compareKeys);
      }
    }
  }

  if (ordered.length === indegree.size) {
    return { diagnostics: [], orderedKeys: ordered };
  }

  const cyclic = [...indegree.keys()]
    .filter((key) => !ordered.includes(key))
    .sort(compareKeys);
  return {
    diagnostics: [{
      code: "attribute-dependency-cycle",
      message: `Dogma attribute dependency cycle detected: ${cyclic.join(", ")}.`,
      relatedAttributeIds: cyclic.map(parseAttributeId),
      severity: "error"
    }],
    orderedKeys: ordered
  };
}

export function attributeKey(instanceId: string, attributeId: number) {
  return `${instanceId}:${attributeId}`;
}

function parseAttributeId(key: string) {
  return Number(key.slice(key.lastIndexOf(":") + 1));
}

function compareKeys(left: string, right: string) {
  return left.localeCompare(right, "en");
}

function ensureNode(
  adjacency: Map<string, Set<string>>,
  indegree: Map<string, number>,
  key: string
) {
  if (!adjacency.has(key)) adjacency.set(key, new Set());
  if (!indegree.has(key)) indegree.set(key, 0);
}
