import "dotenv/config";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SDE_JSONL_ZIP_URL =
  "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";
const DRONE_CATEGORY_ID = 18;
const FIGHTER_CATEGORY_ID = 87;
const ABYSSAL_META_GROUP_ID = 15;
const DATABASE_BATCH_SIZE = 250;

const DRONE_BANDWIDTH_USED_ATTRIBUTE = {
  defaultValue: 0,
  id: 1272,
  name: "droneBandwidthUsed",
  unitId: 128
} as const;

const VERIFICATION_DRONE_NAMES = [
  "Hobgoblin I",
  "Hammerhead I",
  "Ogre I",
  "Garde I",
  "Mining Drone I",
  "Salvage Drone I",
  "Light Armor Maintenance Bot I",
  "Hornet EC-300",
  "Praetor EV-900",
  "Warrior SW-300",
  "'Augmented' Hobgoblin",
  "Federation Navy Hobgoblin",
  "Gecko",
  "'Excavator' Mining Drone"
] as const;

type LocalizedName = {
  en?: string;
};

type SdeCategory = {
  _key: number;
  name?: LocalizedName;
  published?: boolean;
};

type SdeGroup = {
  _key: number;
  categoryID: number;
  name?: LocalizedName;
  published?: boolean;
};

type SdeType = {
  _key: number;
  groupID: number;
  marketGroupID?: number;
  metaGroupID?: number;
  metaLevel?: number;
  name?: LocalizedName;
  published?: boolean;
  techLevel?: number;
  volume?: number;
};

type SdeDogmaAttribute = {
  _key: number;
  defaultValue?: number;
  name?: string;
  unitID?: number;
};

type SdeTypeDogma = {
  _key: number;
  dogmaAttributes?: Array<{
    attributeID: number;
    value: number;
  }>;
};

type SdeMarketGroup = {
  _key: number;
  name?: LocalizedName;
  parentGroupID?: number;
};

type SdeNamedRecord = {
  _key: number;
  name?: LocalizedName;
};

type CategoryRecord = {
  categoryId: number;
  categoryName: string;
  published: boolean;
};

type GroupRecord = {
  categoryId: number;
  groupId: number;
  groupName: string;
  published: boolean;
};

type PublishedDroneType = {
  groupId: number;
  groupName: string;
  marketGroupId: number | null;
  metaGroupId: number | null;
  metaLevel: number | null;
  rawVolume: number | null;
  techLevel: number | null;
  typeId: number;
  typeName: string;
};

type MarketGroupRecord = {
  marketGroupId: number;
  marketGroupName: string;
  parentGroupId: number | null;
};

type MarketGroupPath = {
  ids: number[];
  names: string[];
};

type FittingDroneRecord = {
  bandwidthUsed: number | null;
  groupId: number;
  groupName: string;
  lastRefreshedAt: Date;
  marketGroupId: number | null;
  marketGroupName: string | null;
  marketGroupPathIds: number[];
  marketGroupPathNames: string[];
  metaGroupId: number | null;
  metaGroupName: string | null;
  metaLevel: number | null;
  techLevel: number | null;
  typeId: number;
  typeName: string;
  volume: number | null;
};

