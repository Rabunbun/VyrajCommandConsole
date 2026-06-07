import "server-only";
import type { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";

const allowedLimits = [25, 50, 100, 250] as const;
const defaultLimit = 50;

const sensitiveKeyFragments = [
  "password",
  "passwordhash",
  "token",
  "tokenhash",
  "sessiontoken",
  "cookie",
  "secret",
  "authsecret",
  "databaseurl"
];

export type AuditLogFilters = {
  module?: string;
  action?: string;
  officer?: string;
  corp?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: string;
};

export type AuditLogEntryView = {
  id: string;
  createdAt: string;
  officerName: string;
  officerRole: string;
  corpSlug: string;
  corpName: string;
  module: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  summary: string;
  before: unknown;
  after: unknown;
  details: unknown;
};

export type AuditLogFilterOptions = {
  modules: string[];
  actions: string[];
  officers: string[];
  corps: string[];
};

export type AuditLogData = {
  entries: AuditLogEntryView[];
  filterOptions: AuditLogFilterOptions;
  appliedLimit: number;
};

export async function getAuditLogData(
  filters: AuditLogFilters
): Promise<AuditLogData> {
  const where = buildAuditWhere(filters);
  const limit = parseLimit(filters.limit);

  const [entries, filterOptions] = await Promise.all([
    getDb().officerAuditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        createdAt: true,
        officerName: true,
        officerRole: true,
        corpSlug: true,
        corpName: true,
        module: true,
        action: true,
        targetType: true,
        targetId: true,
        targetName: true,
        summary: true,
        before: true,
        after: true,
        details: true
      }
    }),
    getAuditFilterOptions()
  ]);

  return {
    entries: entries.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      before: redactAuditPayload(entry.before),
      after: redactAuditPayload(entry.after),
      details: redactAuditPayload(entry.details)
    })),
    filterOptions,
    appliedLimit: limit
  };
}

export function redactAuditPayload(value: unknown): unknown {
  const secrets: string[] = [
    process.env.AUTH_SESSION_SECRET,
    process.env.DATABASE_URL
  ].filter((secret): secret is string => Boolean(secret));

  return redactValue(value, secrets);
}

export function parseLimit(value: string | undefined) {
  const limit = Number(value);

  return allowedLimits.includes(limit as (typeof allowedLimits)[number])
    ? limit
    : defaultLimit;
}

export function getAllowedAuditLimits() {
  return allowedLimits;
}

function buildAuditWhere(filters: AuditLogFilters): Prisma.OfficerAuditLogWhereInput {
  const where: Prisma.OfficerAuditLogWhereInput = {};
  const and: Prisma.OfficerAuditLogWhereInput[] = [];

  if (filters.module) {
    and.push({ module: filters.module });
  }

  if (filters.action) {
    and.push({ action: filters.action });
  }

  if (filters.officer) {
    and.push({ officerName: filters.officer });
  }

  if (filters.corp) {
    and.push({
      OR: [
        { corpName: filters.corp },
        { corpSlug: filters.corp }
      ]
    });
  }

  const dateRange = buildDateRange(filters.dateFrom, filters.dateTo);

  if (dateRange) {
    and.push({ createdAt: dateRange });
  }

  const search = filters.search?.trim();

  if (search) {
    and.push({
      OR: [
        { officerName: { contains: search, mode: "insensitive" } },
        { officerRole: { contains: search, mode: "insensitive" } },
        { corpName: { contains: search, mode: "insensitive" } },
        { corpSlug: { contains: search, mode: "insensitive" } },
        { module: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
        { targetType: { contains: search, mode: "insensitive" } },
        { targetId: { contains: search, mode: "insensitive" } },
        { targetName: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } }
      ]
    });
  }

  if (and.length) {
    where.AND = and;
  }

  return where;
}

function buildDateRange(dateFrom?: string, dateTo?: string) {
  const range: Prisma.DateTimeFilter = {};
  const from = parseDateOnly(dateFrom, "start");
  const to = parseDateOnly(dateTo, "end");

  if (from) {
    range.gte = from;
  }

  if (to) {
    range.lte = to;
  }

  return range.gte || range.lte ? range : null;
}

function parseDateOnly(value: string | undefined, edge: "start" | "end") {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (edge === "end") {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

async function getAuditFilterOptions(): Promise<AuditLogFilterOptions> {
  const rows = await getDb().officerAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 1000,
    select: {
      module: true,
      action: true,
      officerName: true,
      corpName: true,
      corpSlug: true
    }
  });

  return {
    modules: uniqueSorted(rows.map((row) => row.module)),
    actions: uniqueSorted(rows.map((row) => row.action)),
    officers: uniqueSorted(rows.map((row) => row.officerName)),
    corps: uniqueSorted(
      rows.map((row) => row.corpName || row.corpSlug)
    )
  };
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
    .sort((first, second) => first.localeCompare(second));
}

function redactValue(value: unknown, secrets: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secrets));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : redactValue(nestedValue, secrets)
      ])
    );
  }

  if (typeof value === "string" && secrets.some((secret) => secret === value)) {
    return "[REDACTED]";
  }

  return value;
}

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  return sensitiveKeyFragments.some((fragment) => normalized.includes(fragment));
}
