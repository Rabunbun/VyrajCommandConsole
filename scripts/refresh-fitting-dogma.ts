import "dotenv/config";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import {
  FittingDogmaEffectCapability,
  Prisma,
  PrismaClient
} from "@prisma/client";
import { DOGMA_PROJECTION_VERSION } from "../src/lib/fitting/dogma";
import {
  buildFittingDogmaProjection,
  type SdeDogmaAttribute,
  type SdeDogmaCategory,
  type SdeDogmaEffect,
  type SdeDogmaGroup,
  type SdeDogmaType,
  type SdeDogmaUnit,
  type SdeTypeDogma
} from "./lib/fitting-dogma-projection";

const prisma = new PrismaClient();
const LATEST_SDE_URL =
  "https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip";
const LATEST_SDE_METADATA_URL =
  "https://developers.eveonline.com/static-data/tranquility/latest.jsonl";
const DATABASE_BATCH_SIZE = 200;
const BUILD_RECORD_ID = "current";

type RequiredSdeFiles = Readonly<{
  categories: string;
  dogmaAttributes: string;
  dogmaEffects: string;
  dogmaUnits: string;
  groups: string;
  typeDogma: string;
  types: string;
}>;

async function main() {
  console.log("Refreshing the versioned Fitting Bay Dogma projection from CCP SDE.");
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required to refresh fitting Dogma data.");
  }

  const rootTypeIds = await readProjectionRoots();
  if (!rootTypeIds.size) {
    throw new Error("Current fitting caches contain no Dogma projection roots.");
  }
  const source = await resolveCurrentSdeSource();
  console.log(`SDE build: ${source.build}`);
  console.log(`SDE source: ${source.url}`);

  const tempRoot = await mkdtemp(path.join(tmpdir(), "vyraj-fitting-dogma-sde-"));
  try {
    const zipPath = path.join(tempRoot, "sde-jsonl.zip");
    const extractDir = path.join(tempRoot, "sde-jsonl");
    await downloadFile(source.url, zipPath);
    const confirmedSource = await resolveCurrentSdeSource();
    if (confirmedSource.build !== source.build) {
      throw new Error(
        `CCP SDE advanced from build ${source.build} to ${confirmedSource.build} during download. Rerun the refresh against one stable build.`
      );
    }
    await extractArchive(zipPath, extractDir);
    const files = await findRequiredSdeFiles(extractDir);

    const [categories, groups, types, attributes, effects, units, typeDogma] =
      await Promise.all([
        readJsonLinesMap<SdeDogmaCategory>(files.categories),
        readJsonLinesMap<SdeDogmaGroup>(files.groups),
        readTypeMap(files.types),
        readJsonLinesMap<SdeDogmaAttribute>(files.dogmaAttributes),
        readJsonLinesMap<SdeDogmaEffect>(files.dogmaEffects),
        readJsonLinesMap<SdeDogmaUnit>(files.dogmaUnits),
        readJsonLinesMap<SdeTypeDogma>(files.typeDogma)
      ]);

    const built = buildFittingDogmaProjection({
      attributes,
      categories,
      effects,
      groups,
      rootTypeIds,
      sdeBuild: source.build,
      typeDogma,
      types,
      units
    });
    logImportReport(built);
    verifyRepresentativeProjection(built, types);

    if (process.argv.includes("--validate-only")) {
      console.log("Validation-only mode completed; database mutation was skipped.");
      return;
    }

    const refreshedAt = new Date();
    await synchronizeProjection({ built, refreshedAt });
    console.log("Fitting Dogma projection refresh completed successfully.");
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
    await prisma.$disconnect();
  }
}

