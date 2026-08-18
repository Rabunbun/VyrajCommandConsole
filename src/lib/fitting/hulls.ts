import "server-only";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { FittingHullSummary } from "@/lib/fitting/types";

export async function getFittingHullIndex(): Promise<FittingHullSummary[]> {
  if (!isDatabaseConfigured()) {
    return [];
  }

  try {
    const hulls = await getDb().fittingHull.findMany({
      orderBy: [{ groupName: "asc" }, { typeName: "asc" }],
      select: {
        categoryName: true,
        groupName: true,
        highSlots: true,
        lowSlots: true,
        midSlots: true,
        rigSlots: true,
        typeId: true,
        typeName: true
      }
    });

    if (!hulls.length) {
      return [];
    }

    const typeMetadata = await getDb().eveTypeLookup.findMany({
      where: {
        typeId: {
          in: hulls.map((hull) => hull.typeId)
        }
      },
      select: {
        iconUrl: true,
        renderUrl: true,
        typeId: true
      }
    });
    const metadataByTypeId = new Map(
      typeMetadata
        .filter((type) => type.typeId)
        .map((type) => [type.typeId as number, type])
    );

    return hulls.map((hull) => {
      const metadata = metadataByTypeId.get(hull.typeId);

      return {
        ...hull,
        iconUrl: metadata?.iconUrl || buildEveTypeIconUrl(hull.typeId),
        renderUrl: metadata?.renderUrl || buildEveTypeImageUrl(hull.typeId)
      };
    });
  } catch {
    console.warn("Fitting hull index unavailable. Run migrations and refresh hull data.");

    return [];
  }
}

function buildEveTypeImageUrl(typeId: number) {
  return `https://images.evetech.net/types/${typeId}/render?size=512`;
}

function buildEveTypeIconUrl(typeId: number) {
  return `https://images.evetech.net/types/${typeId}/icon?size=128`;
}
