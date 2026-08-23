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
const DATABASE_BATCH_SIZE = 250;
const BLUEPRINT_CATEGORY_ID = 9;
const ABYSSAL_META_GROUP_ID = 15;

const VERIFICATION_ITEMS = [
  { name: "Caldari Navy Antimatter Charge M", specializedCache: "charge" },
  { name: "Caldari Navy Scourge Heavy Missile", specializedCache: "charge" },
  { name: "Navy Cap Booster 400", specializedCache: "charge" },
  { name: "Nanite Repair Paste", specializedCache: "charge" },
  { name: "Optimal Range Script", specializedCache: "charge" },
  { name: "Sisters Core Scanner Probe", specializedCache: "charge" },
  { name: "Warp Disrupt Probe", specializedCache: "charge" },
  { name: "Mobile Depot", specializedCache: null },
  { name: "Mobile Tractor Unit", specializedCache: null },
  { name: "Noise-5 'Needlejack' Filament", specializedCache: null },
  { name: "Strong Exile Booster", specializedCache: null },
  { name: "High-grade Snake Alpha", specializedCache: null },
  { name: "10MN Afterburner II", specializedCache: "module" },
  { name: "Medium Standard Container", specializedCache: null }
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
  name?: LocalizedName;
  packagedVolume?: number;
  published?: boolean;
  techLevel?: number;
  volume?: number;
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
  categoryName: string;
  groupId: number;
  groupName: string;
  published: boolean;
  publishedHierarchy: boolean;
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

type FittingCargoItemRecord = {
  categoryId: number;
  categoryName: string;
  groupId: number;
  groupName: string;
  lastRefreshedAt: Date;
  marketGroupId: number | null;
  marketGroupName: string | null;
  marketGroupPathIds: number[];
  marketGroupPathNames: string[];
  metaGroupId: number | null;
  metaGroupName: string | null;
  packagedVolume: number | null;
  techLevel: number | null;
  typeId: number;
  typeName: string;
  volume: number | null;
};

async function main() {
  console.log("Refreshing Fitting Bay cargo-item identity from CCP SDE JSON Lines.");
  console.log(`SDE source: ${SDE_JSONL_ZIP_URL}`);

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is required to refresh Fitting Bay cargo-item data."
    );
  }

  const tempRoot = await mkdtemp(
    path.join(tmpdir(), "vyraj-fitting-cargo-items-sde-")
  );

  try {
    const zipPath = path.join(tempRoot, "sde-jsonl.zip");
    const extractDir = path.join(tempRoot, "sde-jsonl");

    await downloadFile(SDE_JSONL_ZIP_URL, zipPath);
    await extractArchive(zipPath, extractDir);

    const files = await findRequiredSdeFiles(extractDir);
    const categories = await readCategories(files.categories);
    const groups = await readGroups(files.groups, categories);
    const marketGroups = await readMarketGroups(files.marketGroups);
    const marketGroupPaths = buildMarketGroupPaths(marketGroups);
    const metaGroupNames = await readEnglishNames(files.metaGroups);
    const classification = await readCargoItems({
      categories,
      filePath: files.types,
      groups,
      marketGroupPaths,
      marketGroups,
      metaGroupNames,
      refreshedAt: new Date()
    });

    validateSourcePopulation(classification.items, categories, groups);
    logClassificationSummary(classification);
    logDuplicateNames(classification.items);
    logVerificationSamples(classification.items);

    const result = await synchronizeFittingCargoItems(classification.items);
    await logSpecializedCacheVerification(classification.items);
    logImportSummary(classification.items, result);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function downloadFile(url: string, targetPath: string) {
  console.log("Downloading latest official CCP SDE JSON Lines archive.");
  const response = await fetch(url, {
    headers: {
      accept: "application/zip",
      "user-agent": "VyrajCommandConsoleV2/fitting-cargo-item-refresh"
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
      "groups.jsonl",
      "marketGroups.jsonl",
      "metaGroups.jsonl",
      "types.jsonl"
    ])
  );

  return {
    categories: requireSdeFile(discovered, "categories.jsonl"),
    groups: requireSdeFile(discovered, "groups.jsonl"),
    marketGroups: requireSdeFile(discovered, "marketGroups.jsonl"),
    metaGroups: requireSdeFile(discovered, "metaGroups.jsonl"),
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
    const published = category.published === true;
    const categoryName = published
      ? requireEnglishName(category.name, `published category ${category._key}`)
      : getEnglishName(category.name);

    categories.set(category._key, {
      categoryId: category._key,
      categoryName,
      published
    });
  }

  if (!categories.size) {
    throw new Error(
      "CCP SDE produced zero categories. Database mutation was skipped."
    );
  }

  return categories;
}

async function readGroups(
  filePath: string,
  categories: Map<number, CategoryRecord>
) {
  const groups = new Map<number, GroupRecord>();

  for await (const group of readJsonLines<SdeGroup>(filePath)) {
    const category = categories.get(group.categoryID);

    if (!category) {
      throw new Error(
        `CCP group ${group._key} references missing category ${group.categoryID}. Database mutation was skipped.`
      );
    }

    const published = group.published === true;
    const publishedHierarchy = published && category.published;
    const groupName = publishedHierarchy
      ? requireEnglishName(group.name, `published group ${group._key}`)
      : getEnglishName(group.name);

    groups.set(group._key, {
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      groupId: group._key,
      groupName,
      published,
      publishedHierarchy
    });
  }

  if (!groups.size) {
    throw new Error("CCP SDE produced zero groups. Database mutation was skipped.");
  }

  return groups;
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
      parentGroupId: readOptionalPositiveInteger(
        marketGroup.parentGroupID,
        `market group ${marketGroup._key} parentGroupID`
      )
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

async function readCargoItems({
  categories,
  filePath,
  groups,
  marketGroupPaths,
  marketGroups,
  metaGroupNames,
  refreshedAt
}: {
  categories: Map<number, CategoryRecord>;
  filePath: string;
  groups: Map<number, GroupRecord>;
  marketGroupPaths: Map<number, MarketGroupPath>;
  marketGroups: Map<number, MarketGroupRecord>;
  metaGroupNames: Map<number, string>;
  refreshedAt: Date;
}) {
  const items: FittingCargoItemRecord[] = [];
  const stats = {
    excludedByUnpublishedHierarchy: 0,
    missingEnglishName: 0,
    publishedTypes: 0,
    totalTypes: 0,
    unpublishedTypes: 0
  };

  for await (const type of readJsonLines<SdeType>(filePath)) {
    stats.totalTypes += 1;

    if (type.published !== true) {
      stats.unpublishedTypes += 1;
      continue;
    }

    stats.publishedTypes += 1;
    const group = groups.get(type.groupID);

    if (!group) {
      throw new Error(
        `Published type ${type._key} references missing group ${type.groupID}. Database mutation was skipped.`
      );
    }

    const category = categories.get(group.categoryId);

    if (!group.publishedHierarchy || !category?.published) {
      stats.excludedByUnpublishedHierarchy += 1;
      continue;
    }

    const typeName = type.name?.en?.trim();

    if (!typeName) {
      stats.missingEnglishName += 1;
      continue;
    }

    const marketGroupId = readOptionalPositiveInteger(
      type.marketGroupID,
      `type ${type._key} marketGroupID`
    );
    const marketGroup =
      marketGroupId === null ? null : marketGroups.get(marketGroupId) ?? null;
    const marketPath =
      marketGroupId === null
        ? null
        : marketGroupPaths.get(marketGroupId) ?? null;

    if (marketGroupId !== null && (!marketGroup || !marketPath)) {
      throw new Error(
        `Published type ${type._key}/${typeName} references missing market group ${marketGroupId}. Database mutation was skipped.`
      );
    }

    const metaGroupId = readOptionalPositiveInteger(
      type.metaGroupID,
      `type ${type._key} metaGroupID`
    );
    const metaGroupName =
      metaGroupId === null ? null : metaGroupNames.get(metaGroupId) ?? null;

    if (metaGroupId !== null && !metaGroupName) {
      throw new Error(
        `Published type ${type._key}/${typeName} references missing meta group ${metaGroupId}. Database mutation was skipped.`
      );
    }

    items.push({
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      groupId: group.groupId,
      groupName: group.groupName,
      lastRefreshedAt: refreshedAt,
      marketGroupId,
      marketGroupName: marketGroup?.marketGroupName ?? null,
      marketGroupPathIds: marketPath?.ids ?? [],
      marketGroupPathNames: marketPath?.names ?? [],
      metaGroupId,
      metaGroupName,
      packagedVolume: readOptionalNonnegativeNumber(
        type.packagedVolume,
        `type ${type._key} packagedVolume`
      ),
      techLevel: readOptionalInteger(
        type.techLevel,
        `type ${type._key} techLevel`
      ),
      typeId: type._key,
      typeName,
      volume: readOptionalNonnegativeNumber(
        type.volume,
        `type ${type._key} volume`
      )
    });
  }

  return {
    items: items.sort(
      (left, right) =>
        left.categoryName.localeCompare(right.categoryName, "en-US") ||
        left.groupName.localeCompare(right.groupName, "en-US") ||
        left.typeName.localeCompare(right.typeName, "en-US") ||
        left.typeId - right.typeId
    ),
    stats
  };
}

function validateSourcePopulation(
  items: FittingCargoItemRecord[],
  categories: Map<number, CategoryRecord>,
  groups: Map<number, GroupRecord>
) {
  if (!items.length) {
    throw new Error(
      "CCP SDE produced zero authoritative cargo-item identities. Database mutation was skipped."
    );
  }

  const typeIds = new Set<number>();

  for (const item of items) {
    const category = categories.get(item.categoryId);
    const group = groups.get(item.groupId);

    if (
      !category?.published ||
      !group?.publishedHierarchy ||
      group.categoryId !== item.categoryId
    ) {
      throw new Error(
        `Cargo item ${item.typeId}/${item.typeName} is not reachable through a published group/category hierarchy. Database mutation was skipped.`
      );
    }

    if (typeIds.has(item.typeId)) {
      throw new Error(
        `Duplicate cargo-item type ID ${item.typeId} reached the authoritative population. Database mutation was skipped.`
      );
    }

    if (
      item.marketGroupPathIds.length !== item.marketGroupPathNames.length
    ) {
      throw new Error(
        `Cargo item ${item.typeId}/${item.typeName} has inconsistent market ancestry. Database mutation was skipped.`
      );
    }

    if (
      item.marketGroupId !== null &&
      item.marketGroupPathIds.at(-1) !== item.marketGroupId
    ) {
      throw new Error(
        `Cargo item ${item.typeId}/${item.typeName} market ancestry does not terminate at market group ${item.marketGroupId}. Database mutation was skipped.`
      );
    }

    typeIds.add(item.typeId);
  }
}

async function synchronizeFittingCargoItems(items: FittingCargoItemRecord[]) {
  const existing = await prisma.fittingCargoItem.findMany({
    select: {
      categoryId: true,
      categoryName: true,
      groupId: true,
      groupName: true,
      marketGroupId: true,
      marketGroupName: true,
      marketGroupPathIds: true,
      marketGroupPathNames: true,
      metaGroupId: true,
      metaGroupName: true,
      packagedVolume: true,
      techLevel: true,
      typeId: true,
      typeName: true,
      volume: true
    }
  });
  const existingByTypeId = new Map(
    existing.map((item) => [item.typeId, item])
  );
  const incomingTypeIds = new Set(items.map((item) => item.typeId));
  const created = items.filter((item) => !existingByTypeId.has(item.typeId));
  const changed = items.filter((item) => {
    const current = existingByTypeId.get(item.typeId);
    return current ? cargoItemHasChanged(current, item) : false;
  });
  const unchanged = items.filter((item) => {
    const current = existingByTypeId.get(item.typeId);
    return current ? !cargoItemHasChanged(current, item) : false;
  });
  const staleTypeIds = existing
    .filter((item) => !incomingTypeIds.has(item.typeId))
    .map((item) => item.typeId);

  for (const batch of chunk(created, DATABASE_BATCH_SIZE)) {
    await prisma.fittingCargoItem.createMany({ data: batch });
  }

  for (const batch of chunk(changed, DATABASE_BATCH_SIZE)) {
    await prisma.$transaction(
      batch.map((item) =>
        prisma.fittingCargoItem.update({
          data: item,
          where: { typeId: item.typeId }
        })
      )
    );
  }

  for (const batch of chunk(unchanged, DATABASE_BATCH_SIZE)) {
    await prisma.fittingCargoItem.updateMany({
      data: { lastRefreshedAt: items[0].lastRefreshedAt },
      where: { typeId: { in: batch.map((item) => item.typeId) } }
    });
  }

  let removed = 0;

  // Stale rows are pruned only after all incoming rows synchronize successfully.
  for (const batch of chunk(staleTypeIds, DATABASE_BATCH_SIZE)) {
    const result = await prisma.fittingCargoItem.deleteMany({
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

function cargoItemHasChanged(
  current: Omit<FittingCargoItemRecord, "lastRefreshedAt">,
  incoming: FittingCargoItemRecord
) {
  return (
    current.typeName !== incoming.typeName ||
    current.categoryId !== incoming.categoryId ||
    current.categoryName !== incoming.categoryName ||
    current.groupId !== incoming.groupId ||
    current.groupName !== incoming.groupName ||
    current.marketGroupId !== incoming.marketGroupId ||
    current.marketGroupName !== incoming.marketGroupName ||
    !arraysEqual(current.marketGroupPathIds, incoming.marketGroupPathIds) ||
    !arraysEqual(current.marketGroupPathNames, incoming.marketGroupPathNames) ||
    current.metaGroupId !== incoming.metaGroupId ||
    current.metaGroupName !== incoming.metaGroupName ||
    current.techLevel !== incoming.techLevel ||
    current.volume !== incoming.volume ||
    current.packagedVolume !== incoming.packagedVolume
  );
}

function logClassificationSummary(
  classification: Awaited<ReturnType<typeof readCargoItems>>
) {
  const { items, stats } = classification;
  const browserSafe = items.filter(isInitialBrowserSafeCargoItem);

  console.log("Authoritative cargo-item identity classification:");
  console.log(`- All SDE types observed: ${stats.totalTypes}`);
  console.log(`- Published types observed: ${stats.publishedTypes}`);
  console.log(`- Unpublished types excluded: ${stats.unpublishedTypes}`);
  console.log(
    `- Published types excluded by unpublished group/category: ${stats.excludedByUnpublishedHierarchy}`
  );
  console.log(
    `- Published hierarchy types excluded for missing canonical English name: ${stats.missingEnglishName}`
  );
  console.log(`- Authoritative cargo-item identities imported: ${items.length}`);
  console.log(
    `- Initial derived browser-safe candidates: ${browserSafe.length}. This is policy, not persisted metadata.`
  );
  console.log(
    `- Package-sensitive records retained for resolver review: ${items.filter(isPackageSensitive).length}`
  );
  console.log(
    `- Blueprint-category records retained for diagnostics: ${items.filter((item) => item.categoryId === BLUEPRINT_CATEGORY_ID).length}`
  );
  console.log(
    `- Abyssal-meta records retained for diagnostics: ${items.filter((item) => item.metaGroupId === ABYSSAL_META_GROUP_ID).length}`
  );
}

// This is the initial future browser policy only. Cache membership stays broad.
function isInitialBrowserSafeCargoItem(item: FittingCargoItemRecord) {
  return (
    item.marketGroupId !== null &&
    item.volume !== null &&
    item.volume > 0 &&
    !isPackageSensitive(item) &&
    item.categoryId !== BLUEPRINT_CATEGORY_ID &&
    item.metaGroupId !== ABYSSAL_META_GROUP_ID
  );
}

function isPackageSensitive(item: FittingCargoItemRecord) {
  return (
    item.volume !== null &&
    item.packagedVolume !== null &&
    item.volume !== item.packagedVolume
  );
}

function logDuplicateNames(items: FittingCargoItemRecord[]) {
  const byName = new Map<string, FittingCargoItemRecord[]>();

  for (const item of items) {
    const matches = byName.get(item.typeName) ?? [];
    matches.push(item);
    byName.set(item.typeName, matches);
  }

  const duplicates = Array.from(byName.entries())
    .filter(([, matches]) => matches.length > 1)
    .sort(([left], [right]) => left.localeCompare(right, "en-US"));
  const affectedTypeCount = duplicates.reduce(
    (total, [, matches]) => total + matches.length,
    0
  );

  console.log(
    `Duplicate canonical English names: ${duplicates.length} name(s), ${affectedTypeCount} affected type(s). FittingCargoItem.typeName is intentionally not unique.`
  );

  for (const [typeName, matches] of duplicates.slice(0, 12)) {
    console.log(
      `- ${typeName}: ${matches.map((item) => item.typeId).join(", ")}`
    );
  }
}

function logVerificationSamples(items: FittingCargoItemRecord[]) {
  console.log("Representative cargo-item verification from CCP SDE:");

  for (const verification of VERIFICATION_ITEMS) {
    const matches = items.filter((item) => item.typeName === verification.name);

    if (matches.length !== 1) {
      console.warn(
        `- ${verification.name}: expected one canonical match, found ${matches.length}.`
      );
      continue;
    }

    const item = matches[0];
    console.log(
      `- ${item.typeId}/${item.typeName}; published type/group/category verified; category ${item.categoryId}/${item.categoryName}; group ${item.groupId}/${item.groupName}; market ${item.marketGroupPathNames.join(" > ") || "missing"}; volume ${formatNullable(item.volume)} m3; packaged ${formatNullable(item.packagedVolume)} m3; meta ${formatMetadata(item.metaGroupId, item.metaGroupName)}; tech ${formatNullable(item.techLevel)}; package-sensitive ${isPackageSensitive(item) ? "yes" : "no"}.`
    );
  }
}

async function logSpecializedCacheVerification(items: FittingCargoItemRecord[]) {
  const representativeTypeIds = items
    .filter((item) =>
      VERIFICATION_ITEMS.some((verification) => verification.name === item.typeName)
    )
    .map((item) => item.typeId);
  const [modules, charges, drones, hulls] = await Promise.all([
    prisma.fittingModule.findMany({
      select: { typeId: true },
      where: { typeId: { in: representativeTypeIds } }
    }),
    prisma.fittingCharge.findMany({
      select: { typeId: true },
      where: { typeId: { in: representativeTypeIds } }
    }),
    prisma.fittingDrone.findMany({
      select: { typeId: true },
      where: { typeId: { in: representativeTypeIds } }
    }),
    prisma.fittingHull.findMany({
      select: { typeId: true },
      where: { typeId: { in: representativeTypeIds } }
    })
  ]);
  const cacheIds = {
    charge: new Set(charges.map((item) => item.typeId)),
    drone: new Set(drones.map((item) => item.typeId)),
    hull: new Set(hulls.map((item) => item.typeId)),
    module: new Set(modules.map((item) => item.typeId))
  };

  console.log("Representative specialized-cache overlap:");

  for (const verification of VERIFICATION_ITEMS) {
    const matches = items.filter((item) => item.typeName === verification.name);

    if (matches.length !== 1) {
      continue;
    }

    const item = matches[0];
    const present = Object.entries(cacheIds)
      .filter(([, ids]) => ids.has(item.typeId))
      .map(([name]) => name);
    console.log(`- ${item.typeName}: ${present.join(", ") || "none"}.`);

    if (
      verification.specializedCache !== null &&
      !cacheIds[verification.specializedCache].has(item.typeId)
    ) {
      console.warn(
        `  Expected existing ${verification.specializedCache} cache coverage was not present; cargo import remains independent.`
      );
    }
  }
}

function logImportSummary(
  items: FittingCargoItemRecord[],
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
    `Volume storage: ${items.filter((item) => item.volume === null).length} missing/null, ${items.filter((item) => item.volume === 0).length} explicit zero, ${items.filter((item) => (item.volume ?? 0) > 0).length} positive.`
  );
  console.log(
    `Packaged-volume storage: ${items.filter((item) => item.packagedVolume === null).length} missing/null, ${items.filter((item) => item.packagedVolume === 0).length} explicit zero, ${items.filter((item) => (item.packagedVolume ?? 0) > 0).length} positive.`
  );
  console.log(
    `Market ancestry: ${items.filter((item) => item.marketGroupPathIds.length > 0).length} classified, ${items.filter((item) => item.marketGroupId === null).length} without a market group.`
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
  const name = value?.en?.trim();

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
      error instanceof Error
        ? error.message
        : "Fitting cargo-item refresh failed."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