async function readProjectionRoots() {
  const [hulls, modules, charges, drones, skills] = await Promise.all([
    prisma.fittingHull.findMany({ select: { typeId: true } }),
    prisma.fittingModule.findMany({ select: { typeId: true } }),
    prisma.fittingCharge.findMany({ select: { typeId: true } }),
    prisma.fittingDrone.findMany({ select: { typeId: true } }),
    prisma.fittingSkill.findMany({ select: { typeId: true } })
  ]);
  const roots = new Set(
    [hulls, modules, charges, drones, skills].flatMap((records) =>
      records.map((record) => record.typeId)
    )
  );
  console.log(
    `Projection roots: ${roots.size} unique (${hulls.length} hulls, ${modules.length} modules, ${charges.length} charges, ${drones.length} drones, ${skills.length} skills).`
  );
  return roots;
}

async function resolveCurrentSdeSource() {
  const response = await fetch(LATEST_SDE_METADATA_URL, {
    headers: { "User-Agent": "VyrajCommandConsole/1.0 fitting-dogma-refresh" }
  });
  if (!response.ok) {
    throw new Error(`CCP SDE metadata request failed with HTTP ${response.status}.`);
  }
  const metadata = (await response.json()) as {
    _key?: string;
    buildNumber?: number;
    releaseDate?: string;
  };
  if (
    metadata._key !== "sde" ||
    !Number.isSafeInteger(metadata.buildNumber) ||
    (metadata.buildNumber ?? 0) < 1 ||
    !metadata.releaseDate
  ) {
    throw new Error("CCP latest.jsonl returned malformed SDE metadata.");
  }
  return {
    build: String(metadata.buildNumber),
    url: LATEST_SDE_URL
  };
}

async function downloadFile(url: string, destination: string) {
  console.log("Downloading official CCP SDE JSON Lines archive.");
  const response = await fetch(url, {
    headers: { "User-Agent": "VyrajCommandConsole/1.0 fitting-dogma-refresh" }
  });
  if (!response.ok) {
    throw new Error(`CCP SDE download failed with HTTP ${response.status}.`);
  }
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function extractArchive(zipPath: string, destination: string) {
  await mkdir(destination, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xf", zipPath, "-C", destination], {
      stdio: "inherit",
      windowsHide: true
    });
    child.once("error", (error) => reject(new Error(`Unable to extract SDE archive: ${error.message}.`)));
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`SDE archive extraction failed with exit code ${code}.`))
    );
  });
}

async function findRequiredSdeFiles(root: string): Promise<RequiredSdeFiles> {
  const required = [
    "categories.jsonl",
    "dogmaAttributes.jsonl",
    "dogmaEffects.jsonl",
    "dogmaUnits.jsonl",
    "groups.jsonl",
    "typeDogma.jsonl",
    "types.jsonl"
  ];
  const discovered = new Map<string, string>();
  await walk(root, async (filePath) => {
    const name = path.basename(filePath);
    if (required.includes(name)) discovered.set(name, filePath);
  });
  const get = (name: string) => {
    const file = discovered.get(name);
    if (!file) throw new Error(`SDE archive did not include ${name}.`);
    return file;
  };
  return {
    categories: get("categories.jsonl"),
    dogmaAttributes: get("dogmaAttributes.jsonl"),
    dogmaEffects: get("dogmaEffects.jsonl"),
    dogmaUnits: get("dogmaUnits.jsonl"),
    groups: get("groups.jsonl"),
    typeDogma: get("typeDogma.jsonl"),
    types: get("types.jsonl")
  };
}

async function walk(root: string, visit: (filePath: string) => Promise<void>) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) await walk(entryPath, visit);
    else if (entry.isFile()) await visit(entryPath);
  }
}

async function readJsonLinesMap<T extends { _key: number }>(filePath: string) {
  const records = new Map<number, T>();
  const lines = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(filePath, { encoding: "utf8" })
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as T;
    if (!Number.isSafeInteger(record._key) || records.has(record._key)) {
      throw new Error(`Malformed or duplicate SDE key in ${path.basename(filePath)}.`);
    }
    records.set(record._key, record);
  }
  if (!records.size) throw new Error(`${path.basename(filePath)} is empty.`);
  return records;
}

