import "server-only";
import { Prisma } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  calculateMaximumChargeQuantity,
  isChargeSizeCompatible
} from "@/lib/fitting/charge-compatibility";
import type {
  FittingChargeBulkLoadResponse,
  FittingChargeCatalogResponse,
  FittingChargeHierarchyNode,
  FittingChargeHierarchyResponse,
  FittingChargeLoadResponse,
  FittingChargeSearchResult,
  FittingChargeSearchResponse
} from "@/lib/fitting/types";

type SearchCompatibleFittingChargesOptions = {
  limit: number;
  moduleTypeId: number;
  query: string;
};

type SearchFittingChargesOptions = {
  limit: number;
  query: string;
};

type BrowseFittingChargeBranchOptions = {
  fallback: boolean;
  groupId: number | null;
  marketGroupId: number | null;
};

type MutableChargeHierarchyNode = Omit<
  FittingChargeHierarchyNode,
  "children"
> & {
  children: Map<number, MutableChargeHierarchyNode>;
};

export type CompatibleChargeSearchResult =
  | { status: "module-not-found" }
  | { message: string; status: "capacity-unavailable" }
  | ({ status: "ready" } & FittingChargeSearchResponse);

export type FittingChargeLoadValidationResult =
  | { message: string; status: "capacity-unavailable" }
  | { message: string; status: "charge-not-found" }
  | { message: string; status: "incompatible" }
  | { message: string; status: "module-not-found" }
  | ({ status: "ready" } & FittingChargeLoadResponse);

export type FittingChargeBulkLoadValidationResult =
  | { message: string; status: "charge-not-found" }
  | ({ status: "ready" } & FittingChargeBulkLoadResponse);

const fittingChargeBrowserSelect = {
  chargeSize: true,
  groupId: true,
  groupName: true,
  marketGroupName: true,
  metaGroupName: true,
  techLevel: true,
  typeId: true,
  typeName: true,
  volume: true
} satisfies Prisma.FittingChargeSelect;

export async function searchFittingCharges({
  limit,
  query
}: SearchFittingChargesOptions): Promise<FittingChargeCatalogResponse> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting charge cache is unavailable.");
  }

  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const charges = await getDb().fittingCharge.findMany({
    orderBy: [{ groupName: "asc" }, { typeName: "asc" }, { typeId: "asc" }],
    select: fittingChargeBrowserSelect,
    take: limit,
    where: normalizedQuery
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
      : undefined
  });

  return { results: charges };
}

export async function getFittingChargeHierarchy(): Promise<FittingChargeHierarchyResponse> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting charge cache is unavailable.");
  }

  const charges = await getDb().fittingCharge.findMany({
    orderBy: [{ typeId: "asc" }],
    select: {
      groupId: true,
      groupName: true,
      marketGroupId: true,
      marketGroupName: true
    }
  });
  const roots = new Map<number, MutableChargeHierarchyNode>();
  let classified = 0;
  let fallback = 0;

  for (const charge of charges) {
    if (charge.marketGroupId === null || !charge.marketGroupName?.trim()) {
      fallback += 1;
      continue;
    }

    classified += 1;
    let marketNode = roots.get(charge.marketGroupId);

    if (!marketNode) {
      marketNode = {
        children: new Map(),
        count: 0,
        directCount: 0,
        fallback: false,
        groupId: null,
        key: `market:${charge.marketGroupId}`,
        label: charge.marketGroupName,
        marketGroupId: charge.marketGroupId
      };
      roots.set(charge.marketGroupId, marketNode);
    }
    marketNode.count += 1;

    let groupNode = marketNode.children.get(charge.groupId);
    if (!groupNode) {
      groupNode = {
        children: new Map(),
        count: 0,
        directCount: 0,
        fallback: false,
        groupId: charge.groupId,
        key: `market:${charge.marketGroupId}:group:${charge.groupId}`,
        label: charge.groupName,
        marketGroupId: charge.marketGroupId
      };
      marketNode.children.set(charge.groupId, groupNode);
    }
    groupNode.count += 1;
    groupNode.directCount += 1;
  }

  const nodes = finalizeChargeHierarchy(roots);
  if (fallback > 0) {
    nodes.push({
      children: [],
      count: fallback,
      directCount: fallback,
      fallback: true,
      groupId: null,
      key: "fallback:charges",
      label: "Other Charges",
      marketGroupId: null
    });
  }
  const reachable = classified + fallback;

  return {
    classified,
    fallback,
    nodes,
    reachable,
    total: charges.length,
    unreachable: charges.length - reachable
  };
}

