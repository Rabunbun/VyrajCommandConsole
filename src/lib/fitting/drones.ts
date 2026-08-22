import "server-only";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type {
  DroneBayInputEntry,
  DroneBayValidationIssue,
  DroneBayValidationResponse,
  FittingDroneSearchResult,
  ResolvedDroneBayEntry
} from "@/lib/fitting/types";

type SearchFittingDronesOptions = {
  limit: number;
  query: string;
};

type ValidateDroneBayOptions = {
  drones: DroneBayInputEntry[];
  hullTypeId: number | null;
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

export async function validateDroneBay({
  drones,
  hullTypeId
}: ValidateDroneBayOptions): Promise<DroneBayValidationResponse> {
  const emptyAnalysis = {
    capacity: null,
    entries: [],
    remainingVolume: null,
    usedVolume: 0
  };

  if (!isDatabaseConfigured()) {
    throw new Error("The fitting static-data cache is unavailable.");
  }

  if (hullTypeId === null) {
    return rejectedDroneBay(emptyAnalysis, {
      code: "HULL_NOT_SELECTED",
      message: "Select a hull before adding drones."
    });
  }

  const db = getDb();
  const [hull, cachedDrones] = await Promise.all([
    db.fittingHull.findUnique({
      select: { droneCapacity: true, typeName: true },
      where: { typeId: hullTypeId }
    }),
    db.fittingDrone.findMany({
      select: { typeId: true, typeName: true, volume: true },
      where: { typeId: { in: drones.map((entry) => entry.typeId) } }
    })
  ]);

  if (!hull) {
    return rejectedDroneBay(emptyAnalysis, {
      code: "HULL_NOT_FOUND",
      message: "The selected hull is not present in the fitting cache."
    });
  }

  const analysis = {
    ...emptyAnalysis,
    capacity: hull.droneCapacity,
    remainingVolume: hull.droneCapacity
  };

  if (hull.droneCapacity === null) {
    return rejectedDroneBay(analysis, {
      code: "ORDINARY_DRONE_BAY_UNAVAILABLE",
      message: `${hull.typeName} has no authoritative ordinary Drone Bay capacity.`
    });
  }

  const dronesByTypeId = new Map(cachedDrones.map((drone) => [drone.typeId, drone]));
  const errors: DroneBayValidationIssue[] = [];
  const resolvedEntries: ResolvedDroneBayEntry[] = [];

  for (const entry of drones) {
    const drone = dronesByTypeId.get(entry.typeId);

    if (!drone) {
      errors.push({
        code: "DRONE_NOT_FOUND",
        message: `Drone type ${entry.typeId} is not present in the ordinary fitting-drone cache.`
      });
      continue;
    }

    if (
      drone.volume === null ||
      !Number.isFinite(drone.volume) ||
      drone.volume < 0
    ) {
      errors.push({
        code: "DRONE_VOLUME_UNAVAILABLE",
        message: `${drone.typeName} has no authoritative packaged volume.`
      });
      continue;
    }

    resolvedEntries.push({
      quantity: entry.quantity,
      typeId: drone.typeId,
      typeName: drone.typeName,
      volume: drone.volume
    });
  }

  const usedVolume = resolvedEntries.reduce(
    (total, entry) => total + entry.volume * entry.quantity,
    0
  );

  if (!Number.isFinite(usedVolume)) {
    return rejectedDroneBay(analysis, {
      code: "INVALID_DRONE_BAY_STATE",
      message: "The requested Drone Bay quantity is too large to analyze safely."
    });
  }

  const resolvedAnalysis = {
    capacity: hull.droneCapacity,
    entries: resolvedEntries,
    remainingVolume: hull.droneCapacity - usedVolume,
    usedVolume
  };

  if (errors.length) {
    return { allowed: false, analysis: resolvedAnalysis, errors };
  }

  if (usedVolume > hull.droneCapacity + Number.EPSILON) {
    return rejectedDroneBay(resolvedAnalysis, {
      code: "BAY_CAPACITY_EXCEEDED",
      message: `${hull.typeName}'s Drone Bay capacity would be exceeded by ${formatVolume(
        usedVolume - hull.droneCapacity
      )} m³.`
    });
  }

  return {
    allowed: true,
    analysis: resolvedAnalysis,
    errors: []
  };
}

function normalizeSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function rejectedDroneBay(
  analysis: DroneBayValidationResponse["analysis"],
  error: DroneBayValidationIssue
): DroneBayValidationResponse {
  return { allowed: false, analysis, errors: [error] };
}

function formatVolume(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