async function readTypeMap(filePath: string) {
  const records = new Map<number, SdeDogmaType>();
  const lines = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(filePath, { encoding: "utf8" })
  });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const raw = JSON.parse(line) as SdeDogmaType;
    if (!Number.isSafeInteger(raw._key) || records.has(raw._key)) {
      throw new Error("Malformed or duplicate SDE type key.");
    }
    records.set(raw._key, {
      _key: raw._key,
      groupID: raw.groupID,
      name: raw.name,
      published: raw.published
    });
  }
  return records;
}

async function synchronizeProjection(input: {
  built: ReturnType<typeof buildFittingDogmaProjection>;
  refreshedAt: Date;
}) {
  console.log("Synchronizing validated Dogma projection in bounded batches.");
  await batchedTransactions(input.built.attributes, (attribute) =>
    prisma.fittingDogmaAttribute.upsert({
      create: { ...attribute, lastRefreshedAt: input.refreshedAt },
      update: { ...attribute, lastRefreshedAt: input.refreshedAt },
      where: { attributeId: attribute.attributeId }
    })
  );
  await batchedTransactions(input.built.effects, (effect) => {
    const data = {
      capability: prismaCapability(effect.capability),
      categoryId: effect.categoryId,
      dischargeAttributeId: effect.dischargeAttributeId,
      durationAttributeId: effect.durationAttributeId,
      lastRefreshedAt: input.refreshedAt,
      name: effect.name
    };
    return prisma.fittingDogmaEffect.upsert({
      create: { effectId: effect.effectId, ...data },
      update: data,
      where: { effectId: effect.effectId }
    });
  });
  await batchedTransactions(input.built.modifiers, (modifier) => {
    const data = {
      domain: modifier.domain,
      functionName: modifier.functionName,
      groupId: modifier.groupId,
      lastRefreshedAt: input.refreshedAt,
      modifiedAttributeId: modifier.modifiedAttributeId,
      modifyingAttributeId: modifier.modifyingAttributeId,
      operation: modifier.operation,
      skillTypeId: modifier.skillTypeId
    };
    return prisma.fittingDogmaEffectModifier.upsert({
      create: { effectId: modifier.effectId, ordinal: modifier.ordinal, ...data },
      update: data,
      where: {
        effectId_ordinal: {
          effectId: modifier.effectId,
          ordinal: modifier.ordinal
        }
      }
    });
  });
  await batchedTransactions(input.built.projections, (projection) => {
    const data = {
      attributes: projection.attributes as unknown as Prisma.InputJsonValue,
      categoryId: projection.categoryId,
      checksum: projection.checksum,
      effects: projection.effects as unknown as Prisma.InputJsonValue,
      groupId: projection.groupId,
      lastRefreshedAt: input.refreshedAt,
      projectionVersion: DOGMA_PROJECTION_VERSION,
      requiredSkillTypeIds: [...projection.requiredSkillTypeIds],
      sdeBuild: input.built.sdeBuild
    };
    return prisma.fittingDogmaTypeProjection.upsert({
      create: { typeId: projection.typeId, ...data },
      update: data,
      where: { typeId: projection.typeId }
    });
  });

  await prisma.$transaction([
    prisma.fittingDogmaEffectModifier.deleteMany({
      where: { lastRefreshedAt: { lt: input.refreshedAt } }
    }),
    prisma.fittingDogmaTypeProjection.deleteMany({
      where: { lastRefreshedAt: { lt: input.refreshedAt } }
    }),
    prisma.fittingDogmaEffect.deleteMany({
      where: { lastRefreshedAt: { lt: input.refreshedAt } }
    }),
    prisma.fittingDogmaAttribute.deleteMany({
      where: { lastRefreshedAt: { lt: input.refreshedAt } }
    })
  ]);

  const report = input.built.report;
  await prisma.fittingDogmaProjectionBuild.upsert({
    create: {
      attributeDefinitionCount: report.attributeDefinitionCount,
      checksum: input.built.checksum,
      closureTypeCount: report.closureTypeCount,
      domains: [...input.built.encountered.domains],
      effectDefinitionCount: report.effectDefinitionCount,
      genericEffectCount: report.genericEffectCount,
      id: BUILD_RECORD_ID,
      lastRefreshedAt: input.refreshedAt,
      malformedReferenceCount: report.malformedReferenceCount,
      metadataEffectCount: report.metadataEffectCount,
      modifierCount: report.modifierCount,
      modifierFunctions: [...input.built.encountered.functions],
      operationIds: [...input.built.encountered.operationIds],
      projectedTypeCount: report.projectedTypeCount,
      projectionVersion: DOGMA_PROJECTION_VERSION,
      rootTypeCount: report.rootTypeCount,
      sdeBuild: input.built.sdeBuild,
      specialHandlerEffectCount: report.requiresSpecialHandlerCount,
      unknownEffectCount: report.unknownEffectCount
    },
    update: {
      attributeDefinitionCount: report.attributeDefinitionCount,
      checksum: input.built.checksum,
      closureTypeCount: report.closureTypeCount,
      domains: [...input.built.encountered.domains],
      effectDefinitionCount: report.effectDefinitionCount,
      genericEffectCount: report.genericEffectCount,
      lastRefreshedAt: input.refreshedAt,
      malformedReferenceCount: report.malformedReferenceCount,
      metadataEffectCount: report.metadataEffectCount,
      modifierCount: report.modifierCount,
      modifierFunctions: [...input.built.encountered.functions],
      operationIds: [...input.built.encountered.operationIds],
      projectedTypeCount: report.projectedTypeCount,
      projectionVersion: DOGMA_PROJECTION_VERSION,
      rootTypeCount: report.rootTypeCount,
      sdeBuild: input.built.sdeBuild,
      specialHandlerEffectCount: report.requiresSpecialHandlerCount,
      unknownEffectCount: report.unknownEffectCount
    },
    where: { id: BUILD_RECORD_ID }
  });
}