async function main() {
  console.log("Refreshing Fitting Bay ordinary drones from CCP SDE JSON Lines.");
  console.log(`SDE source: ${SDE_JSONL_ZIP_URL}`);

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required to refresh Fitting Bay drone data.");
  }

  const tempRoot = await mkdtemp(
    path.join(tmpdir(), "vyraj-fitting-drones-sde-")
  );

  try {
    const zipPath = path.join(tempRoot, "sde-jsonl.zip");
    const extractDir = path.join(tempRoot, "sde-jsonl");

    await downloadFile(SDE_JSONL_ZIP_URL, zipPath);
    await extractArchive(zipPath, extractDir);

    const files = await findRequiredSdeFiles(extractDir);
    const categories = await readCategories(files.categories);
    validateDroneCategory(categories);

    const attributeDefinitions = await readDogmaAttributes(
      files.dogmaAttributes
    );
    validateBandwidthAttribute(attributeDefinitions);

    const groupClassification = await readGroups(files.groups);
    const typeClassification = await readTypes(
      files.types,
      groupClassification.droneGroups,
      groupClassification.fighterGroupIds
    );
    const typeDogma = await readTypeDogma(
      files.typeDogma,
      typeClassification.publishedOrdinaryDrones
    );
    const marketGroups = await readMarketGroups(files.marketGroups);
    const marketGroupPaths = buildMarketGroupPaths(marketGroups);
    const metaGroupNames = await readEnglishNames(files.metaGroups);
    validateAbyssalMetaGroup(metaGroupNames);

    const drones = buildFittingDrones({
      marketGroups,
      marketGroupPaths,
      metaGroupNames,
      publishedOrdinaryDrones:
        typeClassification.publishedOrdinaryDrones,
      refreshedAt: new Date(),
      typeDogma
    });

    validateSourcePopulation(
      drones,
      groupClassification.publishedDroneGroups
    );
    logClassificationSummary({
      drones,
      groupClassification,
      typeClassification
    });
    logVerificationSamples(drones);

    const result = await synchronizeFittingDrones(drones);
    logImportSummary(drones, result);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function downloadFile(url: string, targetPath: string) {
  console.log("Downloading latest official CCP SDE JSON Lines archive.");
  const response = await fetch(url, {
    headers: {
      accept: "application/zip",
      "user-agent": "VyrajCommandConsoleV2/fitting-drone-refresh"
    }
  });

  if (!response.ok) {
    throw new Error(`CCP SDE download failed with HTTP ${response.status}.`);
  }

  await writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
}

async function extractArchive(zipPath: string, extractDir: string) {
  console.log("Extracting official CCP SDE archive.");
  await mkdir(extractDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xf", zipPath, "-C", extractDir], {
      shell: false,
      stdio: "ignore"
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `Unable to run tar for SDE extraction: ${error.message}. Install a tar-compatible extractor or extract the JSONL archive manually.`
        )
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`SDE archive extraction failed with exit code ${code}.`));
      }
    });
  });
}

async function findRequiredSdeFiles(root: string) {
  const discovered = await findFilesByName(
    root,
    new Set([
      "categories.jsonl",
      "dogmaAttributes.jsonl",
      "groups.jsonl",
      "marketGroups.jsonl",
      "metaGroups.jsonl",
      "typeDogma.jsonl",
      "types.jsonl"
    ])
  );

  return {
    categories: requireSdeFile(discovered, "categories.jsonl"),
    dogmaAttributes: requireSdeFile(discovered, "dogmaAttributes.jsonl"),
    groups: requireSdeFile(discovered, "groups.jsonl"),
    marketGroups: requireSdeFile(discovered, "marketGroups.jsonl"),
    metaGroups: requireSdeFile(discovered, "metaGroups.jsonl"),
    typeDogma: requireSdeFile(discovered, "typeDogma.jsonl"),
    types: requireSdeFile(discovered, "types.jsonl")
  };
}

async function findFilesByName(
  directory: string,
  names: Set<string>,
  discovered = new Map<string, string>()
) {
  const entries = await readdir(directory);

  for (const entry of entries) {
    const entryPath = path.join(directory, entry);
    const entryStat = await stat(entryPath);

    if (entryStat.isDirectory()) {
      await findFilesByName(entryPath, names, discovered);
      continue;
    }

    if (names.has(entry)) {
      discovered.set(entry, entryPath);
    }
  }

  return discovered;
}

function requireSdeFile(files: Map<string, string>, fileName: string) {
  const filePath = files.get(fileName);

  if (!filePath) {
    throw new Error(`SDE archive did not include ${fileName}.`);
  }

  return filePath;
}

