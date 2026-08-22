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
import { FittingRack, PrismaClient } from "@prisma/client";
import {
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

const HARDPOINT_EFFECTS = {
  launcher: { id: 40, name: "launcherFitted" },
  turret: { id: 42, name: "turretFitted" }
} as const;

const FITTING_ATTRIBUTES = {
  powergridRequirement: {
    defaultValue: 0,
    id: 30,
    name: "power",
    unitId: 107
  },
  cpuRequirement: {
    defaultValue: 0,
    id: 50,
    name: "cpu",
    unitId: 106
  },
  calibrationCost: {
    defaultValue: 0,
    id: 1153,
    name: "upgradeCost",
    unitId: null
  },
  maxGroupFitted: {
    defaultValue: 0,
    id: 1544,
    name: "maxGroupFitted",
    unitId: null
  },
  rigSize: {
    defaultValue: 0,
    id: 1547,
    name: "rigSize",
    unitId: 117
  },
  maxTypeFitted: {
    defaultValue: 0,
    id: 2431,
    name: "maxTypeFitted",
    unitId: null
  }
} as const;

const SHIP_GROUP_RESTRICTION_ATTRIBUTES = [
  { id: 1298, name: "canFitShipGroup01" },
  { id: 1299, name: "canFitShipGroup02" },
  { id: 1300, name: "canFitShipGroup03" },
  { id: 1301, name: "canFitShipGroup04" },
  { id: 1872, name: "canFitShipGroup05" },
  { id: 1879, name: "canFitShipGroup06" },
  { id: 1880, name: "canFitShipGroup07" },
  { id: 1881, name: "canFitShipGroup08" },
  { id: 2065, name: "canFitShipGroup09" },
  { id: 2396, name: "canFitShipGroup10" },
  { id: 2476, name: "canFitShipGroup11" },
  { id: 2477, name: "canFitShipGroup12" },
  { id: 2478, name: "canFitShipGroup13" },
  { id: 2479, name: "canFitShipGroup14" },
  { id: 2480, name: "canFitShipGroup15" },
  { id: 2481, name: "canFitShipGroup16" },
  { id: 2482, name: "canFitShipGroup17" },
  { id: 2483, name: "canFitShipGroup18" },
  { id: 2484, name: "canFitShipGroup19" },
  { id: 2485, name: "canFitShipGroup20" }
] as const;

const SHIP_TYPE_RESTRICTION_ATTRIBUTES = [
  { id: 1302, name: "canFitShipType1" },
  { id: 1303, name: "canFitShipType2" },
  { id: 1304, name: "canFitShipType3" },
  { id: 1305, name: "canFitShipType4" },
  { id: 1944, name: "canFitShipType5" },
  { id: 2103, name: "canFitShipType6" },
  { id: 2463, name: "canFitShipType7" },
  { id: 2486, name: "canFitShipType8" },
  { id: 2487, name: "canFitShipType9" },
  { id: 2488, name: "canFitShipType10" },
  { id: 2758, name: "canFitShipType11" },
  { id: 5948, name: "canFitShipType12" }
] as const;

const VERIFICATION_MODULE_NAMES = [
  "Core Probe Launcher I",
  "Small Capacitor Booster I",
  "125mm Gatling AutoCannon I",
  "Light Missile Launcher I",
  "Small Ancillary Shield Booster"
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
  capacity?: number;
  groupID: number;
  marketGroupID?: number;
  metaGroupID?: number;
  metaLevel?: number;
  name?: LocalizedName;
  published?: boolean;
  techLevel?: number;
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

type SdeMarketGroup = SdeNamedRecord & {
  parentGroupID?: number;
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

type MarketGroupRecord = {
  marketGroupId: number;
  marketGroupName: string;
  parentGroupId: number | null;
};

type MarketGroupPath = {
  ids: number[];
  names: string[];
};

type PublishedModuleType = {
  capacity: number | null;
  groupId: number;
  groupName: string;
  marketGroupId: number | null;
  metaGroupId: number | null;
  metaLevel: number | null;
  techLevel: number | null;
  typeId: number;
  typeName: string;
};

type FittingModuleRecord = PublishedModuleType & {
  allowedShipGroupIds: number[];
  allowedShipTypeIds: number[];
  calibrationCost: number;
  chargeGroupIds: number[];
  chargeSize: number | null;
  cpuRequirement: number;
  lastRefreshedAt: Date;
  marketGroupName: string | null;
  marketGroupPathIds: number[];
  marketGroupPathNames: string[];
  maxGroupFitted: number | null;
  maxTypeFitted: number | null;
  metaGroupName: string | null;
  powergridRequirement: number;
  rack: FittingRack;
  requiresLauncherHardpoint: boolean;
  requiresTurretHardpoint: boolean;
  rigSize: number | null;
};

async function main() {
  console.log("Refreshing Fitting Bay ship modules from CCP SDE JSON Lines.");
  console.log(`SDE source: ${sdeJsonlZipUrl}`);

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required to refresh Fitting Bay module data.");
  }

  const tempRoot = await mkdtemp(path.join(tmpdir(), "vyraj-fitting-modules-sde-"));

  try {
    const zipPath = path.join(tempRoot, "sde-jsonl.zip");
    const extractDir = path.join(tempRoot, "sde-jsonl");

    await downloadFile(sdeJsonlZipUrl, zipPath);
    await extractArchive(zipPath, extractDir);

    const files = await findRequiredSdeFiles(extractDir);
    const categories = await readCategories(files.categories);
    validateModuleCategory(categories);

    const attributeDefinitions = await readDogmaAttributes(files.dogmaAttributes);
    const effectDefinitions = await readDogmaEffects(files.dogmaEffects);
    const unitDefinitions = await readDogmaUnits(files.dogmaUnits);
    validateDogmaDefinitions(
      attributeDefinitions,
      effectDefinitions,
      unitDefinitions
    );
    validateRestrictionFamilies(attributeDefinitions);

    const publishedModuleGroups = await readPublishedModuleGroups(files.groups);
    const publishedModuleTypes = await readPublishedModuleTypes(
      files.types,
      publishedModuleGroups
    );
    const typeDogma = await readModuleDogma(files.typeDogma, publishedModuleTypes);
    const marketGroups = await readMarketGroups(files.marketGroups);
    const marketGroupPaths = buildMarketGroupPaths(marketGroups);
    const metaGroupNames = await readEnglishNames(files.metaGroups);
    const refreshedAt = new Date();
    const classification = buildFittingModules({
      attributeDefinitions,
      marketGroups,
      marketGroupPaths,
      metaGroupNames,
      publishedModuleTypes,
      refreshedAt,
      typeDogma
    });

    logClassificationSummary(publishedModuleTypes.size, classification);
    logVerificationSamples(classification.modules);

    if (classification.ambiguous.length) {
      throw new Error(
        `CCP SDE contained ${classification.ambiguous.length} published Category 7 type(s) with multiple fitting rack effects: ${formatExcludedCandidates(classification.ambiguous)}. Database mutation was skipped.`
      );
    }

    if (!classification.modules.length) {
      throw new Error(
        "CCP SDE produced zero authoritative Category 7 fitting modules. Database mutation was skipped."
      );
    }

    validateModuleMarketAncestry(classification.modules);

    const result = await synchronizeFittingModules(classification.modules);
    logImportSummary(classification.modules, result);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function downloadFile(url: string, targetPath: string) {
  console.log("Downloading latest official CCP SDE JSON Lines archive.");
  const response = await fetch(url, {
    headers: {
      accept: "application/zip",
      "user-agent": "VyrajCommandConsoleV2/fitting-module-refresh"
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

function validateModuleCategory(categories: Map<number, SdeCategory>) {
  const category = categories.get(MODULE_CATEGORY_ID);
  const categoryName = getEnglishName(category?.name);

  if (categoryName !== "Module" || category?.published !== true) {
    throw new Error(
      `CCP category ${MODULE_CATEGORY_ID} was expected to be published Module, but SDE reported ${categoryName || "missing"} (${formatPublished(category?.published)}).`
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

  for (const expected of Object.values(HARDPOINT_EFFECTS)) {
    validateCanonicalName(effects, expected.id, expected.name, "effect");
  }

  for (const expected of Object.values(FITTING_ATTRIBUTES)) {
    const actual = attributes.get(expected.id);
    validateCanonicalName(attributes, expected.id, expected.name, "attribute");

    if ((actual?.unitID ?? null) !== expected.unitId) {
      throw new Error(
        `Dogma attribute ${expected.id} (${expected.name}) expected unit ${formatNullableValue(expected.unitId)}, but SDE reported ${formatNullableValue(actual?.unitID)}.`
      );
    }

    if (actual?.defaultValue !== expected.defaultValue) {
      throw new Error(
        `Dogma attribute ${expected.id} (${expected.name}) expected default ${expected.defaultValue}, but SDE reported ${formatNullableValue(actual?.defaultValue)}.`
      );
    }
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
      `Dogma attribute ${CHARGE_SIZE_ATTRIBUTE.id} (${CHARGE_SIZE_ATTRIBUTE.name}) expected unit ${CHARGE_SIZE_ATTRIBUTE.unitId}, but SDE reported ${formatNullableValue(chargeSize?.unitID)}.`
    );
  }

  if (chargeSize?.defaultValue !== CHARGE_SIZE_ATTRIBUTE.defaultValue) {
    throw new Error(
      `Dogma attribute ${CHARGE_SIZE_ATTRIBUTE.id} (${CHARGE_SIZE_ATTRIBUTE.name}) expected default ${CHARGE_SIZE_ATTRIBUTE.defaultValue}, but SDE reported ${formatNullableValue(chargeSize?.defaultValue)}.`
    );
  }

  for (const expected of [
    ...CHARGE_GROUP_ATTRIBUTES,
    ...SHIP_GROUP_RESTRICTION_ATTRIBUTES,
    ...SHIP_TYPE_RESTRICTION_ATTRIBUTES
  ]) {
    validateCanonicalName(attributes, expected.id, expected.name, "attribute");
  }

  validateCanonicalName(units, 106, "Teraflops", "unit");
  validateCanonicalName(units, 107, "MegaWatts", "unit");
  validateCanonicalName(units, 117, "Sizeclass", "unit");
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
      `Dogma ${kind} ${id} was expected to be ${expectedName}, but SDE reported ${actualName || "missing"}.`
    );
  }
}

function validateRestrictionFamilies(attributes: Map<number, SdeDogmaAttribute>) {
  const knownGroupIds = new Set<number>(
    SHIP_GROUP_RESTRICTION_ATTRIBUTES.map((attribute) => attribute.id)
  );
  const knownTypeIds = new Set<number>(
    SHIP_TYPE_RESTRICTION_ATTRIBUTES.map((attribute) => attribute.id)
  );
  const unknown: Array<{ id: number; name: string }> = [];

  for (const attribute of attributes.values()) {
    const name = attribute.name || "";

    if (/^canFitShipGroup\d+$/u.test(name) && !knownGroupIds.has(attribute._key)) {
      unknown.push({ id: attribute._key, name });
    }

    if (/^canFitShipType\d+$/u.test(name) && !knownTypeIds.has(attribute._key)) {
      unknown.push({ id: attribute._key, name });
    }
  }

  if (unknown.length) {
    throw new Error(
      `CCP SDE contains unrecognized fitting restriction attribute(s): ${unknown.map((attribute) => `${attribute.id}/${attribute.name}`).join(", ")}. Database mutation was skipped.`
    );
  }
}

async function readPublishedModuleGroups(filePath: string) {
  const groups = new Map<number, { groupId: number; groupName: string }>();

  for await (const group of readJsonLines<SdeGroup>(filePath)) {
    if (group.categoryID !== MODULE_CATEGORY_ID || group.published !== true) {
      continue;
    }

    groups.set(group._key, {
      groupId: group._key,
      groupName: requireEnglishName(group.name, `group ${group._key}`)
    });
  }

  return groups;
}

async function readPublishedModuleTypes(
  filePath: string,
  publishedGroups: Map<number, { groupId: number; groupName: string }>
) {
  const types = new Map<number, PublishedModuleType>();

  for await (const type of readJsonLines<SdeType>(filePath)) {
    const group = publishedGroups.get(type.groupID);

    if (!group || type.published !== true) {
      continue;
    }

    types.set(type._key, {
      capacity: readOptionalNonnegativeNumber(
        type.capacity,
        `type ${type._key} capacity`
      ),
      groupId: group.groupId,
      groupName: group.groupName,
      marketGroupId: readOptionalInteger(type.marketGroupID, `type ${type._key} marketGroupID`),
      metaGroupId: readOptionalInteger(type.metaGroupID, `type ${type._key} metaGroupID`),
      metaLevel: readOptionalInteger(type.metaLevel, `type ${type._key} metaLevel`),
      techLevel: readOptionalInteger(type.techLevel, `type ${type._key} techLevel`),
      typeId: type._key,
      typeName: requireEnglishName(type.name, `type ${type._key}`)
    });
  }

  return types;
}

async function readModuleDogma(
  filePath: string,
  modules: Map<number, PublishedModuleType>
) {
  const dogma = new Map<number, SdeTypeDogma>();

  for await (const typeDogma of readJsonLines<SdeTypeDogma>(filePath)) {
    if (modules.has(typeDogma._key)) {
      dogma.set(typeDogma._key, typeDogma);
    }
  }

  return dogma;
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

function buildFittingModules({
  attributeDefinitions,
  marketGroups,
  marketGroupPaths,
  metaGroupNames,
  publishedModuleTypes,
  refreshedAt,
  typeDogma
}: {
  attributeDefinitions: Map<number, SdeDogmaAttribute>;
  marketGroups: Map<number, MarketGroupRecord>;
  marketGroupPaths: Map<number, MarketGroupPath>;
  metaGroupNames: Map<number, string>;
  publishedModuleTypes: Map<number, PublishedModuleType>;
  refreshedAt: Date;
  typeDogma: Map<number, SdeTypeDogma>;
}) {
  const modules: FittingModuleRecord[] = [];
  const zeroRack: PublishedModuleType[] = [];
  const ambiguous: PublishedModuleType[] = [];
  const cpuDefault = requireDefaultValue(
    attributeDefinitions,
    FITTING_ATTRIBUTES.cpuRequirement.id
  );
  const powergridDefault = requireDefaultValue(
    attributeDefinitions,
    FITTING_ATTRIBUTES.powergridRequirement.id
  );
  const calibrationDefault = requireDefaultValue(
    attributeDefinitions,
    FITTING_ATTRIBUTES.calibrationCost.id
  );

  for (const moduleType of publishedModuleTypes.values()) {
    const marketGroup =
      moduleType.marketGroupId === null
        ? null
        : marketGroups.get(moduleType.marketGroupId) ?? null;
    const marketGroupPath =
      moduleType.marketGroupId === null
        ? null
        : marketGroupPaths.get(moduleType.marketGroupId) ?? null;

    if (moduleType.marketGroupId !== null && (!marketGroup || !marketGroupPath)) {
      throw new Error(
        `Published module ${moduleType.typeId}/${moduleType.typeName} references missing market group ${moduleType.marketGroupId}. Database mutation was skipped.`
      );
    }

    const dogma = typeDogma.get(moduleType.typeId);
    const rackClassification = classifyModuleRack(dogma?.dogmaEffects);

    if (rackClassification.kind === "none") {
      zeroRack.push(moduleType);
      continue;
    }

    if (rackClassification.kind === "ambiguous") {
      ambiguous.push(moduleType);
      continue;
    }

    if (rackClassification.kind === "subsystem") {
      throw new Error(
        `Published Category 7 type ${moduleType.typeId}/${moduleType.typeName} unexpectedly uses subsystem rack effect 3772. Database mutation was skipped.`
      );
    }

    const rack = rackClassification.rack;

    const attributes = new Map(
      (dogma?.dogmaAttributes || []).map((attribute) => [
        attribute.attributeID,
        attribute.value
      ])
    );
    const effects = new Set(
      (dogma?.dogmaEffects || []).map((effect) => effect.effectID)
    );
    const calibrationCost = readIntegerWithDefault(
      attributes,
      FITTING_ATTRIBUTES.calibrationCost.id,
      calibrationDefault,
      `${moduleType.typeName} calibration cost`
    );
    const rigSize = readRigSize(attributes, rack, moduleType);

    if (rack === FittingRack.RIG && calibrationCost <= 0) {
      throw new Error(
        `Rig ${moduleType.typeId}/${moduleType.typeName} has invalid calibration cost ${calibrationCost}. Database mutation was skipped.`
      );
    }

    if (rack !== FittingRack.RIG && calibrationCost !== 0) {
      throw new Error(
        `Non-rig ${moduleType.typeId}/${moduleType.typeName} has unexpected calibration cost ${calibrationCost}. Database mutation was skipped.`
      );
    }

    modules.push({
      ...moduleType,
      allowedShipGroupIds: readIdArray(
        attributes,
        SHIP_GROUP_RESTRICTION_ATTRIBUTES,
        `${moduleType.typeName} ship-group restrictions`
      ),
      allowedShipTypeIds: readIdArray(
        attributes,
        SHIP_TYPE_RESTRICTION_ATTRIBUTES,
        `${moduleType.typeName} ship-type restrictions`
      ),
      calibrationCost,
      chargeGroupIds: readIdArray(
        attributes,
        CHARGE_GROUP_ATTRIBUTES,
        `${moduleType.typeName} charge groups`
      ),
      chargeSize: readNullableNonnegativeInteger(
        attributes,
        CHARGE_SIZE_ATTRIBUTE.id,
        `${moduleType.typeName} charge size`
      ),
      cpuRequirement: readNumberWithDefault(
        attributes,
        FITTING_ATTRIBUTES.cpuRequirement.id,
        cpuDefault,
        `${moduleType.typeName} CPU requirement`
      ),
      lastRefreshedAt: refreshedAt,
      marketGroupName: marketGroup?.marketGroupName ?? null,
      marketGroupPathIds: marketGroupPath?.ids ?? [],
      marketGroupPathNames: marketGroupPath?.names ?? [],
      maxGroupFitted: readPositiveIntegerOrNull(
        attributes,
        FITTING_ATTRIBUTES.maxGroupFitted.id,
        `${moduleType.typeName} maxGroupFitted`
      ),
      maxTypeFitted: readPositiveIntegerOrNull(
        attributes,
        FITTING_ATTRIBUTES.maxTypeFitted.id,
        `${moduleType.typeName} maxTypeFitted`
      ),
      metaGroupName:
        moduleType.metaGroupId === null
          ? null
          : metaGroupNames.get(moduleType.metaGroupId) ?? null,
      powergridRequirement: readNumberWithDefault(
        attributes,
        FITTING_ATTRIBUTES.powergridRequirement.id,
        powergridDefault,
        `${moduleType.typeName} powergrid requirement`
      ),
      rack,
      requiresLauncherHardpoint: effects.has(HARDPOINT_EFFECTS.launcher.id),
      requiresTurretHardpoint: effects.has(HARDPOINT_EFFECTS.turret.id),
      rigSize
    });
  }

  modules.sort(
    (left, right) =>
      left.rack.localeCompare(right.rack, "en-US") ||
      left.groupName.localeCompare(right.groupName, "en-US") ||
      left.typeName.localeCompare(right.typeName, "en-US")
  );

  return { ambiguous, modules, zeroRack };
}

function readRigSize(
  attributes: Map<number, number>,
  rack: FittingRack,
  moduleType: PublishedModuleType
) {
  if (rack !== FittingRack.RIG) {
    return null;
  }

  const rigSize = readNullableNonnegativeInteger(
    attributes,
    FITTING_ATTRIBUTES.rigSize.id,
    `${moduleType.typeName} rig size`
  );

  if (rigSize === null || rigSize < 1 || rigSize > 4) {
    throw new Error(
      `Rig ${moduleType.typeId}/${moduleType.typeName} has invalid rig size ${formatNullableValue(rigSize)}. Database mutation was skipped.`
    );
  }

  return rigSize;
}

function requireDefaultValue(
  definitions: Map<number, SdeDogmaAttribute>,
  attributeId: number
) {
  const value = definitions.get(attributeId)?.defaultValue;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Dogma attribute ${attributeId} has no finite default value.`);
  }

  return value;
}

function readNumberWithDefault(
  values: Map<number, number>,
  attributeId: number,
  defaultValue: number,
  label: string
) {
  const value = values.get(attributeId) ?? defaultValue;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite nonnegative number, received ${value}.`);
  }

  return value;
}

function readIntegerWithDefault(
  values: Map<number, number>,
  attributeId: number,
  defaultValue: number,
  label: string
) {
  const value = readNumberWithDefault(values, attributeId, defaultValue, label);

  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer, received ${value}.`);
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
    throw new Error(`${label} must be a nonnegative integer, received ${value}.`);
  }

  return value;
}

function readPositiveIntegerOrNull(
  values: Map<number, number>,
  attributeId: number,
  label: string
) {
  const value = readNullableNonnegativeInteger(values, attributeId, label);

  if (value === null || value === 0) {
    return null;
  }

  return value;
}

function readIdArray(
  values: Map<number, number>,
  attributes: ReadonlyArray<{ id: number }>,
  label: string
) {
  const ids = attributes.flatMap((attribute) => {
    const value = values.get(attribute.id);

    if (value === undefined || value === 0) {
      return [];
    }

    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new Error(`${label} contains invalid ID ${value}.`);
    }

    return [value];
  });

  return Array.from(new Set(ids)).sort((left, right) => left - right);
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

function readOptionalNonnegativeNumber(
  value: number | undefined,
  label: string
) {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `${label} must be a finite nonnegative number, received ${value}.`
    );
  }

  return value;
}

function validateModuleMarketAncestry(modules: FittingModuleRecord[]) {
  const typeIds = new Set<number>();

  for (const fittingModule of modules) {
    if (typeIds.has(fittingModule.typeId)) {
      throw new Error(
        `Duplicate fitting module type ID ${fittingModule.typeId} reached synchronization. Database mutation was skipped.`
      );
    }

    if (
      fittingModule.marketGroupPathIds.length !==
      fittingModule.marketGroupPathNames.length
    ) {
      throw new Error(
        `Module ${fittingModule.typeId}/${fittingModule.typeName} has inconsistent market ancestry. Database mutation was skipped.`
      );
    }

    if (
      fittingModule.marketGroupId !== null &&
      fittingModule.marketGroupPathIds.at(-1) !== fittingModule.marketGroupId
    ) {
      throw new Error(
        `Module ${fittingModule.typeId}/${fittingModule.typeName} market ancestry does not terminate at market group ${fittingModule.marketGroupId}. Database mutation was skipped.`
      );
    }

    typeIds.add(fittingModule.typeId);
  }
}

async function synchronizeFittingModules(modules: FittingModuleRecord[]) {
  const existing = await prisma.fittingModule.findMany({
    select: {
      allowedShipGroupIds: true,
      allowedShipTypeIds: true,
      calibrationCost: true,
      capacity: true,
      chargeGroupIds: true,
      chargeSize: true,
      cpuRequirement: true,
      groupId: true,
      groupName: true,
      marketGroupId: true,
      marketGroupName: true,
      marketGroupPathIds: true,
      marketGroupPathNames: true,
      maxGroupFitted: true,
      maxTypeFitted: true,
      metaGroupId: true,
      metaGroupName: true,
      metaLevel: true,
      powergridRequirement: true,
      rack: true,
      requiresLauncherHardpoint: true,
      requiresTurretHardpoint: true,
      rigSize: true,
      techLevel: true,
      typeId: true,
      typeName: true
    }
  });
  const existingByTypeId = new Map(
    existing.map((module) => [module.typeId, module])
  );
  const incomingTypeIds = new Set(modules.map((module) => module.typeId));
  const created = modules.filter((module) => !existingByTypeId.has(module.typeId));
  const changed = modules.filter((module) => {
    const current = existingByTypeId.get(module.typeId);
    return current ? moduleHasChanged(current, module) : false;
  });
  const unchanged = modules.filter((module) => {
    const current = existingByTypeId.get(module.typeId);
    return current ? !moduleHasChanged(current, module) : false;
  });
  const staleTypeIds = existing
    .filter((module) => !incomingTypeIds.has(module.typeId))
    .map((module) => module.typeId);

  for (const batch of chunk(created, databaseBatchSize)) {
    await prisma.fittingModule.createMany({ data: batch });
  }

  for (const batch of chunk(changed, databaseBatchSize)) {
    await prisma.$transaction(
      batch.map((module) =>
        prisma.fittingModule.update({
          data: module,
          where: { typeId: module.typeId }
        })
      )
    );
  }

  for (const batch of chunk(unchanged, databaseBatchSize)) {
    await prisma.fittingModule.updateMany({
      data: { lastRefreshedAt: modules[0].lastRefreshedAt },
      where: { typeId: { in: batch.map((module) => module.typeId) } }
    });
  }

  let removed = 0;

  for (const batch of chunk(staleTypeIds, databaseBatchSize)) {
    const result = await prisma.fittingModule.deleteMany({
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

function moduleHasChanged(
  current: Omit<FittingModuleRecord, "lastRefreshedAt">,
  incoming: FittingModuleRecord
) {
  return (
    current.typeName !== incoming.typeName ||
    current.groupId !== incoming.groupId ||
    current.groupName !== incoming.groupName ||
    current.rack !== incoming.rack ||
    current.marketGroupId !== incoming.marketGroupId ||
    current.marketGroupName !== incoming.marketGroupName ||
    !arraysEqual(current.marketGroupPathIds, incoming.marketGroupPathIds) ||
    !arraysEqual(current.marketGroupPathNames, incoming.marketGroupPathNames) ||
    current.metaGroupId !== incoming.metaGroupId ||
    current.metaGroupName !== incoming.metaGroupName ||
    current.metaLevel !== incoming.metaLevel ||
    current.techLevel !== incoming.techLevel ||
    current.cpuRequirement !== incoming.cpuRequirement ||
    current.powergridRequirement !== incoming.powergridRequirement ||
    current.calibrationCost !== incoming.calibrationCost ||
    current.capacity !== incoming.capacity ||
    current.rigSize !== incoming.rigSize ||
    current.requiresTurretHardpoint !== incoming.requiresTurretHardpoint ||
    current.requiresLauncherHardpoint !== incoming.requiresLauncherHardpoint ||
    !arraysEqual(current.allowedShipGroupIds, incoming.allowedShipGroupIds) ||
    !arraysEqual(current.allowedShipTypeIds, incoming.allowedShipTypeIds) ||
    current.maxGroupFitted !== incoming.maxGroupFitted ||
    current.maxTypeFitted !== incoming.maxTypeFitted ||
    !arraysEqual(current.chargeGroupIds, incoming.chargeGroupIds) ||
    current.chargeSize !== incoming.chargeSize
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

function logClassificationSummary(
  candidateCount: number,
  classification: {
    ambiguous: PublishedModuleType[];
    modules: FittingModuleRecord[];
    zeroRack: PublishedModuleType[];
  }
) {
  const rackCounts = countByRack(classification.modules);

  console.log("CCP Category 7 classification:");
  console.log(`- Published candidates: ${candidateCount}`);
  console.log(`- Imported fitting modules: ${classification.modules.length}`);
  console.log(`- High: ${rackCounts.HIGH}`);
  console.log(`- Mid: ${rackCounts.MID}`);
  console.log(`- Low: ${rackCounts.LOW}`);
  console.log(`- Rig: ${rackCounts.RIG}`);
  console.log(`- Subsystem: ${rackCounts.SUBSYSTEM}`);
  console.log(`- Excluded zero-rack candidates: ${classification.zeroRack.length}`);
  console.log(`- Excluded ambiguous candidates: ${classification.ambiguous.length}`);

  if (classification.zeroRack.length) {
    console.log(
      `Zero-rack exclusions: ${formatExcludedCandidates(classification.zeroRack)}`
    );
  }
}

function logImportSummary(
  modules: FittingModuleRecord[],
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
    `Module metadata: ${modules.filter((module) => module.requiresTurretHardpoint).length} turret-hardpoint, ${modules.filter((module) => module.requiresLauncherHardpoint).length} launcher-hardpoint, ${modules.filter(isRestrictedModule).length} ship-restricted, ${modules.filter(hasChargeMetadata).length} with charge metadata, ${modules.filter((module) => module.rack === FittingRack.RIG).length} rigs.`
  );
  console.log(
    `Market ancestry: ${modules.filter((module) => module.marketGroupPathIds.length > 0).length} classified, ${modules.filter((module) => module.marketGroupPathIds.length === 0).length} rack-fallback.`
  );
}

function logVerificationSamples(modules: FittingModuleRecord[]) {
  const modulesByName = new Map(modules.map((module) => [module.typeName, module]));

  console.log("Representative module verification from CCP SDE:");

  for (const name of VERIFICATION_MODULE_NAMES) {
    const fittingModule = modulesByName.get(name);

    if (!fittingModule) {
      console.warn(`- ${name}: not present in current published module data.`);
      continue;
    }

    const restrictions = [
      fittingModule.allowedShipGroupIds.length
        ? `groups ${fittingModule.allowedShipGroupIds.join(",")}`
        : "",
      fittingModule.allowedShipTypeIds.length
        ? `types ${fittingModule.allowedShipTypeIds.join(",")}`
        : ""
    ]
      .filter(Boolean)
      .join("; ");

    console.log(
      `- ${fittingModule.typeName}: ${fittingModule.rack}; market ${fittingModule.marketGroupPathNames.join(" > ") || "rack fallback"}; capacity ${formatNullableValue(fittingModule.capacity)}; charge groups ${fittingModule.chargeGroupIds.join(",") || "none"}; charge size ${formatNullableValue(fittingModule.chargeSize)}; CPU ${fittingModule.cpuRequirement}; PG ${fittingModule.powergridRequirement}; calibration ${fittingModule.calibrationCost}; rig size ${formatNullableValue(fittingModule.rigSize)}; turret ${formatYesNo(fittingModule.requiresTurretHardpoint)}; launcher ${formatYesNo(fittingModule.requiresLauncherHardpoint)}; restrictions ${restrictions || "none"}.`
    );
  }
}

function countByRack(modules: FittingModuleRecord[]) {
  const counts: Record<FittingRack, number> = {
    HIGH: 0,
    LOW: 0,
    MID: 0,
    RIG: 0,
    SUBSYSTEM: 0
  };

  for (const fittingModule of modules) {
    counts[fittingModule.rack] += 1;
  }

  return counts;
}

function isRestrictedModule(module: FittingModuleRecord) {
  return Boolean(
    module.allowedShipGroupIds.length || module.allowedShipTypeIds.length
  );
}

function hasChargeMetadata(module: FittingModuleRecord) {
  return Boolean(module.chargeGroupIds.length || module.chargeSize !== null);
}

function formatExcludedCandidates(candidates: PublishedModuleType[]) {
  const limit = 12;
  const visible = candidates
    .slice(0, limit)
    .map((candidate) => `${candidate.typeId}/${candidate.typeName}`)
    .join(", ");
  const suffix = candidates.length > limit ? `, plus ${candidates.length - limit} more` : "";

  return `${visible}${suffix}`;
}

function formatPublished(value: boolean | undefined) {
  return value === undefined ? "published missing" : `published ${value}`;
}

function formatNullableValue(value: number | null | undefined) {
  return value === null || value === undefined ? "missing" : value;
}

function formatYesNo(value: boolean) {
  return value ? "yes" : "no";
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
      error instanceof Error ? error.message : "Fitting module refresh failed."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
