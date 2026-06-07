import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const confirmation = process.env.CONFIRM_RESET_OPERATIONAL_DATA;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required before resetting operational data.");
  }

  const counts = {
    operationAttendance: await prisma.operationAttendance.count(),
    operations: await prisma.operation.count(),
    doctrineFitReadiness: await prisma.doctrineFitReadiness.count(),
    doctrinePilots: await prisma.doctrinePilot.count(),
    doctrineFits: await prisma.doctrineFit.count(),
    srpRequests: await prisma.srpRequest.count(),
    recruitmentApplicants: await prisma.recruitmentApplicant.count(),
    lootSplitParticipants: await prisma.lootSplitParticipant.count(),
    lootSplits: await prisma.lootSplit.count()
  };

  console.log("Operational data reset requested. Matching rows:");
  for (const [model, count] of Object.entries(counts)) {
    console.log(`- ${model}: ${count}`);
  }

  if (confirmation !== "YES") {
    throw new Error('Refusing to reset operational data. Set CONFIRM_RESET_OPERATIONAL_DATA="YES" to proceed.');
  }

  await prisma.$transaction([
    prisma.operationAttendance.deleteMany(),
    prisma.doctrineFitReadiness.deleteMany(),
    prisma.doctrinePilot.deleteMany(),
    prisma.lootSplitParticipant.deleteMany(),
    prisma.operation.deleteMany(),
    prisma.doctrineFit.deleteMany(),
    prisma.srpRequest.deleteMany(),
    prisma.recruitmentApplicant.deleteMany(),
    prisma.lootSplit.deleteMany()
  ]);

  console.log("Operational data reset complete.");
  console.log("Preserved corps, officers, permissions, assignments, Alliance Hub content, EVE type lookup, and audit logs.");
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