async function readCategories(filePath: string) {
  const categories = new Map<number, CategoryRecord>();

  for await (const category of readJsonLines<SdeCategory>(filePath)) {
    categories.set(category._key, {
      categoryId: category._key,
      categoryName: getEnglishName(category.name),
      published: category.published === true
    });
  }

  return categories;
}

function validateDroneCategory(categories: Map<number, CategoryRecord>) {
  const droneCategory = categories.get(DRONE_CATEGORY_ID);

  if (
    droneCategory?.categoryName !== "Drone" ||
    droneCategory.published !== true
  ) {
    throw new Error(
      `CCP category ${DRONE_CATEGORY_ID} was expected to be published Drone, but SDE reported ${droneCategory?.categoryName || "missing"} (${formatPublished(droneCategory?.published)}). Database mutation was skipped.`
    );
  }
}

async function readDogmaAttributes(filePath: string) {
  const attributes = new Map<number, SdeDogmaAttribute>();

  for await (const attribute of readJsonLines<SdeDogmaAttribute>(filePath)) {
    attributes.set(attribute._key, attribute);
  }

  return attributes;
}

function validateBandwidthAttribute(
  attributes: Map<number, SdeDogmaAttribute>
) {
  const actual = attributes.get(DRONE_BANDWIDTH_USED_ATTRIBUTE.id);

  if (actual?.name !== DRONE_BANDWIDTH_USED_ATTRIBUTE.name) {
    throw new Error(
      `Dogma attribute ${DRONE_BANDWIDTH_USED_ATTRIBUTE.id} was expected to be ${DRONE_BANDWIDTH_USED_ATTRIBUTE.name}, but SDE reported ${actual?.name || "missing"}. Database mutation was skipped.`
    );
  }

  if (actual.unitID !== DRONE_BANDWIDTH_USED_ATTRIBUTE.unitId) {
    throw new Error(
      `Dogma attribute ${DRONE_BANDWIDTH_USED_ATTRIBUTE.id} (${DRONE_BANDWIDTH_USED_ATTRIBUTE.name}) expected unit ${DRONE_BANDWIDTH_USED_ATTRIBUTE.unitId}, but SDE reported ${formatNullable(actual.unitID)}. Database mutation was skipped.`
    );
  }

  if (actual.defaultValue !== DRONE_BANDWIDTH_USED_ATTRIBUTE.defaultValue) {
    throw new Error(
      `Dogma attribute ${DRONE_BANDWIDTH_USED_ATTRIBUTE.id} (${DRONE_BANDWIDTH_USED_ATTRIBUTE.name}) expected default ${DRONE_BANDWIDTH_USED_ATTRIBUTE.defaultValue}, but SDE reported ${formatNullable(actual.defaultValue)}. Database mutation was skipped.`
    );
  }
}

async function readGroups(filePath: string) {
  const droneGroups = new Map<number, GroupRecord>();
  const publishedDroneGroups = new Map<number, GroupRecord>();
  const fighterGroupIds = new Set<number>();
  let droneCategoryGroups = 0;
  let unpublishedDroneGroups = 0;

  for await (const group of readJsonLines<SdeGroup>(filePath)) {
    if (group.categoryID === FIGHTER_CATEGORY_ID && group.published === true) {
      fighterGroupIds.add(group._key);
    }

    if (group.categoryID !== DRONE_CATEGORY_ID) {
      continue;
    }

    droneCategoryGroups += 1;
    const record: GroupRecord = {
      categoryId: group.categoryID,
      groupId: group._key,
      groupName: requireEnglishName(group.name, `group ${group._key}`),
      published: group.published === true
    };

    droneGroups.set(group._key, record);

    if (record.published) {
      publishedDroneGroups.set(group._key, record);
    } else {
      unpublishedDroneGroups += 1;
    }
  }

  if (!publishedDroneGroups.size) {
    throw new Error(
      "CCP SDE produced zero published Category 18 drone groups. Database mutation was skipped."
    );
  }

  return {
    droneCategoryGroups,
    droneGroups,
    fighterGroupIds,
    publishedDroneGroups,
    unpublishedDroneGroups
  };
}

