import "server-only";
import { FittingRack, Prisma } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type {
  BrowsableFittingRack,
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
