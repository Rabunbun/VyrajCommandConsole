import "server-only";
import { CorpStatus, OfficerRole, type Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import type { CurrentOfficerSession } from "@/lib/session";

export const srpStatusOptions = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_INFO",
  "APPROVED",
  "DENIED",
  "PAID"
] as const;

export type SrpStatus = (typeof srpStatusOptions)[number];

export type SrpCorpView = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  status: CorpStatus;
};

export type SrpRequestView = {
  id: string;
  characterName: string;
  shipType: string;
  killmailUrl: string;
  doctrineName: string;
  lossDate: string;
  requestedAmount: string;
  payoutAmount: string;
  reviewerName: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SrpPageData =
  | {
      status: "ready";
      corp: SrpCorpView;
      requests: SrpRequestView[];
      canReviewSrp: boolean;
      accessMode: "Member View" | "Officer View" | "Super Admin View";
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
      corp: SrpCorpView;
      message: string;
    };

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function getSrpPageData(
  corpSlug: string,
  session: CurrentOfficerSession | null
): Promise<SrpPageData> {
  const corp = await getDb().corp.findUnique({
    where: { slug: corpSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      ticker: true,
      status: true,
      enabledModules: true
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
      message: "This corp is not available for public SRP access."
    };
  }

  if (!isSrpEnabled(corp.enabledModules)) {
    return {
      status: "module_disabled",
      corp: publicCorp,
      message: "SRP Requests are not enabled for this corp."
    };
  }

  const canReview = canReviewSrp(session, corp.id);
  const requests = canReview
    ? await getDb().srpRequest.findMany({
        where: { corpId: corp.id },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          characterName: true,
          shipLost: true,
          killmailLink: true,
          doctrineFleet: true,
          lossType: true,
          estimatedValue: true,
          requestedPayout: true,
          reviewer: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true
        }
      })
    : [];

  const accessMode = session?.officer.role === OfficerRole.SUPER_ADMIN
    ? "Super Admin View"
    : canReview
      ? "Officer View"
      : "Member View";

  return {
    status: "ready",
    corp: publicCorp,
    requests: requests.map((request) => ({
      id: request.id,
      characterName: request.characterName,
      shipType: request.shipLost,
      killmailUrl: request.killmailLink,
      doctrineName: request.doctrineFleet,
      lossDate: request.lossType,
      requestedAmount: formatDecimal(request.estimatedValue),
      payoutAmount: formatDecimal(request.requestedPayout),
      reviewerName: request.reviewer,
      status: normalizeSrpStatus(request.status),
      notes: request.notes,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString()
    })),
    canReviewSrp: canReview,
    accessMode
  };
}

export function canReviewSrp(
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

  return assignedToCorp && hasPermission(session, "srpReview", corpId);
}

export function isSrpEnabled(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).srp === true;
}

export function normalizeSrpStatus(value: string) {
  const normalized = value.trim().replace(/\s+/g, "_").toUpperCase();

  if (normalized === "NEW") {
    return "SUBMITTED";
  }

  return normalized || "SUBMITTED";
}

export function formatDecimal(value: Prisma.Decimal | null) {
  return value ? value.toString() : "";
}