async function readTypes(
  filePath: string,
  droneGroups: Map<number, GroupRecord>,
  fighterGroupIds: Set<number>
) {
  const publishedOrdinaryDrones = new Map<number, PublishedDroneType>();
  const abyssalExcluded: PublishedDroneType[] = [];
  let droneCategoryTypes = 0;
  let excludedByUnpublishedGroup = 0;
  let unpublishedDroneTypes = 0;
  let publishedFighterTypes = 0;

  for await (const type of readJsonLines<SdeType>(filePath)) {
    if (fighterGroupIds.has(type.groupID) && type.published === true) {
      publishedFighterTypes += 1;
    }

    const group = droneGroups.get(type.groupID);

    if (!group) {
      continue;
    }

    droneCategoryTypes += 1;

    if (!group.published) {
      excludedByUnpublishedGroup += 1;
      continue;
    }

    if (type.published !== true) {
      unpublishedDroneTypes += 1;
      continue;
    }

    const record: PublishedDroneType = {
      groupId: group.groupId,
      groupName: group.groupName,
      marketGroupId: readOptionalPositiveInteger(
        type.marketGroupID,
        `type ${type._key} marketGroupID`
      ),
      metaGroupId: readOptionalPositiveInteger(
        type.metaGroupID,
        `type ${type._key} metaGroupID`
      ),
      metaLevel: readOptionalInteger(
        type.metaLevel,
        `type ${type._key} metaLevel`
      ),
      rawVolume: readOptionalNonnegativeNumber(
        type.volume,
        `type ${type._key} volume`
      ),
      techLevel: readOptionalInteger(
        type.techLevel,
        `type ${type._key} techLevel`
      ),
      typeId: type._key,
      typeName: requireEnglishName(type.name, `type ${type._key}`)
    };

    if (record.metaGroupId === ABYSSAL_META_GROUP_ID) {
      abyssalExcluded.push(record);
    } else {
      publishedOrdinaryDrones.set(record.typeId, record);
    }
  }

  return {
    abyssalExcluded: abyssalExcluded.sort((left, right) =>
      left.typeName.localeCompare(right.typeName, "en-US")
    ),
    droneCategoryTypes,
    excludedByUnpublishedGroup,
    publishedFighterTypes,
    publishedOrdinaryDrones,
    unpublishedDroneTypes
  };
}

async function readTypeDogma(
  filePath: string,
  drones: Map<number, PublishedDroneType>
) {
  const dogma = new Map<number, SdeTypeDogma>();

  for await (const typeDogma of readJsonLines<SdeTypeDogma>(filePath)) {
    if (drones.has(typeDogma._key)) {
      dogma.set(typeDogma._key, typeDogma);
    }
  }

  return dogma;
}

async function readMarketGroups(filePath: string) {
  const marketGroups = new Map<number, MarketGroupRecord>();

  for await (const marketGroup of readJsonLines<SdeMarketGroup>(filePath)) {
    marketGroups.set(marketGroup._key, {
      marketGroupId: marketGroup._key,
      marketGroupName: requireEnglishName(
        marketGroup.name,
        `market group ${marketGroup._key}`
      ),
      parentGroupId:
        typeof marketGroup.parentGroupID === "number"
          ? marketGroup.parentGroupID
          : null
    });
  }

  return marketGroups;
}