async function batchedTransactions<T>(
  records: readonly T[],
  operation: (record: T) => Prisma.PrismaPromise<unknown>
) {
  for (let index = 0; index < records.length; index += DATABASE_BATCH_SIZE) {
    await prisma.$transaction(
      records.slice(index, index + DATABASE_BATCH_SIZE).map(operation)
    );
  }
}

function prismaCapability(capability: string) {
  switch (capability) {
    case "generic-modifier":
      return FittingDogmaEffectCapability.GENERIC_MODIFIER;
    case "metadata-nonexecuting":
      return FittingDogmaEffectCapability.METADATA_NONEXECUTING;
    case "requires-special-handler":
      return FittingDogmaEffectCapability.REQUIRES_SPECIAL_HANDLER;
    default:
      return FittingDogmaEffectCapability.UNSUPPORTED_UNKNOWN;
  }
}

function logImportReport(built: ReturnType<typeof buildFittingDogmaProjection>) {
  const report = built.report;
  console.log("Validated fitting Dogma projection:");
  console.log(`- Root types: ${report.rootTypeCount}`);
  console.log(`- Closure/projected types: ${report.closureTypeCount}/${report.projectedTypeCount}`);
  console.log(`- Attribute definitions: ${report.attributeDefinitionCount}`);
  console.log(`- Effect definitions/modifiers: ${report.effectDefinitionCount}/${report.modifierCount}`);
  console.log(`- Generic effects: ${report.genericEffectCount}`);
  console.log(`- Metadata/nonexecuting effects: ${report.metadataEffectCount}`);
  console.log(`- Requires special handler: ${report.requiresSpecialHandlerCount}`);
  console.log(`- Unknown/unclassified: ${report.unknownEffectCount}`);
  console.log(`- Malformed references: ${report.malformedReferenceCount}`);
  console.log(`- Operations: ${built.encountered.operationIds.join(", ") || "none"}`);
  console.log(`- Domains: ${built.encountered.domains.join(", ") || "none"}`);
  console.log(`- Functions: ${built.encountered.functions.join(", ") || "none"}`);
  console.log(`- Projection checksum: ${built.checksum}`);
  console.log(`- SDE build: ${built.sdeBuild}`);
  const specialEffects = built.effects.filter(
    (effect) => effect.capability === "requires-special-handler"
  );
  const specialByCategory = new Map<number, number>();
  for (const effect of specialEffects) {
    specialByCategory.set(
      effect.categoryId,
      (specialByCategory.get(effect.categoryId) ?? 0) + 1
    );
  }
  console.log(
    `- Special-handler categories: ${[...specialByCategory.entries()]
      .sort(([left], [right]) => left - right)
      .map(([categoryId, count]) => `${categoryId}:${count}`)
      .join(", ") || "none"}`
  );
  console.log(
    `- Special-handler sample: ${specialEffects
      .slice(0, 20)
      .map((effect) => `${effect.effectId}/${effect.name}`)
      .join(", ") || "none"}`
  );
}

