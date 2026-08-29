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
  extractDirectSkillRequirements,
  SKILL_CATEGORY_ID,
  validateSkillRequirementDogmaDefinitions,
  type SdeDogmaAttributeDefinition,
  type SdeDogmaUnitDefinition,
  type SdeTypeDogmaAttribute
} from "./lib/fitting-skill-requirements";

const prisma = new PrismaClient();
const SDE_JSONL_ZIP_URL =
  "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";
const DATABASE_BATCH_SIZE = 250;

const VERIFICATION_TYPES = [
  { family: "hull", name: "Merlin" },
  { family: "hull", name: "Vexor" },
  { family: "module", name: "125mm Gatling AutoCannon I" },
  { family: "Tech II weapon", name: "Light Neutron Blaster II" },
  { family: "mid module", name: "10MN Afterburner II" },
  { family: "rig", name: "Medium Core Defense Field Extender I" },
  { family: "charge with requirements", name: "Void S" },
  { family: "charge without requirements", name: "Antimatter Charge S" },
  { family: "drone", name: "Hobgoblin I" },
  { family: "Tech II drone", name: "Hobgoblin II" },
  { family: "skill prerequisite", name: "Gallente Cruiser" }
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
  name?: LocalizedName;
  published?: boolean;
};

type SdeTypeDogma = {
  _key: number;
  dogmaAttributes?: SdeTypeDogmaAttribute[];
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
  publishedHierarchy: boolean;
};

type FittingSkillRecord = {
  groupId: number;
  groupName: string;
  lastRefreshedAt: Date;
  typeId: number;
  typeName: string;
};

type FittingTypeSkillRequirementRecord = {
  lastRefreshedAt: Date;
  ordinal: number;
  requiredLevel: number;
  skillTypeId: number;
  typeId: number;
};

type RelevantTypeRecord = {
  categoryId: number;
  groupId: number;
  groupName: string;
  typeId: number;
  typeName: string;
};

type SourceCachePopulation = {
  charges: number[];
  drones: number[];
  hulls: number[];
  modules: number[];
};

