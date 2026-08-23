import "server-only";

import { Prisma } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  ABYSSAL_META_GROUP_ID,
  BLUEPRINT_CATEGORY_ID,
  getUnsupportedCargoIssue
} from "@/lib/fitting/cargo-policy";
import type {
  CargoHoldAnalysis,
  CargoHoldValidationResponse,
  CargoInputEntry,
  CargoValidationIssue,
  FittingCargoSearchResult,
  ResolvedCargoEntry
} from "@/lib/fitting/types";

type SearchFittingCargoOptions = {
  limit: number;
  query: string;
};

type AnalyzeCargoHoldOptions = {
  cargo: CargoInputEntry[];
  hullTypeId: number | null;
};

export async function searchFittingCargo({
  limit,
  query
}: SearchFittingCargoOptions): Promise<FittingCargoSearchResult[]> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting cargo-item cache is unavailable.");
  }

  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const searchClause = normalizedQuery
    ? Prisma.sql`AND POSITION(
        LOWER(${normalizedQuery}) IN LOWER(CONCAT_WS(
          ' ',
          "typeName",
          "groupName",
          "categoryName",
          "marketGroupName",
          ARRAY_TO_STRING("marketGroupPathNames", ' ')
        ))
      ) > 0`
    : Prisma.empty;

  return getDb().$queryRaw<FittingCargoSearchResult[]>(Prisma.sql`
    SELECT
      "categoryId",
      "categoryName",
      "groupId",
      "groupName",
      "marketGroupId",
      "marketGroupName",
      "marketGroupPathIds",
      "marketGroupPathNames",
      "metaGroupId",
      "metaGroupName",
      "techLevel",
      "typeId",
      "typeName",
      "volume"
    FROM "FittingCargoItem"
    WHERE "marketGroupId" IS NOT NULL
      AND "volume" > 0
      AND "categoryId" <> ${BLUEPRINT_CATEGORY_ID}
      AND ("metaGroupId" IS NULL OR "metaGroupId" <> ${ABYSSAL_META_GROUP_ID})
      AND ("packagedVolume" IS NULL OR "packagedVolume" = "volume")
      ${searchClause}
    ORDER BY "typeName" ASC, "typeId" ASC
    LIMIT ${limit}
  `);
}

