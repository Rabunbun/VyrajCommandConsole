import "server-only";
import { CorpStatus, OfficerRole, type Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import type { CurrentOfficerSession } from "@/lib/session";

export const lootSplitStatusOptions = [
  "DRAFT",
  "CALCULATED",
  "READY",
  "PAID",
  "CANCELLED"
] as const;

export type LootSplitStatus = (typeof lootSplitStatusOptions)[number];

export type LootSplitCorpView = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  status: CorpStatus;
};

export type LootSplitParticipantView = {
  id: string;
  pilotName: string;
  characterName: string;
  shares: string;
  payoutAmount: string;
  notes: string;
};

export type LootSplitView = {
  id: string;
  title: string;
  sourceType: string;
  totalValue: string;
  corpCutAmount: string;
  srpReserveAmount: string;
  payoutPool: string;
  totalShares: string;
  createdBy: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  participants: LootSplitParticipantView[];
};

export type LootSplitPageData =
  | {
      status: "ready";
      corp: LootSplitCorpView;
      lootSplits: LootSplitView[];
      accessMode: "Officer View" | "Super Admin View";
    }
  | {
      status: "not_found";
    }
  | {
      status: "access_denied";
      message: string;
    }
  | {
      status: "module_disabled";
      corp: LootSplitCorpView;
      message: string;
    };

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function getLootSplitPageData(
  corpSlug: string,
  session: CurrentOfficerSession | null
): Promise<LootSplitPageData> {
  const corp = await getDb().corp.findUnique({
    where: { slug: corpSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      ticker: true,
      status: true,
      enabledModules: true,
      lootSplits: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          operationName: true,
          operationType: true,
          totalIskValue: true,
          corpCutAmount: true,
          srpReserveAmount: true,
          payoutPool: true,
          totalShares: true,
          createdBy: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          participants: {
            orderBy: [{ pilotName: "asc" }],
            select: {
              id: true,
              pilotName: true,
              characterName: true,
              shares: true,
              payoutAmount: true,
              notes: true
            }
          }
        }
      }
    }
  });

  if (!corp) {
    return { status: "not_found" };
  }

  const publicCorp = {
    id: corp.id,
    slug: corp.slug,
    name: corp.name,
    ticker: corp.ticker,
    status: corp.status
  };

  if (!publicCorpStatuses.includes(corp.status)) {
    return {
      status: "access_denied",
      message: "This corp is not available for loot split access."
    };
  }

  if (!isLootSplitsEnabled(corp.enabledModules)) {
    return {
      status: "module_disabled",
      corp: publicCorp,
      message: "Loot Split Calculation is not enabled for this corp."
    };
  }

  if (!canManageLootSplits(session, corp.id)) {
    return {
      status: "access_denied",
      message: "Loot Split Calculation access is required for this corp."
    };
  }

  return {
    status: "ready",
    corp: publicCorp,
    lootSplits: corp.lootSplits.map((split) => ({
      id: split.id,
      title: split.operationName,
      sourceType: split.operationType,
      totalValue: formatDecimal(split.totalIskValue),
      corpCutAmount: formatDecimal(split.corpCutAmount),
      srpReserveAmount: formatDecimal(split.srpReserveAmount),
      payoutPool: formatDecimal(split.payoutPool),
      totalShares: formatDecimal(split.totalShares),
      createdBy: split.createdBy,
      status: normalizeLootSplitStatus(split.status),
      notes: split.notes,
      createdAt: split.createdAt.toISOString(),
      updatedAt: split.updatedAt.toISOString(),
      participants: split.participants.map((participant) => ({
        id: participant.id,
        pilotName: participant.pilotName,
        characterName: participant.characterName,
        shares: formatDecimal(participant.shares),
        payoutAmount: formatDecimal(participant.payoutAmount),
        notes: participant.notes
      }))
    })),
    accessMode: session?.officer.role === OfficerRole.SUPER_ADMIN
      ? "Super Admin View"
      : "Officer View"
  };
}

export function canManageLootSplits(
  session: CurrentOfficerSession | null,
  corpId: string
) {
  if (!session) {
    return false;
  }

  if (session.officer.role === OfficerRole.SUPER_ADMIN) {
    return true;
  }

  const assignedToCorp = session.assignedCorps.some(
    (assignment) => assignment.corpId === corpId
  );

  return assignedToCorp && hasPermission(session, "lootSplitManage", corpId);
}

export function isLootSplitsEnabled(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const source = value as Record<string, unknown>;

  return source.lootSplits === true || source.loot === true;
}

export function normalizeLootSplitStatus(value: string) {
  const normalized = value.trim().replace(/\s+/g, "_").toUpperCase();

  if (normalized === "READY" || normalized === "") {
    return "READY";
  }

  return normalized;
}

export function formatDecimal(value: Prisma.Decimal | null) {
  return value ? value.toString() : "";
}