async function main() {
  console.log(
    "Refreshing Fitting Bay skills and direct skill requirements from CCP SDE JSON Lines."
  );
  console.log(`SDE source: ${SDE_JSONL_ZIP_URL}`);

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is required to refresh Fitting Bay skill data."
    );
  }

  const sourceCaches = await readSourceCachePopulation();
  validateSourceCachePopulation(sourceCaches);
  const cachedSourceTypeIds = new Set(
    Object.values(sourceCaches).flatMap((typeIds) => typeIds)
  );
  const tempRoot = await mkdtemp(
    path.join(tmpdir(), "vyraj-fitting-skills-sde-")
  );

  try {
    const zipPath = path.join(tempRoot, "sde-jsonl.zip");
    const extractDir = path.join(tempRoot, "sde-jsonl");

    await downloadFile(SDE_JSONL_ZIP_URL, zipPath);
    await extractArchive(zipPath, extractDir);

    const files = await findRequiredSdeFiles(extractDir);
    const categories = await readCategories(files.categories);
    validateSkillCategory(categories);
    const groups = await readGroups(files.groups, categories);
    const [attributeDefinitions, unitDefinitions] = await Promise.all([
      readDogmaAttributes(files.dogmaAttributes),
      readDogmaUnits(files.dogmaUnits)
    ]);
    validateSkillRequirementDogmaDefinitions(
      attributeDefinitions,
      unitDefinitions
    );

    const refreshedAt = new Date();
    const typeClassification = await readTypes({
      cachedSourceTypeIds,
      categories,
      filePath: files.types,
      groups,
      refreshedAt
    });
    const requirementClassification = await readDirectRequirements({
      filePath: files.typeDogma,
      relevantTypes: typeClassification.relevantTypes,
      skills: typeClassification.skills,
      refreshedAt
    });

    validateImportPopulation(
      typeClassification.skills,
      requirementClassification.requirements
    );
    logClassificationSummary({
      requirementClassification,
      skills: typeClassification.skills,
      sourceCaches
    });
    logVerificationSamples({
      relevantTypes: typeClassification.relevantTypes,
      requirements: requirementClassification.requirements,
      skills: typeClassification.skills
    });

    const result = await synchronizeFittingSkills({
      requirements: requirementClassification.requirements,
      skills: typeClassification.skills
    });
    logImportSummary(result);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

async function readSourceCachePopulation(): Promise<SourceCachePopulation> {
  const [hulls, modules, charges, drones] = await Promise.all([
    prisma.fittingHull.findMany({ select: { typeId: true } }),
    prisma.fittingModule.findMany({ select: { typeId: true } }),
    prisma.fittingCharge.findMany({ select: { typeId: true } }),
    prisma.fittingDrone.findMany({ select: { typeId: true } })
  ]);

  return {
    charges: charges.map((item) => item.typeId),
    drones: drones.map((item) => item.typeId),
    hulls: hulls.map((item) => item.typeId),
    modules: modules.map((item) => item.typeId)
  };
}

function validateSourceCachePopulation(population: SourceCachePopulation) {
  for (const [cacheName, typeIds] of Object.entries(population)) {
    if (!typeIds.length) {
      throw new Error(
        `The ${cacheName} fitting cache is empty. Refresh all fitting source caches before synchronizing skill requirements.`
      );
    }
  }
}

async function downloadFile(url: string, targetPath: string) {
  console.log("Downloading latest official CCP SDE JSON Lines archive.");
  const response = await fetch(url, {
    headers: {
      accept: "application/zip",
      "user-agent": "VyrajCommandConsoleV2/fitting-skill-refresh"
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
      "dogmaUnits.jsonl",
      "groups.jsonl",
      "typeDogma.jsonl",
      "types.jsonl"
    ])
  );

  return {
    categories: requireSdeFile(discovered, "categories.jsonl"),
    dogmaAttributes: requireSdeFile(discovered, "dogmaAttributes.jsonl"),
    dogmaUnits: requireSdeFile(discovered, "dogmaUnits.jsonl"),
    groups: requireSdeFile(discovered, "groups.jsonl"),
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
    } else if (names.has(entry)) {
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

  if (!categories.size) {
    throw new Error("CCP SDE produced zero categories.");
  }

  return categories;
}

function validateSkillCategory(categories: Map<number, CategoryRecord>) {
  const category = categories.get(SKILL_CATEGORY_ID);

  if (category?.categoryName !== "Skill" || category.published !== true) {
    throw new Error(
      `CCP category ${SKILL_CATEGORY_ID} was expected to be published Skill, but SDE reported ${category?.categoryName || "missing"} (${formatPublished(category?.published)}). Database mutation was skipped.`
    );
  }
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
    groups.set(group._key, {
      categoryId: group.categoryID,
      groupId: group._key,
      groupName:
        published && category.published
          ? requireEnglishName(group.name, `published group ${group._key}`)
          : getEnglishName(group.name),
      published,
      publishedHierarchy: published && category.published
    });
  }

  if (!groups.size) {
    throw new Error("CCP SDE produced zero groups.");
  }

  return groups;
}

async function readDogmaAttributes(filePath: string) {
  const attributes = new Map<number, SdeDogmaAttributeDefinition>();

  for await (const attribute of readJsonLines<SdeDogmaAttributeDefinition>(
    filePath
  )) {
    attributes.set(attribute._key, attribute);
  }

  return attributes;
}

async function readDogmaUnits(filePath: string) {
  const units = new Map<number, SdeDogmaUnitDefinition>();

  for await (const unit of readJsonLines<SdeDogmaUnitDefinition>(filePath)) {
    units.set(unit._key, unit);
  }

  return units;
}

async function readTypes({
  cachedSourceTypeIds,
  categories,
  filePath,
  groups,
  refreshedAt
}: {
  cachedSourceTypeIds: Set<number>;
  categories: Map<number, CategoryRecord>;
  filePath: string;
  groups: Map<number, GroupRecord>;
  refreshedAt: Date;
}) {
  const relevantTypes = new Map<number, RelevantTypeRecord>();
  const skills: FittingSkillRecord[] = [];

  for await (const type of readJsonLines<SdeType>(filePath)) {
    const group = groups.get(type.groupID);

    if (!group) {
      throw new Error(
        `CCP type ${type._key} references missing group ${type.groupID}. Database mutation was skipped.`
      );
    }

    const category = categories.get(group.categoryId);
    const publishedHierarchy =
      type.published === true &&
      group.publishedHierarchy &&
      category?.published === true;
    const isCachedSource = cachedSourceTypeIds.has(type._key);
    const isPublishedSkill =
      publishedHierarchy && group.categoryId === SKILL_CATEGORY_ID;

    if (!isCachedSource && !isPublishedSkill) {
      continue;
    }

    if (!publishedHierarchy) {
      throw new Error(
        `Cached fitting type ${type._key} is no longer reachable through a published CCP type/group/category hierarchy. Refresh specialized fitting caches before skill requirements.`
      );
    }

    const typeName = requireEnglishName(type.name, `published type ${type._key}`);
    const record: RelevantTypeRecord = {
      categoryId: group.categoryId,
      groupId: group.groupId,
      groupName: group.groupName,
      typeId: type._key,
      typeName
    };
    relevantTypes.set(type._key, record);

    if (isPublishedSkill) {
      skills.push({
        groupId: group.groupId,
        groupName: group.groupName,
        lastRefreshedAt: refreshedAt,
        typeId: type._key,
        typeName
      });
    }
  }

  const missingCachedTypeIds = Array.from(cachedSourceTypeIds).filter(
    (typeId) => !relevantTypes.has(typeId)
  );

  if (missingCachedTypeIds.length) {
    throw new Error(
      `${missingCachedTypeIds.length} cached fitting source type(s) are missing from the current published CCP type hierarchy: ${missingCachedTypeIds.slice(0, 20).join(", ")}. Database mutation was skipped.`
    );
  }

  return {
    relevantTypes,
    skills: skills.sort(
      (left, right) =>
        left.groupName.localeCompare(right.groupName, "en-US") ||
        left.typeName.localeCompare(right.typeName, "en-US")
    )
  };
}

async function readDirectRequirements({
  filePath,
  relevantTypes,
  skills,
  refreshedAt
}: {
  filePath: string;
  relevantTypes: Map<number, RelevantTypeRecord>;
  skills: FittingSkillRecord[];
  refreshedAt: Date;
}) {
  const skillTypeIds = new Set(skills.map((skill) => skill.typeId));
  const requirements: FittingTypeSkillRequirementRecord[] = [];
  const seenTypeIds = new Set<number>();
  const malformed: string[] = [];

  for await (const typeDogma of readJsonLines<SdeTypeDogma>(filePath)) {
    if (!relevantTypes.has(typeDogma._key)) {
      continue;
    }

    if (seenTypeIds.has(typeDogma._key)) {
      malformed.push(`Type ${typeDogma._key} repeats in typeDogma.jsonl.`);
      continue;
    }
    seenTypeIds.add(typeDogma._key);

    try {
      for (const requirement of extractDirectSkillRequirements(
        typeDogma._key,
        typeDogma.dogmaAttributes
      )) {
        if (!skillTypeIds.has(requirement.skillTypeId)) {
          throw new Error(
            `Type ${typeDogma._key} references skill type ${requirement.skillTypeId}, which is not a published Category ${SKILL_CATEGORY_ID} skill.`
          );
        }

        requirements.push({
          lastRefreshedAt: refreshedAt,
          ordinal: requirement.ordinal,
          requiredLevel: requirement.requiredLevel,
          skillTypeId: requirement.skillTypeId,
          typeId: typeDogma._key
        });
      }
    } catch (error) {
      malformed.push(
        error instanceof Error ? error.message : `Type ${typeDogma._key} is malformed.`
      );
    }
  }

  if (malformed.length) {
    throw new Error(
      `CCP SDE contained ${malformed.length} malformed direct skill requirement record(s): ${malformed.slice(0, 20).join(" | ")}. Database mutation was skipped.`
    );
  }

  return {
    malformedCount: malformed.length,
    requirements: requirements.sort(
      (left, right) => left.typeId - right.typeId || left.ordinal - right.ordinal
    )
  };
}

function validateImportPopulation(
  skills: FittingSkillRecord[],
  requirements: FittingTypeSkillRequirementRecord[]
) {
  if (!skills.length) {
    throw new Error(
      "CCP SDE produced zero authoritative published skills. Database mutation was skipped."
    );
  }

  if (!requirements.length) {
    throw new Error(
      "CCP SDE produced zero direct requirements for fitting sources and published skills. Database mutation was skipped."
    );
  }

  const skillIds = new Set<number>();
  for (const skill of skills) {
    if (skillIds.has(skill.typeId)) {
      throw new Error(
        `Duplicate skill type ID ${skill.typeId} reached the import population.`
      );
    }
    skillIds.add(skill.typeId);
  }

  const requirementKeys = new Set<string>();
  for (const requirement of requirements) {
    const key = getRequirementKey(requirement.typeId, requirement.ordinal);
    if (requirementKeys.has(key)) {
      throw new Error(`Duplicate direct requirement ${key} reached import.`);
    }
    requirementKeys.add(key);
  }
}

async function synchronizeFittingSkills({
  requirements,
  skills
}: {
  requirements: FittingTypeSkillRequirementRecord[];
  skills: FittingSkillRecord[];
}) {
  const existingSkills = await prisma.fittingSkill.findMany({
    select: {
      groupId: true,
      groupName: true,
      typeId: true,
      typeName: true
    }
  });
  const existingSkillByTypeId = new Map(
    existingSkills.map((skill) => [skill.typeId, skill])
  );
  const incomingSkillTypeIds = new Set(skills.map((skill) => skill.typeId));
  const createdSkills = skills.filter(
    (skill) => !existingSkillByTypeId.has(skill.typeId)
  );
  const changedSkills = skills.filter((skill) => {
    const current = existingSkillByTypeId.get(skill.typeId);
    return current ? skillHasChanged(current, skill) : false;
  });
  const unchangedSkills = skills.filter((skill) => {
    const current = existingSkillByTypeId.get(skill.typeId);
    return current ? !skillHasChanged(current, skill) : false;
  });
  const staleSkillTypeIds = existingSkills
    .filter((skill) => !incomingSkillTypeIds.has(skill.typeId))
    .map((skill) => skill.typeId);

  const existingRequirements =
    await prisma.fittingTypeSkillRequirement.findMany({
      select: {
        ordinal: true,
        requiredLevel: true,
        skillTypeId: true,
        typeId: true
      }
    });
  const existingRequirementByKey = new Map(
    existingRequirements.map((requirement) => [
      getRequirementKey(requirement.typeId, requirement.ordinal),
      requirement
    ])
  );
  const incomingRequirementKeys = new Set(
    requirements.map((requirement) =>
      getRequirementKey(requirement.typeId, requirement.ordinal)
    )
  );
  const createdRequirements = requirements.filter(
    (requirement) =>
      !existingRequirementByKey.has(
        getRequirementKey(requirement.typeId, requirement.ordinal)
      )
  );
  const changedRequirements = requirements.filter((requirement) => {
    const current = existingRequirementByKey.get(
      getRequirementKey(requirement.typeId, requirement.ordinal)
    );
    return current ? requirementHasChanged(current, requirement) : false;
  });
  const unchangedRequirements = requirements.filter((requirement) => {
    const current = existingRequirementByKey.get(
      getRequirementKey(requirement.typeId, requirement.ordinal)
    );
    return current ? !requirementHasChanged(current, requirement) : false;
  });
  const staleRequirements = existingRequirements.filter(
    (requirement) =>
      !incomingRequirementKeys.has(
        getRequirementKey(requirement.typeId, requirement.ordinal)
      )
  );

  for (const batch of chunk(createdSkills, DATABASE_BATCH_SIZE)) {
    await prisma.fittingSkill.createMany({ data: batch });
  }
  for (const batch of chunk(changedSkills, DATABASE_BATCH_SIZE)) {
    await prisma.$transaction(
      batch.map((skill) =>
        prisma.fittingSkill.update({
          data: skill,
          where: { typeId: skill.typeId }
        })
      )
    );
  }
  for (const batch of chunk(unchangedSkills, DATABASE_BATCH_SIZE)) {
    await prisma.fittingSkill.updateMany({
      data: { lastRefreshedAt: skills[0].lastRefreshedAt },
      where: { typeId: { in: batch.map((skill) => skill.typeId) } }
    });
  }

  for (const batch of chunk(createdRequirements, DATABASE_BATCH_SIZE)) {
    await prisma.fittingTypeSkillRequirement.createMany({ data: batch });
  }
  for (const batch of chunk(changedRequirements, DATABASE_BATCH_SIZE)) {
    await prisma.$transaction(
      batch.map((requirement) =>
        prisma.fittingTypeSkillRequirement.update({
          data: requirement,
          where: {
            typeId_ordinal: {
              ordinal: requirement.ordinal,
              typeId: requirement.typeId
            }
          }
        })
      )
    );
  }
  for (const batch of chunk(unchangedRequirements, DATABASE_BATCH_SIZE)) {
    await prisma.fittingTypeSkillRequirement.updateMany({
      data: { lastRefreshedAt: requirements[0].lastRefreshedAt },
      where: {
        OR: batch.map((requirement) => ({
          ordinal: requirement.ordinal,
          typeId: requirement.typeId
        }))
      }
    });
  }

  let removedRequirements = 0;
  for (const batch of chunk(staleRequirements, DATABASE_BATCH_SIZE)) {
    const result = await prisma.fittingTypeSkillRequirement.deleteMany({
      where: {
        OR: batch.map((requirement) => ({
          ordinal: requirement.ordinal,
          typeId: requirement.typeId
        }))
      }
    });
    removedRequirements += result.count;
  }

  let removedSkills = 0;
  for (const batch of chunk(staleSkillTypeIds, DATABASE_BATCH_SIZE)) {
    const result = await prisma.fittingSkill.deleteMany({
      where: { typeId: { in: batch } }
    });
    removedSkills += result.count;
  }

  return {
    requirements: {
      created: createdRequirements.length,
      removed: removedRequirements,
      unchanged: unchangedRequirements.length,
      updated: changedRequirements.length
    },
    skills: {
      created: createdSkills.length,
      removed: removedSkills,
      unchanged: unchangedSkills.length,
      updated: changedSkills.length
    }
  };
}

function skillHasChanged(
  current: Omit<FittingSkillRecord, "lastRefreshedAt">,
  incoming: FittingSkillRecord
) {
  return (
    current.typeName !== incoming.typeName ||
    current.groupId !== incoming.groupId ||
    current.groupName !== incoming.groupName
  );
}

function requirementHasChanged(
  current: Omit<FittingTypeSkillRequirementRecord, "lastRefreshedAt">,
  incoming: FittingTypeSkillRequirementRecord
) {
  return (
    current.skillTypeId !== incoming.skillTypeId ||
    current.requiredLevel !== incoming.requiredLevel
  );
}

function logClassificationSummary({
  requirementClassification,
  skills,
  sourceCaches
}: {
  requirementClassification: Awaited<ReturnType<typeof readDirectRequirements>>;
  skills: FittingSkillRecord[];
  sourceCaches: SourceCachePopulation;
}) {
  const sourceTypeCount = new Set(
    requirementClassification.requirements.map((requirement) =>
      requirement.typeId
    )
  ).size;
  const maxOrdinal = Math.max(
    ...requirementClassification.requirements.map(
      (requirement) => requirement.ordinal
    )
  );

  console.log("Authoritative fitting skill classification:");
  console.log(`- Published Category ${SKILL_CATEGORY_ID} skills: ${skills.length}`);
  console.log(
    `- Cached fitting sources considered: hulls ${sourceCaches.hulls.length}, modules ${sourceCaches.modules.length}, charges ${sourceCaches.charges.length}, drones ${sourceCaches.drones.length}.`
  );
  console.log(`- Types with direct requirements: ${sourceTypeCount}`);
  console.log(
    `- Direct requirement edges: ${requirementClassification.requirements.length}`
  );
  console.log(`- Maximum requirement ordinal used: ${maxOrdinal}`);
  console.log(
    `- Malformed or anomalous skill/level pairs: ${requirementClassification.malformedCount}`
  );
  console.log("- Direct edges only; no transitive closure was materialized.");
}

function logVerificationSamples({
  relevantTypes,
  requirements,
  skills
}: {
  relevantTypes: Map<number, RelevantTypeRecord>;
  requirements: FittingTypeSkillRequirementRecord[];
  skills: FittingSkillRecord[];
}) {
  const typeByName = new Map(
    Array.from(relevantTypes.values()).map((type) => [type.typeName, type])
  );
  const requirementsByTypeId = new Map<
    number,
    FittingTypeSkillRequirementRecord[]
  >();
  const skillByTypeId = new Map(skills.map((skill) => [skill.typeId, skill]));

  for (const requirement of requirements) {
    const current = requirementsByTypeId.get(requirement.typeId) ?? [];
    current.push(requirement);
    requirementsByTypeId.set(requirement.typeId, current);
  }

  console.log("Representative direct requirement verification:");
  for (const verification of VERIFICATION_TYPES) {
    const type = typeByName.get(verification.name);

    if (!type) {
      throw new Error(
        `Verification ${verification.family} ${verification.name} was not found in the relevant current CCP population. Database mutation was skipped.`
      );
    }

    const direct = requirementsByTypeId.get(type.typeId) ?? [];
    const display = direct.length
      ? direct
          .map((requirement) => {
            const skill = skillByTypeId.get(requirement.skillTypeId);
            return `${requirement.ordinal}:${requirement.skillTypeId}/${skill?.typeName || "unknown"} ${requirement.requiredLevel}`;
          })
          .join(", ")
      : "none";

    console.log(
      `- ${verification.family}: ${type.typeId}/${type.typeName}; direct requirements ${display}.`
    );
  }
}

function logImportSummary(result: Awaited<ReturnType<typeof synchronizeFittingSkills>>) {
  console.log("Fitting skill synchronization complete:");
  console.log(
    `- Skills created ${result.skills.created}, updated ${result.skills.updated}, unchanged ${result.skills.unchanged}, removed ${result.skills.removed}.`
  );
  console.log(
    `- Requirements created ${result.requirements.created}, updated ${result.requirements.updated}, unchanged ${result.requirements.unchanged}, removed ${result.requirements.removed}.`
  );
}

function getRequirementKey(typeId: number, ordinal: number) {
  return `${typeId}:${ordinal}`;
}

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

function getEnglishName(name: LocalizedName | undefined) {
  return typeof name?.en === "string" ? name.en.trim() : "";
}

function requireEnglishName(
  name: LocalizedName | undefined,
  context: string
) {
  const englishName = getEnglishName(name);

  if (!englishName) {
    throw new Error(`${context} has no canonical English name.`);
  }

  return englishName;
}

function formatPublished(value: boolean | undefined) {
  return value === undefined ? "missing" : value ? "published" : "unpublished";
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

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Fitting skill refresh failed."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
