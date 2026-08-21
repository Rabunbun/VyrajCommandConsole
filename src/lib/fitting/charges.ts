import "server-only";
import { Prisma } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { FittingChargeSearchResponse } from "@/lib/fitting/types";

type SearchCompatibleFittingChargesOptions = {
  limit: number;
  moduleTypeId: number;
  query: string;
};

export type CompatibleChargeSearchResult =
  | { status: "module-not-found" }
  | { message: string; status: "capacity-unavailable" }
  | ({ status: "ready" } & FittingChargeSearchResponse);

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
