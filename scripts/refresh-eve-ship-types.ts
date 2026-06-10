import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const esiBaseUrl = normalizeBaseUrl(
  process.env.EVE_ESI_BASE_URL || "https://esi.evetech.net"
);
const datasource = "tranquility";
const shipCategoryId = 6;
const requestConcurrency = 8;
const smokeTestShipNames = [
  "Merlin",
  "Caracal Navy Issue",
  "Gila",
  "Kikimora",
  "Drekavac",
  "Vedmak",
  "Ikitursa",
  "Skybreaker",
  "Stormbringer",
  "Thunderchild",
  "Panther",
  "Marshal",
  "Bowhead",
  "Orca"
];

type EveCategoryResponse = {
  category_id: number;
  name: string;
  published?: boolean;
  groups: number[];
};

type EveGroupResponse = {
  category_id: number;
  group_id: number;
  name: string;
  published?: boolean;
  types?: number[];
};

type EveTypeResponse = {
  group_id: number;
  name: string;
  published?: boolean;
  type_id: number;
};

type ShipTypeRecord = {
  categoryName: string;
  groupName: string;
  typeId: number;
  typeName: string;
  renderUrl: string;
  iconUrl: string;
  lastRefreshedAt: Date;
};

async function main() {
  console.log("Refreshing EVE ship type lookup from public ESI.");
  console.log(`ESI base: ${esiBaseUrl}`);

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required to refresh the local EVE ship type cache.");
  }

  const refreshedAt = new Date();
  let skippedTypeFailures = 0;
  const category = await fetchEsi<EveCategoryResponse>(
    `/latest/universe/categories/${shipCategoryId}/`,
    "ship category"
  );

  const groups = await mapWithConcurrency(
    category.groups,
    requestConcurrency,
    (groupId) =>
      fetchEsi<EveGroupResponse>(
        `/latest/universe/groups/${groupId}/`,
        `ship group ${groupId}`
      )
  );
  const publishedGroups = groups.filter(
    (group) => group.category_id === shipCategoryId && group.published !== false
  );
  const typeJobs = publishedGroups.flatMap((group) =>
    (group.types || []).map((typeId) => ({ group, typeId }))
  );

  const types = await mapWithConcurrency(
    typeJobs,
    requestConcurrency,
    async ({ group, typeId }) => {
      let type: EveTypeResponse;

      try {
        type = await fetchEsi<EveTypeResponse>(
          `/latest/universe/types/${typeId}/`,
          `ship type ${typeId}`
        );
      } catch (error) {
        skippedTypeFailures += 1;
        console.warn(
          error instanceof Error
            ? error.message
            : `Public ESI request failed for ship type ${typeId}.`
        );
        return null;
      }

      if (type.published === false) {
        return null;
      }

      return {
        categoryName: category.name || "Ship",
        groupName: group.name || "",
        typeId: type.type_id,
        typeName: type.name,
        renderUrl: buildRenderUrl(type.type_id),
        iconUrl: buildIconUrl(type.type_id),
        lastRefreshedAt: refreshedAt
      } satisfies ShipTypeRecord;
    }
  );

  const shipTypes = types.filter((type): type is ShipTypeRecord => Boolean(type));
  const publishedTypeIds = shipTypes.map((shipType) => shipType.typeId);
  const missingSmokeTestShips = smokeTestShipNames.filter(
    (shipName) =>
      !shipTypes.some(
        (shipType) =>
          shipType.typeName.toLocaleLowerCase("en-US") ===
          shipName.toLocaleLowerCase("en-US")
      )
  );
  const result = {
    created: 0,
    unpublished: 0,
    updated: 0
  };

  if (publishedTypeIds.length) {
    const unpublished = await prisma.eveTypeLookup.updateMany({
      where: {
        typeId: {
          not: null,
          notIn: publishedTypeIds
        },
        OR: [
          {
            categoryName: {
              equals: "Ship",
              mode: "insensitive"
            }
          },
          {
            category: {
              equals: "Ship",
              mode: "insensitive"
            }
          },
          {
            category: {
              equals: "Ships",
              mode: "insensitive"
            }
          }
        ]
      },
      data: {
        isPublished: false,
        lastRefreshedAt: refreshedAt
      }
    });
    result.unpublished = unpublished.count;
  }

  for (const shipType of shipTypes) {
    const existingByTypeId = await prisma.eveTypeLookup.findUnique({
      where: { typeId: shipType.typeId },
      select: { id: true }
    });

    if (existingByTypeId) {
      await prisma.eveTypeLookup.update({
        where: { id: existingByTypeId.id },
        data: {
          ...shipType,
          category: shipType.categoryName,
          isPublished: true
        }
      });
      result.updated += 1;
      continue;
    }

    const existingByName = await prisma.eveTypeLookup.findUnique({
      where: { typeName: shipType.typeName },
      select: { id: true }
    });

    if (existingByName) {
      await prisma.eveTypeLookup.update({
        where: { id: existingByName.id },
        data: {
          ...shipType,
          category: shipType.categoryName,
          isPublished: true
        }
      });
      result.updated += 1;
      continue;
    }

    await prisma.eveTypeLookup.create({
      data: {
        ...shipType,
        category: shipType.categoryName,
        isPublished: true
      }
    });
    result.created += 1;
  }

  console.log(
    `Imported ${shipTypes.length} published ship types (${result.created} created, ${result.updated} updated, ${result.unpublished} marked unpublished).`
  );

  if (skippedTypeFailures > 0) {
    console.warn(
      `Skipped ${skippedTypeFailures} ship type detail request(s) because public ESI did not respond successfully. Re-run the command to fill gaps.`
    );
  }

  if (missingSmokeTestShips.length) {
    console.warn(
      `Ship lookup smoke list missing: ${missingSmokeTestShips.join(", ")}. If these are currently published in EVE, re-run the refresh or inspect ESI availability.`
    );
  }
}

async function fetchEsi<T>(path: string, stage: string): Promise<T> {
  const url = new URL(`${esiBaseUrl}${path}`);
  url.searchParams.set("datasource", datasource);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "VyrajCommandConsoleV2/ship-type-refresh"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Public ESI request failed for ${stage}: HTTP ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}

async function mapWithConcurrency<Input, Output>(
  items: Input[],
  concurrency: number,
  mapper: (item: Input) => Promise<Output>
) {
  const results: Output[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function buildRenderUrl(typeId: number) {
  return `https://images.evetech.net/types/${typeId}/render?size=512`;
}

function buildIconUrl(typeId: number) {
  return `https://images.evetech.net/types/${typeId}/icon?size=128`;
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "EVE ship type refresh failed."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
