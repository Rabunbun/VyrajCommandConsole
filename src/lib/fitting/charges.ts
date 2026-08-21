import "server-only";
import { Prisma } from "@prisma/client";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import {
  calculateMaximumChargeQuantity,
  isChargeSizeCompatible
} from "@/lib/fitting/charge-compatibility";
import type {
  FittingChargeLoadResponse,
  FittingChargeSearchResponse
} from "@/lib/fitting/types";

type SearchCompatibleFittingChargesOptions = {
  limit: number;
  moduleTypeId: number;
  query: string;
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