function buildMarketGroupPaths(marketGroups: Map<number, MarketGroupRecord>) {
  const paths = new Map<number, MarketGroupPath>();

  for (const marketGroupId of marketGroups.keys()) {
    const reversedPath: MarketGroupRecord[] = [];
    const visited = new Set<number>();
    let currentId: number | null = marketGroupId;

    while (currentId !== null) {
      if (visited.has(currentId)) {
        throw new Error(
          `CCP market group ancestry contains a cycle at market group ${currentId}. Database mutation was skipped.`
        );
      }

      visited.add(currentId);
      const current = marketGroups.get(currentId);

      if (!current) {
        throw new Error(
          `CCP market group ancestry references missing market group ${currentId}. Database mutation was skipped.`
        );
      }

      reversedPath.push(current);
      currentId = current.parentGroupId;
    }

    const pathRecords = reversedPath.reverse();
    paths.set(marketGroupId, {
      ids: pathRecords.map((record) => record.marketGroupId),
      names: pathRecords.map((record) => record.marketGroupName)
    });
  }

  return paths;
}

async function readEnglishNames(filePath: string) {
  const names = new Map<number, string>();

  for await (const record of readJsonLines<SdeNamedRecord>(filePath)) {
    const name = getEnglishName(record.name);

    if (name) {
      names.set(record._key, name);
    }
  }

  return names;
}

function validateAbyssalMetaGroup(metaGroupNames: Map<number, string>) {
  const name = metaGroupNames.get(ABYSSAL_META_GROUP_ID);

  if (name !== "Abyssal") {
    throw new Error(
      `CCP meta group ${ABYSSAL_META_GROUP_ID} was expected to be Abyssal, but SDE reported ${name || "missing"}. Database mutation was skipped.`
    );
  }
}

function buildFittingDrones({
  marketGroups,
  marketGroupPaths,
  metaGroupNames,
  publishedOrdinaryDrones,
  refreshedAt,
  typeDogma
}: {
  marketGroups: Map<number, MarketGroupRecord>;
  marketGroupPaths: Map<number, MarketGroupPath>;
  metaGroupNames: Map<number, string>;
  publishedOrdinaryDrones: Map<number, PublishedDroneType>;
  refreshedAt: Date;
  typeDogma: Map<number, SdeTypeDogma>;
}) {
  const drones: FittingDroneRecord[] = [];

  for (const droneType of publishedOrdinaryDrones.values()) {
    const marketGroup =
      droneType.marketGroupId === null
        ? null
        : marketGroups.get(droneType.marketGroupId) ?? null;
    const marketPath =
      droneType.marketGroupId === null
        ? null
        : marketGroupPaths.get(droneType.marketGroupId) ?? null;

    if (droneType.marketGroupId !== null && (!marketGroup || !marketPath)) {
      throw new Error(
        `Published drone ${droneType.typeId}/${droneType.typeName} references missing market group ${droneType.marketGroupId}. Database mutation was skipped.`
      );
    }

    const metaGroupName =
      droneType.metaGroupId === null
        ? null
        : metaGroupNames.get(droneType.metaGroupId) ?? null;

    if (droneType.metaGroupId !== null && !metaGroupName) {
      throw new Error(
        `Published drone ${droneType.typeId}/${droneType.typeName} references missing meta group ${droneType.metaGroupId}. Database mutation was skipped.`
      );
    }

    const attributes = new Map(
      (typeDogma.get(droneType.typeId)?.dogmaAttributes || []).map(
        (attribute) => [attribute.attributeID, attribute.value]
      )
    );

    drones.push({
      bandwidthUsed: readNullableNonnegativeNumber(
        attributes,
        DRONE_BANDWIDTH_USED_ATTRIBUTE.id,
        `${droneType.typeId}/${droneType.typeName} bandwidth used`
      ),
      groupId: droneType.groupId,
      groupName: droneType.groupName,
      lastRefreshedAt: refreshedAt,
      marketGroupId: droneType.marketGroupId,
      marketGroupName: marketGroup?.marketGroupName ?? null,
      marketGroupPathIds: marketPath?.ids ?? [],
      marketGroupPathNames: marketPath?.names ?? [],
      metaGroupId: droneType.metaGroupId,
      metaGroupName,
      metaLevel: droneType.metaLevel,
      techLevel: droneType.techLevel,
      typeId: droneType.typeId,
      typeName: droneType.typeName,
      volume: droneType.rawVolume
    });
  }

  return drones.sort(
    (left, right) =>
      left.groupName.localeCompare(right.groupName, "en-US") ||
      left.typeName.localeCompare(right.typeName, "en-US")
  );
}