export async function browseFittingChargeBranch({
  fallback,
  groupId,
  marketGroupId
}: BrowseFittingChargeBranchOptions): Promise<FittingChargeSearchResult[]> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting charge cache is unavailable.");
  }

  const db = getDb();
  if (fallback) {
    const charges = await db.fittingCharge.findMany({
      orderBy: [{ groupName: "asc" }, { typeName: "asc" }, { typeId: "asc" }],
      select: {
        ...fittingChargeBrowserSelect,
        marketGroupId: true
      }
    });
    return charges.filter(
      (charge) => charge.marketGroupId === null || !charge.marketGroupName?.trim()
    );
  }

  if (groupId === null || marketGroupId === null) {
    return [];
  }

  return db.fittingCharge.findMany({
    orderBy: [{ typeName: "asc" }, { typeId: "asc" }],
    select: fittingChargeBrowserSelect,
    where: { groupId, marketGroupId }
  });
}

export async function searchCompatibleFittingCharges({
  limit,
  moduleTypeId,
  query
}: SearchCompatibleFittingChargesOptions): Promise<CompatibleChargeSearchResult> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting charge cache is unavailable.");
  }

  const fittingModule = await getDb().fittingModule.findUnique({
    select: {
      capacity: true,
      chargeGroupIds: true,
      chargeSize: true,
      typeId: true,
      typeName: true
    },
    where: { typeId: moduleTypeId }
  });

  if (!fittingModule) {
    return { status: "module-not-found" };
  }

  if (!fittingModule.chargeGroupIds.length) {
    return {
      module: {
        capacity: fittingModule.capacity,
        chargeCapable: false,
        typeId: fittingModule.typeId,
        typeName: fittingModule.typeName
      },
      results: [],
      status: "ready"
    };
  }

  if (fittingModule.capacity === null) {
    return {
      message: `${fittingModule.typeName} has no authoritative module capacity in the fitting cache. Compatible charges cannot be resolved safely.`,
      status: "capacity-unavailable"
    };
  }

  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const conditions: Prisma.FittingChargeWhereInput[] = [
    { groupId: { in: fittingModule.chargeGroupIds } },
    { volume: { gt: 0, lte: fittingModule.capacity } }
  ];

  if (fittingModule.chargeSize !== null) {
    conditions.push(
      fittingModule.chargeSize === 0
        ? { OR: [{ chargeSize: null }, { chargeSize: 0 }] }
        : { chargeSize: fittingModule.chargeSize }
    );
  }

  if (normalizedQuery) {
    conditions.push({
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
        },
        {
          metaGroupName: {
            contains: normalizedQuery,
            mode: Prisma.QueryMode.insensitive
          }
        }
      ]
    });
  }

  const charges = await getDb().fittingCharge.findMany({
    orderBy: [{ groupName: "asc" }, { typeName: "asc" }, { typeId: "asc" }],
    select: {
      chargeSize: true,
      groupId: true,
      groupName: true,
      marketGroupName: true,
      metaGroupName: true,
      techLevel: true,
      typeId: true,
      typeName: true,
      volume: true
    },
    take: limit,
    where: { AND: conditions }
  });

  return {
    module: {
      capacity: fittingModule.capacity,
      chargeCapable: true,
      typeId: fittingModule.typeId,
      typeName: fittingModule.typeName
    },
    results: charges,
    status: "ready"
  };
}

