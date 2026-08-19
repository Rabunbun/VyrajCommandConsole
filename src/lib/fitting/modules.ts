import "server-only";
import { FittingRack, Prisma } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type {
  BrowsableFittingRack,
  FittingModuleSearchResult,
  ResolvedFittingModule
} from "@/lib/fitting/types";

const databaseRackByBrowserRack: Record<BrowsableFittingRack, FittingRack> = {
  high: FittingRack.HIGH,
  low: FittingRack.LOW,
  mid: FittingRack.MID,
  rig: FittingRack.RIG
};
const browserRackByDatabaseRack: Partial<
  Record<FittingRack, BrowsableFittingRack>
> = {
  [FittingRack.HIGH]: "high",
  [FittingRack.LOW]: "low",
  [FittingRack.MID]: "mid",
  [FittingRack.RIG]: "rig"
};

export type ResolveFittingModuleResult =
  | {
      status: "not-found";
    }
  | {
      status: "rack-mismatch";
    }
  | {
      module: ResolvedFittingModule;
      status: "resolved";
    };

type SearchFittingModulesOptions = {
  limit: number;
  query: string;
  rack: BrowsableFittingRack;
};

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
    orderBy: [{ typeName: "asc" }, { typeId: "asc" }],
    select: {
      groupId: true,
      groupName: true,
      marketGroupName: true,
      metaGroupName: true,
      metaLevel: true,
      techLevel: true,
      typeId: true,
      typeName: true
    },
    take: limit,
    where
  });

  return modules.map((module) => ({
    ...module,
    rack
  }));
}

export async function resolveFittingModuleForRack(input: {
  rack: BrowsableFittingRack;
  typeId: number;
}): Promise<ResolveFittingModuleResult> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting module cache is unavailable.");
  }

  const staticModule = await getDb().fittingModule.findUnique({
    where: {
      typeId: input.typeId
    },
    select: {
      rack: true,
      typeId: true,
      typeName: true
    }
  });

  if (!staticModule) {
    return { status: "not-found" };
  }

  const rack = browserRackByDatabaseRack[staticModule.rack];

  if (!rack || rack !== input.rack) {
    return { status: "rack-mismatch" };
  }

  return {
    module: {
      rack,
      typeId: staticModule.typeId,
      typeName: staticModule.typeName
    },
    status: "resolved"
  };
}
