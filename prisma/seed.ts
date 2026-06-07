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

const prisma = new PrismaClient();

const enabledModules = {
  attendance: true,
  doctrine: true,
  srp: true,
  recruitment: true,
  loot: true,
  dashboard: true
};

const corps = [
  {
    slug: "totality-squad",
    name: "Totality Squad",
    ticker: "TOTL",
    description: "Primary command corp for alliance operations.",
    recruitmentStatus: "Reviewing",
    activeMembers: 48,
    recentOps: 7,
    pendingSrp: 4,
    doctrineReadinessPercent: 72,
    announcements: [
      "Update SRP requests before the weekly payout review.",
      "Doctrine readiness check is open for mainline fleet fits."
    ]
  },
  {
    slug: "vanguard-wing",
    name: "Vanguard Wing",
    ticker: "VGRD",
    description: "Forward deployment and fleet support corp.",
    recruitmentStatus: "Open",
    activeMembers: 31,
    recentOps: 5,
    pendingSrp: 2,
    doctrineReadinessPercent: 65,
    announcements: [
      "Forward staging inventory review is pending.",
      "Scout roster coordination is ready for corp updates."
    ]
  },
  {
    slug: "industrial-command",
    name: "Industrial Command",
    ticker: "INDC",
    description: "Industry, logistics, market, and resource operation corp.",
    recruitmentStatus: "Selective",
    activeMembers: 26,
    recentOps: 3,
    pendingSrp: 1,
    doctrineReadinessPercent: 81,
    announcements: [
      "Moon pull schedule updates are ready for corp review.",
      "Hauler readiness coordination is available for corp updates."
    ]
  }
];

const hubContent = [
  {
    title: "Alliance portal online",
    body: "Corp portals are routed through the Alliance Hub. Use the Alliance Hub Editor to manage live announcements and alerts.",
    audience: ContentAudience.ALL_MEMBERS
  },
  {
    title: "Doctrine readiness review",
    body: "Doctrine readiness is tracked per corp. Open a corp portal to review active fits and member readiness.",
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
const devSuperAdminPassword =
  process.env.DEV_SUPER_ADMIN_PASSWORD?.trim() || defaultDevSuperAdminPassword;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required before running prisma:seed.");
  }

  for (const corp of corps) {
    await prisma.corp.upsert({
      where: { slug: corp.slug },
      update: {
        name: corp.name,
        ticker: corp.ticker,
        description: corp.description,
        status: CorpStatus.ACTIVE,
        recruitmentStatus: corp.recruitmentStatus,
        activeMembers: corp.activeMembers,
        recentOps: corp.recentOps,
        pendingSrp: corp.pendingSrp,
        doctrineReadinessPercent: corp.doctrineReadinessPercent,
        announcements: corp.announcements,
        enabledModules
      },
      create: {
        slug: corp.slug,
        name: corp.name,
        ticker: corp.ticker,
        description: corp.description,
        status: CorpStatus.ACTIVE,
        recruitmentStatus: corp.recruitmentStatus,
        activeMembers: corp.activeMembers,
        recentOps: corp.recentOps,
        pendingSrp: corp.pendingSrp,
        doctrineReadinessPercent: corp.doctrineReadinessPercent,
        announcements: corp.announcements,
        enabledModules,
        legacySheetName: "Corp Registry"
      }
    });
  }

  for (const item of hubContent) {
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
      createdBy: "Config Seed",
      legacySheetName: "Alliance Hub Content"
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

  for (const item of eveTypes) {
    await prisma.eveTypeLookup.upsert({
      where: { typeName: item.typeName },
      update: { category: item.category },
      create: {
        typeName: item.typeName,
        category: item.category,
        legacySheetName: "EVE Type Lookup"
      }
    });
  }

  for (const officerName of superAdmins) {
    const passwordHash = await hashPassword(devSuperAdminPassword);
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
          disabledAt: null
        }
      });

      await assertSeededPasswordVerifies(officerName, passwordHash);

      continue;
    }

    await prisma.officer.create({
      data: {
        officerName,
        role: OfficerRole.SUPER_ADMIN,
        passwordHash,
        status: OfficerStatus.ACTIVE,
        legacySheetName: "Officers"
      }
    });

    await assertSeededPasswordVerifies(officerName, passwordHash);
  }
}

async function assertSeededPasswordVerifies(officerName: string, passwordHash: string) {
  const verified = await verifyPassword(devSuperAdminPassword, passwordHash);

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
