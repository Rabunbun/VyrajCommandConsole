import "server-only";
import { FittingRack, Prisma } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type {
  BrowsableFittingRack,
  FittingModuleHierarchyNode,
  FittingModuleHierarchyResponse,
  FittingModuleSearchResult
} from "@/lib/fitting/types";

const databaseRackByBrowserRack: Record<BrowsableFittingRack, FittingRack> = {
  high: FittingRack.HIGH,
  low: FittingRack.LOW,
  mid: FittingRack.MID,
  rig: FittingRack.RIG
};
type SearchFittingModulesOptions = {
  limit: number;
  query: string;
  rack: BrowsableFittingRack;
};

type BrowseFittingModuleBranchOptions = {
  fallback: boolean;
  marketGroupId: number | null;
  rack: BrowsableFittingRack;
};

type MutableHierarchyNode = Omit<FittingModuleHierarchyNode, "children"> & {
  children: Map<number, MutableHierarchyNode>;
};

const fittingModuleBrowserSelect = {
  groupId: true,
  groupName: true,
  marketGroupName: true,
  metaGroupName: true,
  metaLevel: true,
  techLevel: true,
  typeId: true,
  typeName: true
} satisfies Prisma.FittingModuleSelect;

export async function searchFittingModules({
  limit,
  query,
  rack
}: SearchFittingModulesOptions): Promise<FittingModuleSearchResult[]> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting module cache is unavailable.");
  }

  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const where = {
    rack: databaseRackByBrowserRack[rack],
    ...(normalizedQuery
      ? {
          OR: [
            {
              typeName: {
                contains: normalizedQuery,
                mode: Prisma.QueryMode.insensitive
              }
            },
            {
              groupName: {
                contains: normalizedQuery,
                mode: Prisma.QueryMode.insensitive
              }
            },
            {
              marketGroupName: {
                contains: normalizedQuery,
                mode: Prisma.QueryMode.insensitive
              }
            }
          ]
        }
      : {})
  } satisfies Prisma.FittingModuleWhereInput;

  const modules = await getDb().fittingModule.findMany({
    orderBy: [
      { groupName: "asc" },
      { typeName: "asc" },
      { typeId: "asc" }
    ],
    select: fittingModuleBrowserSelect,
    take: limit,
    where
  });

  return modules.map((fittingModule) =>
    toBrowserModule(fittingModule, rack)
  );
}

export async function getFittingModuleHierarchy(
  rack: BrowsableFittingRack
): Promise<FittingModuleHierarchyResponse> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting module cache is unavailable.");
  }

  const modules = await getDb().fittingModule.findMany({
    orderBy: [{ typeId: "asc" }],
    select: {
      marketGroupId: true,
      marketGroupPathIds: true,
      marketGroupPathNames: true
    },
    where: { rack: databaseRackByBrowserRack[rack] }
  });
  const roots = new Map<number, MutableHierarchyNode>();
  let classified = 0;
  let fallback = 0;

  for (const fittingModule of modules) {
    if (!hasValidMarketPath(fittingModule)) {
      fallback += 1;
      continue;
    }

    classified += 1;
    let siblings = roots;
    let currentNode: MutableHierarchyNode | null = null;

    for (
      let index = 0;
      index < fittingModule.marketGroupPathIds.length;
      index += 1
    ) {
      const marketGroupId = fittingModule.marketGroupPathIds[index];
      const label = fittingModule.marketGroupPathNames[index];
      currentNode = siblings.get(marketGroupId) ?? null;

      if (!currentNode) {
        currentNode = {
          children: new Map(),
          count: 0,
          directCount: 0,
          fallback: false,
          key: `market:${marketGroupId}`,
          label,
          marketGroupId
        };
        siblings.set(marketGroupId, currentNode);
      }

      currentNode.count += 1;
      siblings = currentNode.children;
    }

    if (currentNode) {
      currentNode.directCount += 1;
    }
  }

  const nodes = finalizeHierarchyNodes(roots);

  if (fallback > 0) {
    nodes.push({
      children: [],
      count: fallback,
      directCount: fallback,
      fallback: true,
      key: `fallback:${rack}`,
      label: `Other ${getRackLabel(rack)} Modules`,
      marketGroupId: null
    });
  }

  const reachable = classified + fallback;

  return {
    classified,
    fallback,
    nodes,
    rack,
    reachable,
    total: modules.length,
    unreachable: modules.length - reachable
  };
}

export async function browseFittingModuleBranch({
  fallback,
  marketGroupId,
  rack
}: BrowseFittingModuleBranchOptions): Promise<FittingModuleSearchResult[]> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting module cache is unavailable.");
  }

  const db = getDb();

  if (fallback) {
    const modules = await db.fittingModule.findMany({
      orderBy: [{ groupName: "asc" }, { typeName: "asc" }, { typeId: "asc" }],
      select: {
        ...fittingModuleBrowserSelect,
        marketGroupId: true,
        marketGroupPathIds: true,
        marketGroupPathNames: true
      },
      where: { rack: databaseRackByBrowserRack[rack] }
    });

    return modules
      .filter((fittingModule) => !hasValidMarketPath(fittingModule))
      .map((fittingModule) => toBrowserModule(fittingModule, rack));
  }

  if (marketGroupId === null) {
    return [];
  }

  const modules = await db.fittingModule.findMany({
    orderBy: [{ groupName: "asc" }, { typeName: "asc" }, { typeId: "asc" }],
    select: fittingModuleBrowserSelect,
    where: {
      marketGroupId,
      rack: databaseRackByBrowserRack[rack]
    }
  });

  return modules.map((fittingModule) =>
    toBrowserModule(fittingModule, rack)
  );
}

function toBrowserModule(
  fittingModule: {
    groupId: number;
    groupName: string;
    marketGroupName: string | null;
    metaGroupName: string | null;
    metaLevel: number | null;
    techLevel: number | null;
    typeId: number;
    typeName: string;
  },
  rack: BrowsableFittingRack
): FittingModuleSearchResult {
  return {
    groupId: fittingModule.groupId,
    groupName: fittingModule.groupName,
    marketGroupName: fittingModule.marketGroupName,
    metaGroupName: fittingModule.metaGroupName,
    metaLevel: fittingModule.metaLevel,
    rack,
    techLevel: fittingModule.techLevel,
    typeId: fittingModule.typeId,
    typeName: fittingModule.typeName
  };
}

function hasValidMarketPath(module: {
  marketGroupId: number | null;
  marketGroupPathIds: number[];
  marketGroupPathNames: string[];
}) {
  return (
    module.marketGroupId !== null &&
    module.marketGroupPathIds.length > 0 &&
    module.marketGroupPathIds.length === module.marketGroupPathNames.length &&
    module.marketGroupPathIds.at(-1) === module.marketGroupId
  );
}

function finalizeHierarchyNodes(
  nodes: Map<number, MutableHierarchyNode>
): FittingModuleHierarchyNode[] {
  return Array.from(nodes.values())
    .map((node) => ({
      ...node,
      children: finalizeHierarchyNodes(node.children)
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label, "en-US"));
}

function getRackLabel(rack: BrowsableFittingRack) {
  switch (rack) {
    case "high":
      return "High Slot";
    case "mid":
      return "Mid Slot";
    case "low":
      return "Low Slot";
    case "rig":
      return "Rig";
  }
}