export async function validateFittingChargeLoad(
  moduleTypeId: number,
  chargeTypeId: number
): Promise<FittingChargeLoadValidationResult> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting charge cache is unavailable.");
  }

  const [fittingModule, fittingCharge] = await Promise.all([
    getDb().fittingModule.findUnique({
      select: {
        capacity: true,
        chargeGroupIds: true,
        chargeSize: true,
        typeId: true,
        typeName: true
      },
      where: { typeId: moduleTypeId }
    }),
    getDb().fittingCharge.findUnique({
      select: {
        chargeSize: true,
        groupId: true,
        typeId: true,
        typeName: true,
        volume: true
      },
      where: { typeId: chargeTypeId }
    })
  ]);

  if (!fittingModule) {
    return {
      message: "The fitted module is not available in the authoritative module cache.",
      status: "module-not-found"
    };
  }

  if (!fittingCharge) {
    return {
      message: "The requested charge is not available in the authoritative charge cache.",
      status: "charge-not-found"
    };
  }

  if (!fittingModule.chargeGroupIds.includes(fittingCharge.groupId)) {
    return {
      message: `${fittingCharge.typeName} is not in a charge group accepted by ${fittingModule.typeName}.`,
      status: "incompatible"
    };
  }

  const effectiveChargeSize = fittingCharge.chargeSize ?? 0;

  if (!isChargeSizeCompatible(fittingModule.chargeSize, fittingCharge.chargeSize)) {
    return {
      message: `${fittingCharge.typeName} has charge size ${effectiveChargeSize}, but ${fittingModule.typeName} requires size ${fittingModule.chargeSize}.`,
      status: "incompatible"
    };
  }

  if (fittingModule.capacity === null) {
    return {
      message: `${fittingModule.typeName} has no authoritative module capacity in the fitting cache. The charge cannot be loaded safely.`,
      status: "capacity-unavailable"
    };
  }

  if (!Number.isFinite(fittingModule.capacity) || fittingModule.capacity <= 0) {
    return {
      message: `${fittingModule.typeName} does not have a positive authoritative charge capacity.`,
      status: "incompatible"
    };
  }

  if (!Number.isFinite(fittingCharge.volume) || fittingCharge.volume <= 0) {
    return {
      message: `${fittingCharge.typeName} does not have a positive authoritative volume.`,
      status: "incompatible"
    };
  }

  if (fittingCharge.volume > fittingModule.capacity) {
    return {
      message: `${fittingCharge.typeName} is too large for ${fittingModule.typeName}'s charge capacity.`,
      status: "incompatible"
    };
  }

  const quantity = calculateMaximumChargeQuantity(
    fittingModule.capacity,
    fittingCharge.volume
  );

  if (quantity < 1) {
    return {
      message: `${fittingCharge.typeName} does not fit in ${fittingModule.typeName}'s charge capacity.`,
      status: "incompatible"
    };
  }

  return {
    charge: {
      quantity,
      typeId: fittingCharge.typeId,
      typeName: fittingCharge.typeName
    },
    module: {
      typeId: fittingModule.typeId,
      typeName: fittingModule.typeName
    },
    status: "ready"
  };
}

export async function validateFittingChargeBulkLoad(
  moduleTypeIds: number[],
  chargeTypeId: number
): Promise<FittingChargeBulkLoadValidationResult> {
  if (!isDatabaseConfigured()) {
    throw new Error("The fitting charge cache is unavailable.");
  }

  const charge = await getDb().fittingCharge.findUnique({
    select: { typeId: true, typeName: true },
    where: { typeId: chargeTypeId }
  });
  if (!charge) {
    return {
      message: "The requested charge is not available in the authoritative charge cache.",
      status: "charge-not-found"
    };
  }

  const uniqueModuleTypeIds = Array.from(new Set(moduleTypeIds));
  const validations = await Promise.all(
    uniqueModuleTypeIds.map(async (moduleTypeId) => ({
      moduleTypeId,
      result: await validateFittingChargeLoad(moduleTypeId, chargeTypeId)
    }))
  );

  return {
    chargeTypeId: charge.typeId,
    chargeTypeName: charge.typeName,
    loads: validations.flatMap(({ result }) =>
      result.status === "ready"
        ? [{ charge: result.charge, module: result.module }]
        : []
    ),
    missingModuleTypeIds: validations.flatMap(({ moduleTypeId, result }) =>
      result.status === "module-not-found" ? [moduleTypeId] : []
    ),
    status: "ready"
  };
}

function finalizeChargeHierarchy(
  nodes: Map<number, MutableChargeHierarchyNode>
): FittingChargeHierarchyNode[] {
  return Array.from(nodes.values())
    .map((node) => ({
      ...node,
      children: finalizeChargeHierarchy(node.children)
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label, "en-US"));
}
