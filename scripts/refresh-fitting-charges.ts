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
import {
  CHARGE_CATEGORY_ID,
  CHARGE_GROUP_ATTRIBUTES,
  CHARGE_SIZE_ATTRIBUTE,
  classifyModuleRack,
  MODULE_CATEGORY_ID,
  RACK_EFFECTS
} from "./lib/fitting-sde-classification";

const prisma = new PrismaClient();
const sdeJsonlZipUrl =
  "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";
const databaseBatchSize = 250;

const VERIFICATION_CHARGES = [
  { family: "projectile ammunition", names: ["EMP S"] },
  { family: "hybrid charge", names: ["Antimatter Charge S"] },
  { family: "laser crystal", names: ["Multifrequency S"] },
  { family: "light missile", names: ["Scourge Light Missile"] },
  { family: "rocket or torpedo", names: ["Scourge Rocket", "Scourge Torpedo"] },
  {
    family: "tracking or sensor script",
    names: ["Tracking Speed Script", "Scan Resolution Script"]
  },
  { family: "capacitor booster charge", names: ["Cap Booster 400"] },
  { family: "ancillary charge", names: ["Nanite Repair Paste"] },
  { family: "command burst charge", names: ["Shield Harmonizing Charge"] },
  { family: "scanner probe", names: ["Core Scanner Probe I"] },
  {
    family: "mining crystal",
    names: [
      "Simple Asteroid Mining Crystal Type A I",
      "Veldspar Mining Crystal I"
    ]
  }
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

type SdeDogmaEffect = {
  _key: number;
  name?: string;
};

type SdeDogmaUnit = {
  _key: number;
  name?: string;
};

type SdeNamedRecord = {
  _key: number;
  name?: LocalizedName;
};

type SdeTypeDogma = {
  _key: number;
  dogmaAttributes?: Array<{
    attributeID: number;
    value: number;
  }>;
  dogmaEffects?: Array<{
    effectID: number;
    isDefault?: boolean;
  }>;
};

type PublishedGroup = {
  categoryId: number;
  groupId: number;
  groupName: string;
};

type PublishedModuleType = {
  groupId: number;
  typeId: number;
  typeName: string;
};

type PublishedChargeType = {
  groupId: number;
  marketGroupId: number | null;
  metaGroupId: number | null;
  rawName: LocalizedName | undefined;
  rawTechLevel: number | undefined;
  rawVolume: number | undefined;
  typeId: number;
};

type FittingChargeRecord = {
  chargeSize: number | null;
  groupId: number;
  groupName: string;
  lastRefreshedAt: Date;
  marketGroupId: number | null;
  marketGroupName: string | null;
  metaGroupId: number | null;
  metaGroupName: string | null;
  techLevel: number | null;
  typeId: number;
  typeName: string;
  volume: number;
};

async function main() {
  console.log("Refreshing Fitting Bay charges from CCP SDE JSON Lines.");
  console.log(`SDE source: ${sdeJsonlZipUrl}`);

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required to refresh Fitting Bay charge data.");
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "vyraj-fitting-charges-sde-"));

  try {
    const zipPath = path.join(tempRoot, "sde-jsonl.zip");
    const extractDir = path.join(tempRoot, "sde-jsonl");

    await downloadFile(sdeJsonlZipUrl, zipPath);
    await extractArchive(zipPath, extractDir);

    const files = await findRequiredSdeFiles(extractDir);
    const categories = await readCategories(files.categories);
    validateCategories(categories);

    const attributeDefinitions = await readDogmaAttributes(files.dogmaAttributes);
    const effectDefinitions = await readDogmaEffects(files.dogmaEffects);
    const unitDefinitions = await readDogmaUnits(files.dogmaUnits);
    validateDogmaDefinitions(
      attributeDefinitions,
      effectDefinitions,
      unitDefinitions
    );

    const groups = await readGroups(files.groups);
    const types = await readTypes(files.types, groups.byId);
    const relevantTypeIds = new Set([
      ...types.publishedModules.keys(),
      ...types.publishedCharges.keys()
    ]);
    const typeDogma = await readRelevantTypeDogma(
      files.typeDogma,
      relevantTypeIds
    );
    const referencedChargeGroups = deriveReferencedChargeGroups(
      types.publishedModules,
      typeDogma
    );
    validateReferencedChargeGroups(
      referencedChargeGroups,
      groups.publishedChargeGroups
    );

    const marketGroupNames = await readEnglishNames(files.marketGroups);
    const metaGroupNames = await readEnglishNames(files.metaGroups);
    const refreshedAt = new Date();
    const charges = buildFittingCharges({
      marketGroupNames,
      metaGroupNames,
      publishedChargeGroups: groups.publishedChargeGroups,
      publishedChargeTypes: types.publishedCharges,
      referencedChargeGroups,
      refreshedAt,
      typeDogma
    });

    validateReferencedGroupsHaveCharges(
      charges,
      referencedChargeGroups,
      groups.publishedChargeGroups
    );

    if (!charges.length) {
      throw new Error(
        "CCP SDE produced zero authoritative fitting charges. Database mutation was skipped."
      );
    }

    logClassificationSummary({
      charges,
      groupStats: groups.stats,
      publishedChargeCandidateCount: types.publishedCharges.size,
      publishedChargeGroups: groups.publishedChargeGroups,
      referencedChargeGroups,
      typeStats: types.stats
    });
    logVerificationSamples(charges);

    const result = await synchronizeFittingCharges(charges);
    logImportSummary(charges, result);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function downloadFile(url: string, targetPath: string) {
  console.log("Downloading latest official CCP SDE JSON Lines archive.");
  const response = await fetch(url, {
    headers: {
      accept: "application/zip",
      "user-agent": "VyrajCommandConsoleV2/fitting-charge-refresh"
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
  const requiredNames = new Set([
    "categories.jsonl",
    "dogmaAttributes.jsonl",
    "dogmaEffects.jsonl",
    "dogmaUnits.jsonl",
    "groups.jsonl",
    "marketGroups.jsonl",
    "metaGroups.jsonl",
    "typeDogma.jsonl",
    "types.jsonl"
  ]);
  const discovered = await findFilesByName(root, requiredNames);

  return {
    categories: requireSdeFile(discovered, "categories.jsonl"),
    dogmaAttributes: requireSdeFile(discovered, "dogmaAttributes.jsonl"),
    dogmaEffects: requireSdeFile(discovered, "dogmaEffects.jsonl"),
    dogmaUnits: requireSdeFile(discovered, "dogmaUnits.jsonl"),
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
  const categories = new Map<number, SdeCategory>();

  for await (const category of readJsonLines<SdeCategory>(filePath)) {
    categories.set(category._key, category);
  }

  return categories;
}

function validateCategories(categories: Map<number, SdeCategory>) {
  validatePublishedCategory(categories, MODULE_CATEGORY_ID, "Module");
  validatePublishedCategory(categories, CHARGE_CATEGORY_ID, "Charge");
}

function validatePublishedCategory(
  categories: Map<number, SdeCategory>,
  categoryId: number,
  expectedName: string
) {
  const category = categories.get(categoryId);
  const categoryName = getEnglishName(category?.name);

  if (categoryName !== expectedName || category?.published !== true) {
    throw new Error(
      `CCP category ${categoryId} was expected to be published ${expectedName}, but SDE reported ${categoryName || "missing"} (${formatPublished(category?.published)}). Database mutation was skipped.`
    );
  }
}

async function readDogmaAttributes(filePath: string) {
  const definitions = new Map<number, SdeDogmaAttribute>();

  for await (const attribute of readJsonLines<SdeDogmaAttribute>(filePath)) {
    definitions.set(attribute._key, attribute);
  }

  return definitions;
}

async function readDogmaEffects(filePath: string) {
  const definitions = new Map<number, SdeDogmaEffect>();

  for await (const effect of readJsonLines<SdeDogmaEffect>(filePath)) {
    definitions.set(effect._key, effect);
  }

  return definitions;
}

async function readDogmaUnits(filePath: string) {
  const definitions = new Map<number, SdeDogmaUnit>();

  for await (const unit of readJsonLines<SdeDogmaUnit>(filePath)) {
    definitions.set(unit._key, unit);
  }

  return definitions;
}

function validateDogmaDefinitions(
  attributes: Map<number, SdeDogmaAttribute>,
  effects: Map<number, SdeDogmaEffect>,
  units: Map<number, SdeDogmaUnit>
) {
  for (const [idText, expected] of Object.entries(RACK_EFFECTS)) {
    validateCanonicalName(effects, Number(idText), expected.name, "effect");
  }

  for (const expected of CHARGE_GROUP_ATTRIBUTES) {
    validateCanonicalName(attributes, expected.id, expected.name, "attribute");
  }

  const chargeSize = attributes.get(CHARGE_SIZE_ATTRIBUTE.id);
  validateCanonicalName(
    attributes,
    CHARGE_SIZE_ATTRIBUTE.id,
    CHARGE_SIZE_ATTRIBUTE.name,
    "attribute"
  );

  if ((chargeSize?.unitID ?? null) !== CHARGE_SIZE_ATTRIBUTE.unitId) {
    throw new Error(
      `Dogma attribute ${CHARGE_SIZE_ATTRIBUTE.id} (${CHARGE_SIZE_ATTRIBUTE.name}) expected unit ${CHARGE_SIZE_ATTRIBUTE.unitId}, but SDE reported ${formatNullable(chargeSize?.unitID)}. Database mutation was skipped.`
    );
  }

  if (chargeSize?.defaultValue !== CHARGE_SIZE_ATTRIBUTE.defaultValue) {
    throw new Error(
      `Dogma attribute ${CHARGE_SIZE_ATTRIBUTE.id} (${CHARGE_SIZE_ATTRIBUTE.name}) expected default ${CHARGE_SIZE_ATTRIBUTE.defaultValue}, but SDE reported ${formatNullable(chargeSize?.defaultValue)}. Database mutation was skipped.`
    );
  }

  validateCanonicalName(
    units,
    CHARGE_SIZE_ATTRIBUTE.unitId,
    "Sizeclass",
    "unit"
  );
}

function validateCanonicalName(
  records: Map<number, { name?: string }>,
  id: number,
  expectedName: string,
  kind: string
) {
  const actualName = records.get(id)?.name;

  if (actualName !== expectedName) {
    throw new Error(
      `Dogma ${kind} ${id} was expected to be ${expectedName}, but SDE reported ${actualName || "missing"}. Database mutation was skipped.`
    );
  }
}

async function readGroups(filePath: string) {
  const byId = new Map<number, SdeGroup>();
  const publishedChargeGroups = new Map<number, PublishedGroup>();
  let chargeCategoryGroups = 0;
  let unpublishedChargeGroups = 0;

  for await (const group of readJsonLines<SdeGroup>(filePath)) {
    byId.set(group._key, group);

    if (group.categoryID !== CHARGE_CATEGORY_ID) {
      continue;
    }

    chargeCategoryGroups += 1;

    if (group.published !== true) {
      unpublishedChargeGroups += 1;
      continue;
    }

    publishedChargeGroups.set(group._key, {
      categoryId: group.categoryID,
      groupId: group._key,
      groupName: requireEnglishName(group.name, `group ${group._key}`)
    });
  }

  return {
    byId,
    publishedChargeGroups,
    stats: { chargeCategoryGroups, unpublishedChargeGroups }
  };
}

async function readTypes(filePath: string, groups: Map<number, SdeGroup>) {
  const publishedModules = new Map<number, PublishedModuleType>();
  const publishedCharges = new Map<number, PublishedChargeType>();
  let chargeCategoryTypes = 0;
  let excludedByUnpublishedGroup = 0;
  let unpublishedChargeTypes = 0;

  for await (const type of readJsonLines<SdeType>(filePath)) {
    const group = groups.get(type.groupID);

    if (!group) {
      continue;
    }

    if (
      group.categoryID === MODULE_CATEGORY_ID &&
      group.published === true &&
      type.published === true
    ) {
      publishedModules.set(type._key, {
        groupId: type.groupID,
        typeId: type._key,
        typeName: requireEnglishName(type.name, `type ${type._key}`)
      });
    }

    if (group.categoryID !== CHARGE_CATEGORY_ID) {
      continue;
    }

    chargeCategoryTypes += 1;

    if (group.published !== true) {
      excludedByUnpublishedGroup += 1;
      continue;
    }

    if (type.published !== true) {
      unpublishedChargeTypes += 1;
      continue;
    }

    publishedCharges.set(type._key, {
      groupId: type.groupID,
      marketGroupId: readOptionalInteger(
        type.marketGroupID,
        `type ${type._key} marketGroupID`
      ),
      metaGroupId: readOptionalInteger(
        type.metaGroupID,
        `type ${type._key} metaGroupID`
      ),
      rawName: type.name,
      rawTechLevel: type.techLevel,
      rawVolume: type.volume,
      typeId: type._key
    });
  }

  return {
    publishedCharges,
    publishedModules,
    stats: {
      chargeCategoryTypes,
      excludedByUnpublishedGroup,
      unpublishedChargeTypes
    }
  };
}

async function readRelevantTypeDogma(
  filePath: string,
  relevantTypeIds: Set<number>
) {
  const dogma = new Map<number, SdeTypeDogma>();

  for await (const typeDogma of readJsonLines<SdeTypeDogma>(filePath)) {
    if (relevantTypeIds.has(typeDogma._key)) {
      dogma.set(typeDogma._key, typeDogma);
    }
  }

  return dogma;
}

function deriveReferencedChargeGroups(
  publishedModules: Map<number, PublishedModuleType>,
  typeDogma: Map<number, SdeTypeDogma>
) {
  const referenced = new Map<number, Set<number>>();
  const ambiguous: PublishedModuleType[] = [];
  let fittableModuleCount = 0;

  for (const moduleType of publishedModules.values()) {
    const dogma = typeDogma.get(moduleType.typeId);
    const classification = classifyModuleRack(dogma?.dogmaEffects);

    if (classification.kind === "none") {
      continue;
    }

    if (classification.kind === "ambiguous") {
      ambiguous.push(moduleType);
      continue;
    }

    if (classification.kind === "subsystem") {
      throw new Error(
        `Published Category 7 type ${moduleType.typeId}/${moduleType.typeName} unexpectedly uses subsystem rack effect 3772. Database mutation was skipped.`
      );
    }

    fittableModuleCount += 1;
    const attributes = new Map(
      (dogma?.dogmaAttributes || []).map((attribute) => [
        attribute.attributeID,
        attribute.value
      ])
    );

    for (const groupId of readChargeGroupIds(
      attributes,
      `${moduleType.typeId}/${moduleType.typeName}`
    )) {
      const moduleTypeIds = referenced.get(groupId) ?? new Set<number>();
      moduleTypeIds.add(moduleType.typeId);
      referenced.set(groupId, moduleTypeIds);
    }
  }

  if (ambiguous.length) {
    throw new Error(
      `CCP SDE contained ${ambiguous.length} published Category 7 type(s) with multiple fitting rack effects: ${formatTypes(ambiguous)}. Database mutation was skipped.`
    );
  }

  if (!fittableModuleCount) {
    throw new Error(
      "CCP SDE produced zero authoritative ship-fittable modules. Database mutation was skipped."
    );
  }

  console.log(`Authoritative ship-fittable modules classified: ${fittableModuleCount}.`);
  return referenced;
}

function readChargeGroupIds(values: Map<number, number>, moduleLabel: string) {
  const groupIds = CHARGE_GROUP_ATTRIBUTES.flatMap((attribute) => {
    const value = values.get(attribute.id);

    if (value === undefined || value === 0) {
      return [];
    }

    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      throw new Error(
        `Module ${moduleLabel} ${attribute.name} contains invalid group ID ${value}. Database mutation was skipped.`
      );
    }

    return [value];
  });

  return Array.from(new Set(groupIds)).sort((left, right) => left - right);
}

function validateReferencedChargeGroups(
  referenced: Map<number, Set<number>>,
  publishedChargeGroups: Map<number, PublishedGroup>
) {
  const invalid = Array.from(referenced.entries()).filter(
    ([groupId]) => !publishedChargeGroups.has(groupId)
  );

  if (invalid.length) {
    throw new Error(
      `Authoritative ship modules reference charge group(s) that are not published Category ${CHARGE_CATEGORY_ID}: ${invalid.map(([groupId, moduleIds]) => `${groupId} (modules ${Array.from(moduleIds).slice(0, 8).join(",")})`).join("; ")}. Database mutation was skipped.`
    );
  }
}

function buildFittingCharges({
  marketGroupNames,
  metaGroupNames,
  publishedChargeGroups,
  publishedChargeTypes,
  referencedChargeGroups,
  refreshedAt,
  typeDogma
}: {
  marketGroupNames: Map<number, string>;
  metaGroupNames: Map<number, string>;
  publishedChargeGroups: Map<number, PublishedGroup>;
  publishedChargeTypes: Map<number, PublishedChargeType>;
  referencedChargeGroups: Map<number, Set<number>>;
  refreshedAt: Date;
  typeDogma: Map<number, SdeTypeDogma>;
}) {
  const charges: FittingChargeRecord[] = [];

  for (const chargeType of publishedChargeTypes.values()) {
    if (!referencedChargeGroups.has(chargeType.groupId)) {
      continue;
    }

    const group = publishedChargeGroups.get(chargeType.groupId);

    if (!group || group.categoryId !== CHARGE_CATEGORY_ID) {
      throw new Error(
        `Selected charge ${chargeType.typeId} has an invalid Category 8 group. Database mutation was skipped.`
      );
    }

    const volume = requirePositiveNumber(
      chargeType.rawVolume,
      `charge ${chargeType.typeId} volume`
    );
    const attributes = new Map(
      (typeDogma.get(chargeType.typeId)?.dogmaAttributes || []).map(
        (attribute) => [attribute.attributeID, attribute.value]
      )
    );

    charges.push({
      chargeSize: readNullableNonnegativeInteger(
        attributes,
        CHARGE_SIZE_ATTRIBUTE.id,
        `charge ${chargeType.typeId} charge size`
      ),
      groupId: group.groupId,
      groupName: group.groupName,
      lastRefreshedAt: refreshedAt,
      marketGroupId: chargeType.marketGroupId,
      marketGroupName:
        chargeType.marketGroupId === null
          ? null
          : marketGroupNames.get(chargeType.marketGroupId) ?? null,
      metaGroupId: chargeType.metaGroupId,
      metaGroupName:
        chargeType.metaGroupId === null
          ? null
          : metaGroupNames.get(chargeType.metaGroupId) ?? null,
      techLevel: readOptionalInteger(
        chargeType.rawTechLevel,
        `charge ${chargeType.typeId} techLevel`
      ),
      typeId: chargeType.typeId,
      typeName: requireEnglishName(
        chargeType.rawName,
        `type ${chargeType.typeId}`
      ),
      volume
    });
  }

  charges.sort(
    (left, right) =>
      left.groupName.localeCompare(right.groupName, "en-US") ||
      left.typeName.localeCompare(right.typeName, "en-US")
  );

  return charges;
}

function validateReferencedGroupsHaveCharges(
  charges: FittingChargeRecord[],
  referencedGroups: Map<number, Set<number>>,
  publishedGroups: Map<number, PublishedGroup>
) {
  const populatedGroupIds = new Set(charges.map((charge) => charge.groupId));
  const emptyGroups = Array.from(referencedGroups.keys()).filter(
    (groupId) => !populatedGroupIds.has(groupId)
  );

  if (emptyGroups.length) {
    throw new Error(
      `Published Category 8 charge group(s) referenced by ship modules contained no published positive-volume charge types: ${emptyGroups.map((groupId) => `${groupId}/${publishedGroups.get(groupId)?.groupName ?? "unknown"}`).join(", ")}. Database mutation was skipped.`
    );
  }
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

function requirePositiveNumber(value: number | undefined, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `${label} must be a finite positive number, received ${formatNullable(value)}. Database mutation was skipped.`
    );
  }

  return value;
}

function readNullableNonnegativeInteger(
  values: Map<number, number>,
  attributeId: number,
  label: string
) {
  const value = values.get(attributeId);

  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `${label} must be a nonnegative integer, received ${value}. Database mutation was skipped.`
    );
  }

  return value;
}

function readOptionalInteger(value: number | undefined, label: string) {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer, received ${value}.`);
  }

  return value;
}

async function synchronizeFittingCharges(charges: FittingChargeRecord[]) {
  const existing = await prisma.fittingCharge.findMany({
    select: {
      chargeSize: true,
      groupId: true,
      groupName: true,
      marketGroupId: true,
      marketGroupName: true,
      metaGroupId: true,
      metaGroupName: true,
      techLevel: true,
      typeId: true,
      typeName: true,
      volume: true
    }
  });
  const existingByTypeId = new Map(
    existing.map((charge) => [charge.typeId, charge])
  );
  const incomingTypeIds = new Set(charges.map((charge) => charge.typeId));
  const created = charges.filter((charge) => !existingByTypeId.has(charge.typeId));
  const changed = charges.filter((charge) => {
    const current = existingByTypeId.get(charge.typeId);
    return current ? chargeHasChanged(current, charge) : false;
  });
  const unchanged = charges.filter((charge) => {
    const current = existingByTypeId.get(charge.typeId);
    return current ? !chargeHasChanged(current, charge) : false;
  });
  const staleTypeIds = existing
    .filter((charge) => !incomingTypeIds.has(charge.typeId))
    .map((charge) => charge.typeId);

  for (const batch of chunk(created, databaseBatchSize)) {
    await prisma.fittingCharge.createMany({ data: batch });
  }

  for (const batch of chunk(changed, databaseBatchSize)) {
    await prisma.$transaction(
      batch.map((charge) =>
        prisma.fittingCharge.update({
          data: charge,
          where: { typeId: charge.typeId }
        })
      )
    );
  }

  for (const batch of chunk(unchanged, databaseBatchSize)) {
    await prisma.fittingCharge.updateMany({
      data: { lastRefreshedAt: charges[0].lastRefreshedAt },
      where: { typeId: { in: batch.map((charge) => charge.typeId) } }
    });
  }

  let removed = 0;

  for (const batch of chunk(staleTypeIds, databaseBatchSize)) {
    const result = await prisma.fittingCharge.deleteMany({
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

function chargeHasChanged(
  current: Omit<FittingChargeRecord, "lastRefreshedAt">,
  incoming: FittingChargeRecord
) {
  return (
    current.typeName !== incoming.typeName ||
    current.groupId !== incoming.groupId ||
    current.groupName !== incoming.groupName ||
    current.marketGroupId !== incoming.marketGroupId ||
    current.marketGroupName !== incoming.marketGroupName ||
    current.metaGroupId !== incoming.metaGroupId ||
    current.metaGroupName !== incoming.metaGroupName ||
    current.techLevel !== incoming.techLevel ||
    current.chargeSize !== incoming.chargeSize ||
    current.volume !== incoming.volume
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
  charges,
  groupStats,
  publishedChargeCandidateCount,
  publishedChargeGroups,
  referencedChargeGroups,
  typeStats
}: {
  charges: FittingChargeRecord[];
  groupStats: {
    chargeCategoryGroups: number;
    unpublishedChargeGroups: number;
  };
  publishedChargeCandidateCount: number;
  publishedChargeGroups: Map<number, PublishedGroup>;
  referencedChargeGroups: Map<number, Set<number>>;
  typeStats: {
    chargeCategoryTypes: number;
    excludedByUnpublishedGroup: number;
    unpublishedChargeTypes: number;
  };
}) {
  console.log("CCP Category 8 charge classification:");
  console.log(`- Category 8 groups: ${groupStats.chargeCategoryGroups}`);
  console.log(`- Unpublished groups excluded: ${groupStats.unpublishedChargeGroups}`);
  console.log(`- Category 8 types: ${typeStats.chargeCategoryTypes}`);
  console.log(
    `- Types excluded by unpublished group: ${typeStats.excludedByUnpublishedGroup}`
  );
  console.log(`- Unpublished types excluded: ${typeStats.unpublishedChargeTypes}`);
  console.log(`- Published charge candidates: ${publishedChargeCandidateCount}`);
  console.log(`- Module-referenced charge groups: ${referencedChargeGroups.size}`);
  console.log(`- Imported fitting charges: ${charges.length}`);
  console.log(
    `- Published but unreferenced charges excluded: ${publishedChargeCandidateCount - charges.length}`
  );

  const unreferencedGroups = Array.from(publishedChargeGroups.values()).filter(
    (group) => !referencedChargeGroups.has(group.groupId)
  );

  console.log(
    `- Published Category 8 groups excluded as unreferenced: ${unreferencedGroups.map((group) => `${group.groupId}/${group.groupName}`).join(", ") || "none"}`
  );

  const counts = countByGroup(charges);
  console.log("Imported charge counts by authoritative group:");

  for (const group of counts) {
    console.log(`- ${group.groupId}/${group.groupName}: ${group.count}`);
  }
}

function logVerificationSamples(charges: FittingChargeRecord[]) {
  const chargesByName = new Map(charges.map((charge) => [charge.typeName, charge]));

  console.log("Representative charge verification from CCP SDE:");

  for (const sample of VERIFICATION_CHARGES) {
    const charge = sample.names
      .map((name) => chargesByName.get(name))
      .find((candidate): candidate is FittingChargeRecord => Boolean(candidate));

    if (!charge) {
      console.warn(
        `- ${sample.family}: none of ${sample.names.join(", ")} were present in the authoritative charge population.`
      );
      continue;
    }

    console.log(
      `- ${sample.family}: ${charge.typeId}/${charge.typeName}; group ${charge.groupId}/${charge.groupName}; charge size ${formatNullable(charge.chargeSize)}; volume ${charge.volume}; market ${formatMetadata(charge.marketGroupId, charge.marketGroupName)}; meta ${formatMetadata(charge.metaGroupId, charge.metaGroupName)}; tech ${formatNullable(charge.techLevel)}.`
    );
  }
}

function logImportSummary(
  charges: FittingChargeRecord[],
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
    `Charge-size storage: ${charges.filter((charge) => charge.chargeSize === null).length} missing/null, ${charges.filter((charge) => charge.chargeSize === 0).length} explicit zero, ${charges.filter((charge) => (charge.chargeSize ?? 0) > 0).length} explicit positive.`
  );
}

function countByGroup(charges: FittingChargeRecord[]) {
  const counts = new Map<
    number,
    { count: number; groupId: number; groupName: string }
  >();

  for (const charge of charges) {
    const current = counts.get(charge.groupId);
    counts.set(charge.groupId, {
      count: (current?.count ?? 0) + 1,
      groupId: charge.groupId,
      groupName: charge.groupName
    });
  }

  return Array.from(counts.values()).sort((left, right) =>
    left.groupName.localeCompare(right.groupName, "en-US")
  );
}

function formatTypes(types: PublishedModuleType[]) {
  const limit = 12;
  const visible = types
    .slice(0, limit)
    .map((type) => `${type.typeId}/${type.typeName}`)
    .join(", ");
  const suffix = types.length > limit ? `, plus ${types.length - limit} more` : "";

  return `${visible}${suffix}`;
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
      error instanceof Error ? error.message : "Fitting charge refresh failed."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