function validateSourcePopulation(
  drones: FittingDroneRecord[],
  publishedGroups: Map<number, GroupRecord>
) {
  if (!drones.length) {
    throw new Error(
      "CCP SDE produced zero authoritative ordinary drones. Database mutation was skipped."
    );
  }

  const typeIds = new Set<number>();

  for (const drone of drones) {
    const group = publishedGroups.get(drone.groupId);

    if (
      !group ||
      group.categoryId !== DRONE_CATEGORY_ID ||
      group.published !== true
    ) {
      throw new Error(
        `Drone ${drone.typeId}/${drone.typeName} is not reachable through a published Category ${DRONE_CATEGORY_ID} group. Database mutation was skipped.`
      );
    }

    if (drone.metaGroupId === ABYSSAL_META_GROUP_ID) {
      throw new Error(
        `Abyssal drone ${drone.typeId}/${drone.typeName} reached the ordinary drone population. Database mutation was skipped.`
      );
    }

    if (typeIds.has(drone.typeId)) {
      throw new Error(
        `Duplicate drone type ID ${drone.typeId} reached the ordinary drone population. Database mutation was skipped.`
      );
    }

    if (
      drone.marketGroupPathIds.length !==
      drone.marketGroupPathNames.length
    ) {
      throw new Error(
        `Drone ${drone.typeId}/${drone.typeName} has inconsistent market ancestry. Database mutation was skipped.`
      );
    }

    if (
      drone.marketGroupId !== null &&
      drone.marketGroupPathIds.at(-1) !== drone.marketGroupId
    ) {
      throw new Error(
        `Drone ${drone.typeId}/${drone.typeName} market ancestry does not terminate at market group ${drone.marketGroupId}. Database mutation was skipped.`
      );
    }

    typeIds.add(drone.typeId);
  }
}

