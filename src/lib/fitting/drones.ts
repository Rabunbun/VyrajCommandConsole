import "server-only";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { FittingDroneSearchResult } from "@/lib/fitting/types";

type SearchFittingDronesOptions = {
  limit: number;
  query: string;
};

export async function searchFittingDrones({
  limit,
  query
}: SearchFittingDronesOptions): Promise<{
  results: FittingDroneSearchResult[];
  total: number;
}> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting drone cache is unavailable.");
  }

  const normalizedQuery = normalizeSearchText(query);
  const drones = await getDb().fittingDrone.findMany({
    orderBy: [{ typeName: "asc" }, { typeId: "asc" }],
    select: {
      bandwidthUsed: true,
      groupId: true,
      groupName: true,
      marketGroupId: true,
      marketGroupName: true,
      marketGroupPathIds: true,
      marketGroupPathNames: true,
      metaGroupId: true,
      metaGroupName: true,
      metaLevel: true,
      techLevel: true,
      typeId: true,
      typeName: true,
      volume: true
    }
  });
  const matches = normalizedQuery
    ? drones.filter((drone) =>
        normalizeSearchText(
          [
            drone.typeName,
            drone.groupName,
            drone.marketGroupName,
            ...drone.marketGroupPathNames,
            drone.metaGroupName
          ]
            .filter(Boolean)
            .join(" ")
        ).includes(normalizedQuery)
      )
    : drones;

  return {
    results: matches.slice(0, limit),
    total: matches.length
  };
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}