export async function analyzeCargoHold({
  cargo,
  hullTypeId
}: AnalyzeCargoHoldOptions): Promise<CargoHoldValidationResponse> {
  const emptyAnalysis = createEmptyCargoAnalysis();

  if (!isDatabaseConfigured()) {
    throw new Error("The fitting static-data cache is unavailable.");
  }

  if (hullTypeId === null) {
    return rejectedCargoHold(emptyAnalysis, {
      code: "HULL_NOT_SELECTED",
      message: "Select a hull before adding cargo."
    });
  }

  const normalized = normalizeCargoEntries(cargo);

  if (!normalized.ok) {
    return rejectedCargoHold(emptyAnalysis, {
      code: "INVALID_CARGO_STATE",
      message: normalized.message
    });
  }

  const db = getDb();
  const [hull, cachedItems] = await Promise.all([
    db.fittingHull.findUnique({
      select: { cargoCapacityBase: true, typeName: true },
      where: { typeId: hullTypeId }
    }),
    db.fittingCargoItem.findMany({
      select: {
        categoryId: true,
        metaGroupId: true,
        packagedVolume: true,
        typeId: true,
        typeName: true,
        volume: true
      },
      where: { typeId: { in: normalized.entries.map((entry) => entry.typeId) } }
    })
  ]);

  if (!hull) {
    return rejectedCargoHold(emptyAnalysis, {
      code: "HULL_NOT_FOUND",
      message: "The selected hull is not present in the fitting cache."
    });
  }

  const baseAnalysis = createEmptyCargoAnalysis(hull.cargoCapacityBase);
  const itemsByTypeId = new Map(cachedItems.map((item) => [item.typeId, item]));
  const errors: CargoValidationIssue[] = [];
  const resolvedEntries: ResolvedCargoEntry[] = [];

  for (const entry of normalized.entries) {
    const item = itemsByTypeId.get(entry.typeId);

    if (!item) {
      errors.push({
        code: "CARGO_ITEM_NOT_FOUND",
        message: `Cargo type ${entry.typeId} is not present in the authoritative cargo-item cache.`
      });
      continue;
    }

    const unsupported = getUnsupportedCargoIssue(item);

    if (unsupported) {
      errors.push(unsupported);
      continue;
    }

    resolvedEntries.push({
      quantity: entry.quantity,
      typeId: item.typeId,
      typeName: item.typeName,
      volume: item.volume as number
    });
  }

  const usedVolume = resolvedEntries.reduce(
    (total, entry) => total + entry.quantity * entry.volume,
    0
  );

  if (!Number.isFinite(usedVolume)) {
    return rejectedCargoHold(baseAnalysis, {
      code: "INVALID_CARGO_STATE",
      message: "The requested cargo quantity is too large to analyze safely."
    });
  }

  const baseCapacity = hull.cargoCapacityBase;
  const overBaseBy =
    baseCapacity === null ? 0 : Math.max(0, usedVolume - baseCapacity);
  const analysis: CargoHoldAnalysis = {
    baseCapacity,
    entries: resolvedEntries.toSorted(
      (left, right) =>
        left.typeName.localeCompare(right.typeName, "en-US") ||
        left.typeId - right.typeId
    ),
    overBaseBy,
    remainingBaseVolume:
      baseCapacity === null ? null : baseCapacity - usedVolume,
    usedVolume
  };

  if (errors.length) {
    return { allowed: false, analysis, errors, warnings: [] };
  }

  const warnings: CargoValidationIssue[] = [];

  if (baseCapacity === null) {
    warnings.push({
      code: "BASE_CAPACITY_UNAVAILABLE",
      message: `${hull.typeName} has no authoritative base normal-cargo capacity. Effective capacity is not calculated.`
    });
  } else if (overBaseBy > Number.EPSILON) {
    warnings.push({
      code: "BASE_CAPACITY_EXCEEDED",
      message: `Cargo exceeds ${hull.typeName}'s base, unmodified capacity by ${formatVolume(overBaseBy)} m³. This is a soft warning because effective cargo modifiers are not implemented.`
    });
  }

  return { allowed: true, analysis, errors: [], warnings };
}

function normalizeCargoEntries(cargo: CargoInputEntry[]):
  | { entries: CargoInputEntry[]; ok: true }
  | { message: string; ok: false } {
  const quantities = new Map<number, number>();

  for (const entry of cargo) {
    if (
      !Number.isInteger(entry.typeId) ||
      entry.typeId <= 0 ||
      !Number.isSafeInteger(entry.quantity) ||
      entry.quantity <= 0
    ) {
      return {
        message: "Every Cargo Hold entry must have a positive typeId and safe positive quantity.",
        ok: false
      };
    }

    const quantity = (quantities.get(entry.typeId) ?? 0) + entry.quantity;

    if (!Number.isSafeInteger(quantity)) {
      return {
        message: `Aggregated quantity for cargo type ${entry.typeId} exceeds the safe integer range.`,
        ok: false
      };
    }

    quantities.set(entry.typeId, quantity);
  }

  return {
    entries: Array.from(quantities, ([typeId, quantity]) => ({ quantity, typeId })),
    ok: true
  };
}

function createEmptyCargoAnalysis(
  baseCapacity: number | null = null
): CargoHoldAnalysis {
  return {
    baseCapacity,
    entries: [],
    overBaseBy: 0,
    remainingBaseVolume: baseCapacity,
    usedVolume: 0
  };
}

function rejectedCargoHold(
  analysis: CargoHoldAnalysis,
  error: CargoValidationIssue
): CargoHoldValidationResponse {
  return { allowed: false, analysis, errors: [error], warnings: [] };
}

function formatVolume(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