async function synchronizeFittingDrones(drones: FittingDroneRecord[]) {
  const existing = await prisma.fittingDrone.findMany({
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
  const existingByTypeId = new Map(
    existing.map((drone) => [drone.typeId, drone])
  );
  const incomingTypeIds = new Set(drones.map((drone) => drone.typeId));
  const created = drones.filter((drone) => !existingByTypeId.has(drone.typeId));
  const changed = drones.filter((drone) => {
    const current = existingByTypeId.get(drone.typeId);
    return current ? droneHasChanged(current, drone) : false;
  });
  const unchanged = drones.filter((drone) => {
    const current = existingByTypeId.get(drone.typeId);
    return current ? !droneHasChanged(current, drone) : false;
  });
  const staleTypeIds = existing
    .filter((drone) => !incomingTypeIds.has(drone.typeId))
    .map((drone) => drone.typeId);

  for (const batch of chunk(created, DATABASE_BATCH_SIZE)) {
    await prisma.fittingDrone.createMany({ data: batch });
  }

  for (const batch of chunk(changed, DATABASE_BATCH_SIZE)) {
    await prisma.$transaction(
      batch.map((drone) =>
        prisma.fittingDrone.update({
          data: drone,
          where: { typeId: drone.typeId }
        })
      )
    );
  }

  for (const batch of chunk(unchanged, DATABASE_BATCH_SIZE)) {
    await prisma.fittingDrone.updateMany({
      data: { lastRefreshedAt: drones[0].lastRefreshedAt },
      where: { typeId: { in: batch.map((drone) => drone.typeId) } }
    });
  }

  let removed = 0;

  // Stale rows are removed only after all incoming rows synchronized successfully.
  for (const batch of chunk(staleTypeIds, DATABASE_BATCH_SIZE)) {
    const result = await prisma.fittingDrone.deleteMany({
      where: { typeId: { in: batch } }
    });
    removed += result.count;
  }

  return {
    created: created.length,
    removed,
    unchanged: unchanged.length,
    updated: changed.length
  };
}

function droneHasChanged(
  current: Omit<FittingDroneRecord, "lastRefreshedAt">,
  incoming: FittingDroneRecord
) {
  return (
    current.typeName !== incoming.typeName ||
    current.groupId !== incoming.groupId ||
    current.groupName !== incoming.groupName ||
    current.marketGroupId !== incoming.marketGroupId ||
    current.marketGroupName !== incoming.marketGroupName ||
    !arraysEqual(current.marketGroupPathIds, incoming.marketGroupPathIds) ||
    !arraysEqual(current.marketGroupPathNames, incoming.marketGroupPathNames) ||
    current.metaGroupId !== incoming.metaGroupId ||
    current.metaGroupName !== incoming.metaGroupName ||
    current.metaLevel !== incoming.metaLevel ||
    current.techLevel !== incoming.techLevel ||
    current.volume !== incoming.volume ||
    current.bandwidthUsed !== incoming.bandwidthUsed
  );
}

function arraysEqual<T>(left: T[], right: T[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function logClassificationSummary({
  drones,
  groupClassification,
  typeClassification
}: {
  drones: FittingDroneRecord[];
  groupClassification: Awaited<ReturnType<typeof readGroups>>;
  typeClassification: Awaited<ReturnType<typeof readTypes>>;
}) {
  console.log("CCP Category 18 ordinary-drone classification:");
  console.log(
    `- Category 18 groups: ${groupClassification.droneCategoryGroups}`
  );
  console.log(
    `- Published groups: ${groupClassification.publishedDroneGroups.size}`
  );
  console.log(
    `- Unpublished groups excluded: ${groupClassification.unpublishedDroneGroups}`
  );
  console.log(`- Category 18 types: ${typeClassification.droneCategoryTypes}`);
  console.log(
    `- Types excluded by unpublished group: ${typeClassification.excludedByUnpublishedGroup}`
  );
  console.log(
    `- Unpublished types excluded: ${typeClassification.unpublishedDroneTypes}`
  );
  console.log(
    `- Meta group ${ABYSSAL_META_GROUP_ID}/Abyssal templates excluded: ${typeClassification.abyssalExcluded.length}`
  );

  for (const drone of typeClassification.abyssalExcluded) {
    console.log(`  - ${drone.typeId}/${drone.typeName}`);
  }

  console.log(`- Authoritative ordinary drones imported: ${drones.length}`);
  console.log(
    `- Published Category 87 fighter types observed and excluded: ${typeClassification.publishedFighterTypes}`
  );
  console.log(
    "- NPC, blueprint, module, skill, and other-category types excluded by Category 18 group membership."
  );

  const groupCounts = countByGroup(drones);
  console.log("Imported drone counts by authoritative group:");

  for (const group of groupCounts) {
    console.log(`- ${group.groupId}/${group.groupName}: ${group.count}`);
  }
}

function logVerificationSamples(drones: FittingDroneRecord[]) {
  const byName = new Map(drones.map((drone) => [drone.typeName, drone]));
  console.log("Representative ordinary-drone verification from CCP SDE:");

  for (const typeName of VERIFICATION_DRONE_NAMES) {
    const drone = byName.get(typeName);

    if (!drone) {
      console.warn(
        `- ${typeName}: not present in the current authoritative ordinary-drone population.`
      );
      continue;
    }

    console.log(
      `- ${drone.typeId}/${drone.typeName}; group ${drone.groupId}/${drone.groupName}; volume ${formatNullable(drone.volume)} m3; bandwidth ${formatNullable(drone.bandwidthUsed)} Mbit/sec; market ${drone.marketGroupPathNames.join(" > ") || "missing"}; meta ${formatMetadata(drone.metaGroupId, drone.metaGroupName)}; meta level ${formatNullable(drone.metaLevel)}; tech ${formatNullable(drone.techLevel)}.`
    );
  }
}

function logImportSummary(
  drones: FittingDroneRecord[],
  result: {
    created: number;
    removed: number;
    unchanged: number;
    updated: number;
  }
) {
  console.log(
    `Database synchronization: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.removed} removed stale.`
  );
  console.log(
    `Volume storage: ${drones.filter((drone) => drone.volume === null).length} missing/null, ${drones.filter((drone) => drone.volume === 0).length} explicit zero, ${drones.filter((drone) => (drone.volume ?? 0) > 0).length} explicit positive.`
  );
  console.log(
    `Bandwidth storage: ${drones.filter((drone) => drone.bandwidthUsed === null).length} missing/null, ${drones.filter((drone) => drone.bandwidthUsed === 0).length} explicit zero, ${drones.filter((drone) => (drone.bandwidthUsed ?? 0) > 0).length} explicit positive.`
  );
  console.log(
    `Market ancestry: ${drones.filter((drone) => drone.marketGroupPathIds.length > 0).length} classified, ${drones.filter((drone) => drone.marketGroupId === null).length} without a market group.`
  );
}

function countByGroup(drones: FittingDroneRecord[]) {
  const counts = new Map<
    number,
    { count: number; groupId: number; groupName: string }
  >();

  for (const drone of drones) {
    const current = counts.get(drone.groupId);
    counts.set(drone.groupId, {
      count: (current?.count ?? 0) + 1,
      groupId: drone.groupId,
      groupName: drone.groupName
    });
  }

  return Array.from(counts.values()).sort((left, right) =>
    left.groupName.localeCompare(right.groupName, "en-US")
  );
}

function readOptionalNonnegativeNumber(
  value: number | undefined,
  label: string
) {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${label} must be a finite nonnegative number, received ${value}. Database mutation was skipped.`
    );
  }

  return value;
}

function readNullableNonnegativeNumber(
  values: Map<number, number>,
  attributeId: number,
  label: string
) {
  const value = values.get(attributeId);

  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${label} must be a finite nonnegative number, received ${value}. Database mutation was skipped.`
    );
  }

  return value;
}

function readOptionalInteger(value: number | undefined, label: string) {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(
      `${label} must be an integer, received ${value}. Database mutation was skipped.`
    );
  }

  return value;
}

function readOptionalPositiveInteger(value: number | undefined, label: string) {
  const parsed = readOptionalInteger(value, label);

  if (parsed !== null && parsed < 1) {
    throw new Error(
      `${label} must be a positive integer, received ${parsed}. Database mutation was skipped.`
    );
  }

  return parsed;
}

function formatMetadata(id: number | null, name: string | null) {
  return id === null ? "missing" : `${id}/${name ?? "name missing"}`;
}

function formatNullable(value: number | null | undefined) {
  return value === null || value === undefined ? "missing" : value;
}

function formatPublished(value: boolean | undefined) {
  return value === undefined ? "published missing" : `published ${value}`;
}

async function* readJsonLines<T>(filePath: string): AsyncGenerator<T> {
  const lines = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(filePath, { encoding: "utf8" })
  });

  for await (const line of lines) {
    const trimmed = line.trim();

    if (trimmed) {
      yield JSON.parse(trimmed) as T;
    }
  }
}

function requireEnglishName(value: LocalizedName | undefined, label: string) {
  const name = getEnglishName(value);

  if (!name) {
    throw new Error(`CCP SDE ${label} did not include an English name.`);
  }

  return name;
}

function getEnglishName(value: LocalizedName | undefined) {
  if (!value) {
    return "";
  }

  return value.en || Object.values(value).find(Boolean) || "";
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Fitting drone refresh failed."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
