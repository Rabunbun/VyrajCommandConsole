import "dotenv/config";
import {
  AllianceContentPriority,
  AllianceContentType,
  ContentAudience,
  ContentStatus,
  CorpStatus,
  OfficerRole,
  OfficerStatus,
  PrismaClient
} from "@prisma/client";
import { hashPassword, verifyPassword } from "../src/lib/password";

type SeedMode = "dev" | "prod";

type CorpSeed = {
  slug: string;
  name: string;
  ticker: string;
  description: string;
};

const prisma = new PrismaClient();

const enabledModules = {
  attendance: true,
  doctrine: true,
  srp: true,
  recruitment: true,
  lootSplits: true,
  dashboard: true
};

const baselineCorps: CorpSeed[] = [
  {
    slug: "totality-squad",
    name: "Totality Squad",
    ticker: "TOTL",
    description: "Primary command corp for alliance operations."
  },
  {
    slug: "abyssal-construction-and-extraction",
    name: "Abyssal Construction and Extraction",
    ticker: "",
    description: "Alliance corp registry record."
  },
  {
    slug: "pochven-police-department",
    name: "Pochven Police Department",
    ticker: "",
    description: "Alliance corp registry record."
  },
  {
    slug: "striking-distance",
    name: "Striking Distance",
    ticker: "SK.DS",
    description: "Alliance corp registry record."
  }
];

const starterHubContent = [
  {
    title: "Alliance command console online",
    body: "The Vyraj Alliance Command Console is online. Corp portals and member modules are available from the Alliance Hub.",
    audience: ContentAudience.ALL_MEMBERS
  },
  {
    title: "Command tools ready",
    body: "Officer tools are ready for corp administration, module review, and Alliance Hub updates.",
    audience: ContentAudience.OFFICERS
  }
];

const eveTypes = [
  { typeName: "Merlin", category: "Frigate" },
  { typeName: "Caracal", category: "Cruiser" },
  { typeName: "Astero", category: "Frigate" },
  { typeName: "Kikimora", category: "Destroyer" },
  { typeName: "Vedmak", category: "Cruiser" },
  { typeName: "Drekavac", category: "Battlecruiser" },
  { typeName: "Leshak", category: "Battleship" }
];

const superAdmins = ["Jason Roderick", "EmperorVeles"];
const defaultDevSuperAdminPassword = "VyrajDev!ChangeMe123";

async function main() {
  const mode = getSeedMode();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required before running the Prisma seed.");
  }

  const superAdminPassword = getSuperAdminSeedPassword(mode);
  const passwordHash = await hashPassword(superAdminPassword);

  await seedCorps();
  await seedAllianceHubContent();
  await seedEveTypeLookup();
  await seedSuperAdmins(passwordHash, superAdminPassword);

  console.log(`Seed complete in ${mode} mode.`);
  console.log("No operational data, readiness submissions, SRP requests, recruitment rows, loot splits, or v1 audit logs were seeded.");
}

function getSeedMode(): SeedMode {
  const cliMode = process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1];
  const mode = cliMode || process.env.PRISMA_SEED_MODE || "dev";

  if (mode === "dev" || mode === "prod") {
    return mode;
  }

  throw new Error('Seed mode must be "dev" or "prod". Use --mode=prod for the production baseline.');
}

function getSuperAdminSeedPassword(mode: SeedMode) {
  const password =
    process.env.SEED_SUPER_ADMIN_PASSWORD?.trim() ||
    process.env.DEV_SUPER_ADMIN_PASSWORD?.trim() ||
    "";

  if (mode === "dev") {
    return password || defaultDevSuperAdminPassword;
  }

  if (!password) {
    throw new Error("SEED_SUPER_ADMIN_PASSWORD or DEV_SUPER_ADMIN_PASSWORD is required for production baseline seeding.");
  }

  if (password === defaultDevSuperAdminPassword) {
    throw new Error("Production baseline seeding refuses to use the default dev Super Admin password.");
  }

  return password;
}

async function seedCorps() {
  for (const corp of baselineCorps) {
    await prisma.corp.upsert({
      where: { slug: corp.slug },
      update: {
        name: corp.name,
        ticker: corp.ticker,
        description: corp.description,
        status: CorpStatus.ACTIVE,
        recruitmentStatus: "Unknown",
        activeMembers: 0,
        recentOps: 0,
        pendingSrp: 0,
        doctrineReadinessPercent: 0,
        announcements: [],
        enabledModules
      },
      create: {
        slug: corp.slug,
        name: corp.name,
        ticker: corp.ticker,
        description: corp.description,
        status: CorpStatus.ACTIVE,
        recruitmentStatus: "Unknown",
        activeMembers: 0,
        recentOps: 0,
        pendingSrp: 0,
        doctrineReadinessPercent: 0,
        announcements: [],
        enabledModules
      }
    });
  }

  console.log(`Seeded ${baselineCorps.length} baseline corp registry records.`);
}

async function seedAllianceHubContent() {
  for (const item of starterHubContent) {
    const existing = await prisma.allianceHubContent.findFirst({
      where: { title: item.title }
    });

    const data = {
      contentType: AllianceContentType.ANNOUNCEMENT,
      title: item.title,
      body: item.body,
      audience: item.audience,
      priority: AllianceContentPriority.NORMAL,
      status: ContentStatus.ACTIVE,
      createdBy: "Production Baseline Seed",
      legacySheetName: null,
      legacyRowNumber: null,
      legacyImportedAt: null
    };

    if (existing) {
      await prisma.allianceHubContent.update({
        where: { id: existing.id },
        data
      });
    } else {
      await prisma.allianceHubContent.create({ data });
    }
  }

  console.log(`Seeded ${starterHubContent.length} starter Alliance Hub content records.`);
}

async function seedEveTypeLookup() {
  for (const item of eveTypes) {
    await prisma.eveTypeLookup.upsert({
      where: { typeName: item.typeName },
      update: {
        category: item.category,
        legacySheetName: null,
        legacyRowNumber: null,
        legacyImportedAt: null
      },
      create: {
        typeName: item.typeName,
        category: item.category
      }
    });
  }

  console.log(`Seeded ${eveTypes.length} EVE type lookup records.`);
}

async function seedSuperAdmins(passwordHash: string, superAdminPassword: string) {
  for (const officerName of superAdmins) {
    const existing = await prisma.officer.findFirst({
      where: {
        officerName: {
          equals: officerName,
          mode: "insensitive"
        }
      }
    });

    if (existing) {
      await prisma.officer.update({
        where: { id: existing.id },
        data: {
          officerName,
          role: OfficerRole.SUPER_ADMIN,
          passwordHash,
          status: OfficerStatus.ACTIVE,
          disabledAt: null,
          legacySheetName: null,
          legacyRowNumber: null,
          legacyImportedAt: null
        }
      });
    } else {
      await prisma.officer.create({
        data: {
          officerName,
          role: OfficerRole.SUPER_ADMIN,
          passwordHash,
          status: OfficerStatus.ACTIVE
        }
      });
    }

    await assertSeededPasswordVerifies(officerName, superAdminPassword, passwordHash);
  }
}

async function assertSeededPasswordVerifies(officerName: string, password: string, passwordHash: string) {
  const verified = await verifyPassword(password, passwordHash);

  if (!verified) {
    throw new Error(`Seeded Super Admin password verification failed for ${officerName}.`);
  }

  console.log(`Seeded Super Admin ready: ${officerName}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
