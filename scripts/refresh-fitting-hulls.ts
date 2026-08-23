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
const sdeJsonlZipUrl =
  "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";
const shipCategoryId = 6;
const verificationShipNames = [
  "Rifter",
  "Vexor",
  "Iteron Mark V",
  "Orca",
  "Providence",
  "Capsule"
];

const FITTING_ATTRIBUTE_IDS = {
  powergridBase: {
    id: 11,
    sdeName: "powerOutput",
    label: "Powergrid"
  },
  lowSlots: {
    id: 12,
    sdeName: "lowSlots",
    label: "Low Slots"
  },
  midSlots: {
    id: 13,
    sdeName: "medSlots",
    label: "Medium Slots"
  },
  highSlots: {
    id: 14,
    sdeName: "hiSlots",
    label: "High Slots"
  },
  cpuBase: {
    id: 48,
    sdeName: "cpuOutput",
    label: "CPU"
  },
  cargoCapacityBase: {
    id: 38,
    sdeName: "capacity",
    label: "Cargo Capacity"
  },
  launcherHardpoints: {
    id: 101,
    sdeName: "launcherSlotsLeft",
    label: "Launcher Hardpoints"
  },
  turretHardpoints: {
    id: 102,
    sdeName: "turretSlotsLeft",
    label: "Turret Hardpoints"
  },
  droneCapacity: {
    id: 283,
    sdeName: "droneCapacity",
    label: "Drone Capacity"
  },
  calibrationCapacity: {
    id: 1132,
    sdeName: "upgradeCapacity",
    label: "Calibration"
  },
  rigSlots: {
    id: 1137,
    sdeName: "rigSlots",
    label: "Rig Slots"
  },
  rigSize: {
    id: 1547,
    sdeName: "rigSize",
    label: "Rig Size"
  },
  droneBandwidth: {
    id: 1271,
    sdeName: "droneBandwidth",
    label: "Drone Bandwidth"
  }
} as const;

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
  capacity?: number;
  groupID: number;
  marketGroupID?: number;
  name?: LocalizedName;
  published?: boolean;
};

type SdeMarketGroup = {
  _key: number;
  name?: LocalizedName;
  parentGroupID?: number;
};

type SdeDogmaAttribute = {
  _key: number;
  name?: string;
};

type SdeTypeDogma = {
  _key: number;
  dogmaAttributes?: Array<{
    attributeID: number;
    value: number;
  }>;
};

type FittingHullRecord = {
  categoryName: string;
  calibrationCapacity: number | null;
  cargoCapacityBase: number | null;
  cpuBase: number | null;
  droneBandwidth: number | null;
  droneCapacity: number | null;
  groupName: string;
  groupId: number;
  highSlots: number;
  lastRefreshedAt: Date;
  launcherHardpoints: number | null;
  lowSlots: number;
  marketGroupId: number | null;
  marketGroupName: string | null;
  marketGroupPathIds: number[];
  marketGroupPathNames: string[];
  midSlots: number;
  powergridBase: number | null;
  rigSlots: number;
  rigSize: number | null;
  turretHardpoints: number | null;
  typeId: number;
  typeName: string;
};