function verifyRepresentativeProjection(
  built: ReturnType<typeof buildFittingDogmaProjection>,
  types: ReadonlyMap<number, SdeDogmaType>
) {
  const projectionByTypeId = new Map(
    built.projections.map((projection) => [projection.typeId, projection])
  );
  const effectById = new Map(
    built.effects.map((effect) => [effect.effectId, effect])
  );
  const representatives = [
    { kind: "hull", name: "Vexor", requiresSkillFilter: true },
    { kind: "hull", name: "Apocalypse", requiresSkillFilter: true },
    { kind: "hull", name: "Vedmak", requiresSkillFilter: true },
    { kind: "hull", name: "Orthrus", requiresSkillFilter: true },
    { kind: "hull", name: "Iteron Mark V", requiresSkillFilter: true },
    { kind: "CPU", name: "CPU Management", requiresSkillFilter: false },
    { kind: "CPU", name: "Co-Processor II", requiresSkillFilter: false },
    { kind: "CPU", name: "Weapon Upgrades", requiresSkillFilter: false },
    { kind: "PG", name: "Power Grid Management", requiresSkillFilter: false },
    { kind: "PG", name: "Reactor Control Unit II", requiresSkillFilter: false },
    { kind: "PG", name: "Advanced Weapon Upgrades", requiresSkillFilter: false },
    { kind: "PG rig", name: "Small Ancillary Current Router I", requiresSkillFilter: false }
  ] as const;

  console.log("Representative projection verification:");
  for (const representative of representatives) {
    const matchingTypes = [...types.values()].filter(
      (type) => type.name?.en === representative.name
    );
    if (matchingTypes.length !== 1) {
      throw new Error(
        `Expected exactly one SDE type named ${representative.name}, found ${matchingTypes.length}.`
      );
    }
    const type = matchingTypes[0];
    const projection = projectionByTypeId.get(type._key);
    if (!projection) {
      throw new Error(
        `Representative ${representative.name} (${type._key}) is outside the fitting Dogma projection.`
      );
    }
    if (!projection.attributes.length || !projection.effects.length) {
      throw new Error(
        `Representative ${representative.name} has an incomplete Dogma projection.`
      );
    }
    if (representative.requiresSkillFilter) {
      const retainsSkillFilter = projection.effects.some((effectReference) =>
        effectById
          .get(effectReference.effectId)
          ?.modifiers.some((modifier) => modifier.skillTypeId !== null)
      );
      if (!retainsSkillFilter) {
        throw new Error(
          `Representative hull ${representative.name} retained no skill-filtered modifier chain.`
        );
      }
    }
    console.log(
      `- ${representative.kind}: ${representative.name} (${type._key}) — ${projection.attributes.length} attributes, ${projection.effects.length} effects`
    );
  }
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
