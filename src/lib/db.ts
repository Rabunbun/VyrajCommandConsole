import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  vyrajPrisma?: PrismaClient;
};

export type DatabaseHealth =
  | {
      configured: false;
      status: "not_configured";
      message: string;
    }
  | {
      configured: true;
      status: "connected";
      message: string;
    }
  | {
      configured: true;
      status: "error";
      message: string;
    };

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

export function getDb() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalForPrisma.vyrajPrisma) {
    globalForPrisma.vyrajPrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
  }

  return globalForPrisma.vyrajPrisma;
}

export async function checkDatabaseConnection(): Promise<DatabaseHealth> {
  if (!isDatabaseConfigured()) {
    return {
      configured: false,
      status: "not_configured",
      message: "DATABASE_URL is not configured."
    };
  }

  try {
    await getDb().$queryRaw`SELECT 1`;

    return {
      configured: true,
      status: "connected",
      message: "Database connection succeeded."
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";

    return {
      configured: true,
      status: "error",
      message
    };
  }
}