async function main() {
  console.log("Refreshing Fitting Bay hull topology from CCP SDE JSON Lines.");
  console.log(`SDE source: ${sdeJsonlZipUrl}`);

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required to refresh Fitting Bay hull data.");
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "vyraj-fitting-sde-"));

  try {
    const zipPath = path.join(tempRoot, "sde-jsonl.zip");
    const extractDir = path.join(tempRoot, "sde-jsonl");

    await downloadFile(sdeJsonlZipUrl, zipPath);
    await extractArchive(zipPath, extractDir);

    const files = await findRequiredSdeFiles(extractDir);
    const attributeNames = await readDogmaAttributeNames(files.dogmaAttributes);
    validateFittingAttributes(attributeNames);

    const categoryNames = await readCategoryNames(files.categories);
    const shipGroups = await readShipGroups(files.groups);
    const marketGroups = await readMarketGroups(files.marketGroups);
    const marketGroupPaths = buildMarketGroupPaths(marketGroups);
    const publishedShips = await readPublishedShips(
      files.types,
      shipGroups,
      categoryNames,
      marketGroups,
      marketGroupPaths
    );
    const hullAttributes = await readHullDogmaAttributes(files.typeDogma, publishedShips);
    const refreshedAt = new Date();
    const hulls = Array.from(publishedShips.values())
      .map((ship) => {
        const dogma = hullAttributes.get(ship.typeId);
        validateCargoCapacityMatch(
          ship,
          dogma?.cargoCapacityDogma ?? null
        );

        return {
          ...ship,
          calibrationCapacity: dogma?.calibrationCapacity ?? null,
          cpuBase: dogma?.cpuBase ?? null,
          droneBandwidth: dogma?.droneBandwidth ?? null,
          droneCapacity: dogma?.droneCapacity ?? null,
          highSlots: dogma?.highSlots ?? 0,
          launcherHardpoints: dogma?.launcherHardpoints ?? null,
          lowSlots: dogma?.lowSlots ?? 0,
          midSlots: dogma?.midSlots ?? 0,
          powergridBase: dogma?.powergridBase ?? null,
          rigSlots: dogma?.rigSlots ?? 0,
          rigSize: dogma?.rigSize ?? null,
          turretHardpoints: dogma?.turretHardpoints ?? null,
          lastRefreshedAt: refreshedAt
        };
      })
      .sort((left, right) =>
        left.groupName.localeCompare(right.groupName, "en-US") ||
        left.typeName.localeCompare(right.typeName, "en-US")
      );

    const result = await upsertFittingHulls(hulls);
    const verified = verifySampleHulls(hulls);

    console.log(
      `Imported ${hulls.length} published fitting hull(s): ${result.created} created, ${result.updated} updated.`
    );
    const missingSummary = summarizeMissingBaseResources(hulls);
    const marketSummary = summarizeMarketGroupCoverage(hulls);

    console.log("Sample hull verification from SDE Dogma attributes:");

    for (const hull of verified) {
      console.log(
        `- ${hull.typeName}: ${hull.groupName}; market ${hull.marketGroupPathNames.join(" > ") || "unclassified"}; cargo ${formatNullableValue(hull.cargoCapacityBase)} m3; high ${hull.highSlots}, mid ${hull.midSlots}, low ${hull.lowSlots}, rig ${hull.rigSlots}, rig size ${formatNullableValue(hull.rigSize)}; CPU ${formatNullableValue(hull.cpuBase)}, PG ${formatNullableValue(hull.powergridBase)}, calibration ${formatNullableValue(hull.calibrationCapacity)}, turrets ${formatNullableValue(hull.turretHardpoints)}, launchers ${formatNullableValue(hull.launcherHardpoints)}, drone bay ${formatNullableValue(hull.droneCapacity)}, bandwidth ${formatNullableValue(hull.droneBandwidth)}`
      );
    }

    console.log(
      `Missing base resource values: CPU ${missingSummary.cpuBase}, PG ${missingSummary.powergridBase}, calibration ${missingSummary.calibrationCapacity}, turrets ${missingSummary.turretHardpoints}, launchers ${missingSummary.launcherHardpoints}, drone bay ${missingSummary.droneCapacity}, bandwidth ${missingSummary.droneBandwidth}.`
    );
    console.log(
      `Market hierarchy coverage: ${marketSummary.classified}/${hulls.length} classified, ${marketSummary.missingMarketGroup} without market group, ${marketSummary.missingPath} without ancestry, ${marketSummary.specialEdition} under CCP Special Edition Ships.`
    );
    const cargoSummary = summarizeCargoCapacity(hulls);
    console.log(
      `Base normal cargo capacity from CCP types.capacity: ${cargoSummary.missing} missing/null, ${cargoSummary.zero} explicit zero, ${cargoSummary.positive} positive.`
    );

    if (verified.length < 4) {
      console.warn(
        `Only verified ${verified.length} sample hull(s). Check whether sample names changed in the current SDE.`
      );
    }
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function downloadFile(url: string, targetPath: string) {
  console.log("Downloading latest official CCP SDE JSON Lines archive.");
  const response = await fetch(url, {
    headers: {
      accept: "application/zip",
      "user-agent": "VyrajCommandConsoleV2/fitting-hull-refresh"
    }
  });

  if (!response.ok) {
    throw new Error(`CCP SDE download failed with HTTP ${response.status}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, buffer);
}

async function extractArchive(zipPath: string, extractDir: string) {
  console.log("Extracting SDE archive in a temporary workspace.");
  await mkdir(extractDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xf", zipPath, "-C", extractDir], {
      stdio: "ignore"
    });

    child.once("error", (error) => {
      reject(
        new Error(
          `Unable to run tar for SDE extraction: ${error.message}. Install a tar-compatible extractor or extract the JSONL archive manually.`
        )
      );
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`SDE archive extraction failed with exit code ${code}.`));
      }
    });
  });
}

async function findRequiredSdeFiles(root: string) {
  const discovered = await findFilesByName(root, new Set([
    "categories.jsonl",
    "dogmaAttributes.jsonl",
    "groups.jsonl",
    "marketGroups.jsonl",
    "typeDogma.jsonl",
    "types.jsonl"
  ]));

  return {
    categories: requireSdeFile(discovered, "categories.jsonl"),
    dogmaAttributes: requireSdeFile(discovered, "dogmaAttributes.jsonl"),
    groups: requireSdeFile(discovered, "groups.jsonl"),
    marketGroups: requireSdeFile(discovered, "marketGroups.jsonl"),
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

async function readDogmaAttributeNames(filePath: string) {
  const names = new Map<number, string>();

  for await (const attribute of readJsonLines<SdeDogmaAttribute>(filePath)) {
    if (typeof attribute._key === "number" && attribute.name) {
      names.set(attribute._key, attribute.name);
    }
  }

  return names;
}

function validateFittingAttributes(attributeNames: Map<number, string>) {
  for (const attribute of Object.values(FITTING_ATTRIBUTE_IDS)) {
    const actualName = attributeNames.get(attribute.id);

    if (actualName !== attribute.sdeName) {
      throw new Error(
        `Dogma attribute ${attribute.id} was expected to be ${attribute.sdeName}, but SDE reported ${actualName || "missing"}.`
      );
    }
  }
}

async function readCategoryNames(filePath: string) {
  const names = new Map<number, string>();

  for await (const category of readJsonLines<SdeCategory>(filePath)) {
    if (category.published === false) {
      continue;
    }

    names.set(category._key, getEnglishName(category.name));
  }

  return names;
}

async function readShipGroups(filePath: string) {
  const groups = new Map<number, {
    categoryId: number;
    groupName: string;
  }>();

  for await (const group of readJsonLines<SdeGroup>(filePath)) {
    if (group.categoryID !== shipCategoryId || group.published === false) {
      continue;
    }

    groups.set(group._key, {
      categoryId: group.categoryID,
      groupName: getEnglishName(group.name)
    });
  }

  return groups;
}

type MarketGroupRecord = {
  marketGroupId: number;
  marketGroupName: string;
  parentGroupId: number | null;
};

type MarketGroupPath = {
  ids: number[];
  names: string[];
};

async function readMarketGroups(filePath: string) {
  const marketGroups = new Map<number, MarketGroupRecord>();

  for await (const marketGroup of readJsonLines<SdeMarketGroup>(filePath)) {
    marketGroups.set(marketGroup._key, {
      marketGroupId: marketGroup._key,
      marketGroupName: getEnglishName(marketGroup.name),
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
          `CCP market group ancestry contains a cycle at market group ${currentId}.`
        );
      }

      visited.add(currentId);
      const current = marketGroups.get(currentId);

      if (!current) {
        throw new Error(
          `CCP market group ancestry references missing market group ${currentId}.`
        );
      }

      reversedPath.push(current);
      currentId = current.parentGroupId;
    }

    const path = reversedPath.reverse();
    paths.set(marketGroupId, {
      ids: path.map((marketGroup) => marketGroup.marketGroupId),
      names: path.map((marketGroup) => marketGroup.marketGroupName)
    });
  }

  return paths;
}

async function readPublishedShips(
  filePath: string,
  shipGroups: Map<number, { categoryId: number; groupName: string }>,
  categoryNames: Map<number, string>,
  marketGroups: Map<number, MarketGroupRecord>,
  marketGroupPaths: Map<number, MarketGroupPath>
) {
  const ships = new Map<number, {
    categoryName: string;
    groupId: number;
    groupName: string;
    marketGroupId: number | null;
    marketGroupName: string | null;
    marketGroupPathIds: number[];
    marketGroupPathNames: string[];
    cargoCapacityBase: number | null;
    typeId: number;
    typeName: string;
  }>();

  for await (const type of readJsonLines<SdeType>(filePath)) {
    const group = shipGroups.get(type.groupID);

    if (!group || type.published === false) {
      continue;
    }

    const marketGroupId =
      typeof type.marketGroupID === "number" ? type.marketGroupID : null;
    const marketGroup =
      marketGroupId === null ? null : marketGroups.get(marketGroupId) ?? null;
    const marketGroupPath =
      marketGroupId === null ? null : marketGroupPaths.get(marketGroupId) ?? null;

    if (marketGroupId !== null && (!marketGroup || !marketGroupPath)) {
      throw new Error(
        `Published ship type ${type._key} references missing market group ${marketGroupId}.`
      );
    }

    ships.set(type._key, {
      cargoCapacityBase: readOptionalNonnegativeNumber(
        type.capacity,
        `ship type ${type._key} capacity`
      ),
      categoryName: categoryNames.get(group.categoryId) || "Ship",
      groupId: type.groupID,
      groupName: group.groupName,
      marketGroupId,
      marketGroupName: marketGroup?.marketGroupName ?? null,
      marketGroupPathIds: marketGroupPath?.ids ?? [],
      marketGroupPathNames: marketGroupPath?.names ?? [],
      typeId: type._key,
      typeName: getEnglishName(type.name)
    });
  }

  return ships;
}

async function readHullDogmaAttributes(
  filePath: string,
  ships: Map<number, unknown>
) {
  const shipTypeIds = new Set(ships.keys());
  const attributes = new Map<number, {
    calibrationCapacity: number | null;
    cargoCapacityDogma: number | null;
    cpuBase: number | null;
    droneBandwidth: number | null;
    droneCapacity: number | null;
    highSlots: number;
    launcherHardpoints: number | null;
    lowSlots: number;
    midSlots: number;
    powergridBase: number | null;
    rigSlots: number;
    rigSize: number | null;
    turretHardpoints: number | null;
  }>();

  for await (const typeDogma of readJsonLines<SdeTypeDogma>(filePath)) {
    if (!shipTypeIds.has(typeDogma._key)) {
      continue;
    }

    const attributeValues = new Map(
      (typeDogma.dogmaAttributes || []).map((attribute) => [
        attribute.attributeID,
        attribute.value
      ])
    );

    attributes.set(typeDogma._key, {
      calibrationCapacity: readNullableInteger(attributeValues, FITTING_ATTRIBUTE_IDS.calibrationCapacity.id),
      cargoCapacityDogma: readNullableNumber(attributeValues, FITTING_ATTRIBUTE_IDS.cargoCapacityBase.id),
      cpuBase: readNullableNumber(attributeValues, FITTING_ATTRIBUTE_IDS.cpuBase.id),
      droneBandwidth: readNullableNumber(attributeValues, FITTING_ATTRIBUTE_IDS.droneBandwidth.id),
      droneCapacity: readNullableNumber(attributeValues, FITTING_ATTRIBUTE_IDS.droneCapacity.id),
      highSlots: readSlotValue(attributeValues, FITTING_ATTRIBUTE_IDS.highSlots.id),
      launcherHardpoints: readNullableInteger(attributeValues, FITTING_ATTRIBUTE_IDS.launcherHardpoints.id),
      lowSlots: readSlotValue(attributeValues, FITTING_ATTRIBUTE_IDS.lowSlots.id),
      midSlots: readSlotValue(attributeValues, FITTING_ATTRIBUTE_IDS.midSlots.id),
      powergridBase: readNullableNumber(attributeValues, FITTING_ATTRIBUTE_IDS.powergridBase.id),
      rigSlots: readSlotValue(attributeValues, FITTING_ATTRIBUTE_IDS.rigSlots.id),
      rigSize: readNullableInteger(attributeValues, FITTING_ATTRIBUTE_IDS.rigSize.id),
      turretHardpoints: readNullableInteger(attributeValues, FITTING_ATTRIBUTE_IDS.turretHardpoints.id)
    });
  }

  return attributes;
}

function validateCargoCapacityMatch(
  ship: { cargoCapacityBase: number | null; typeId: number; typeName: string },
  dogmaCapacity: number | null
) {
  if (
    ship.cargoCapacityBase !== null &&
    dogmaCapacity !== null &&
    ship.cargoCapacityBase !== dogmaCapacity
  ) {
    throw new Error(
      `Ship ${ship.typeId}/${ship.typeName} types.capacity ${ship.cargoCapacityBase} did not match Dogma attribute 38/capacity ${dogmaCapacity}. Database mutation was skipped.`
    );
  }
}

function readSlotValue(values: Map<number, number>, attributeId: number) {
  const value = values.get(attributeId);

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value || 0));
}

function readNullableNumber(
  values: Map<number, number>,
  attributeId: number
): number | null {
  const value = values.get(attributeId);

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function readOptionalNonnegativeNumber(
  value: number | undefined,
  label: string
): number | null {
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

function readNullableInteger(
  values: Map<number, number>,
  attributeId: number
): number | null {
  const value = readNullableNumber(values, attributeId);

  if (value === null) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

async function upsertFittingHulls(hulls: FittingHullRecord[]) {
  const result = {
    created: 0,
    updated: 0
  };

  for (const hull of hulls) {
    const existing = await prisma.fittingHull.findUnique({
      where: { typeId: hull.typeId },
      select: { id: true }
    });

    if (existing) {
      await prisma.fittingHull.update({
        where: { id: existing.id },
        data: hull
      });
      result.updated += 1;
      continue;
    }

    await prisma.fittingHull.create({
      data: hull
    });
    result.created += 1;
  }

  return result;
}

function verifySampleHulls(hulls: FittingHullRecord[]) {
  const hullsByName = new Map(
    hulls.map((hull) => [hull.typeName.toLocaleLowerCase("en-US"), hull])
  );

  return verificationShipNames
    .map((shipName) => hullsByName.get(shipName.toLocaleLowerCase("en-US")))
    .filter((hull): hull is FittingHullRecord => Boolean(hull));
}

function summarizeMissingBaseResources(hulls: FittingHullRecord[]) {
  return hulls.reduce(
    (summary, hull) => ({
      calibrationCapacity:
        summary.calibrationCapacity + Number(hull.calibrationCapacity === null),
      cpuBase: summary.cpuBase + Number(hull.cpuBase === null),
      droneBandwidth: summary.droneBandwidth + Number(hull.droneBandwidth === null),
      droneCapacity: summary.droneCapacity + Number(hull.droneCapacity === null),
      launcherHardpoints:
        summary.launcherHardpoints + Number(hull.launcherHardpoints === null),
      powergridBase: summary.powergridBase + Number(hull.powergridBase === null),
      turretHardpoints:
        summary.turretHardpoints + Number(hull.turretHardpoints === null)
    }),
    {
      calibrationCapacity: 0,
      cpuBase: 0,
      droneBandwidth: 0,
      droneCapacity: 0,
      launcherHardpoints: 0,
      powergridBase: 0,
      turretHardpoints: 0
    }
  );
}

function summarizeMarketGroupCoverage(hulls: FittingHullRecord[]) {
  return hulls.reduce(
    (summary, hull) => ({
      classified:
        summary.classified + Number(hull.marketGroupPathIds.length > 0),
      missingMarketGroup:
        summary.missingMarketGroup + Number(hull.marketGroupId === null),
      missingPath:
        summary.missingPath + Number(hull.marketGroupPathIds.length === 0),
      specialEdition:
        summary.specialEdition +
        Number(hull.marketGroupPathNames.includes("Special Edition Ships"))
    }),
    {
      classified: 0,
      missingMarketGroup: 0,
      missingPath: 0,
      specialEdition: 0
    }
  );
}

function summarizeCargoCapacity(hulls: FittingHullRecord[]) {
  return hulls.reduce(
    (summary, hull) => ({
      missing: summary.missing + Number(hull.cargoCapacityBase === null),
      positive:
        summary.positive + Number((hull.cargoCapacityBase ?? 0) > 0),
      zero: summary.zero + Number(hull.cargoCapacityBase === 0)
    }),
    { missing: 0, positive: 0, zero: 0 }
  );
}

function formatNullableValue(value: number | null) {
  return value === null ? "missing" : value;
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

function getEnglishName(value: LocalizedName | undefined) {
  if (!value) {
    return "";
  }

  return value.en || Object.values(value).find(Boolean) || "";
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Fitting hull refresh failed."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
