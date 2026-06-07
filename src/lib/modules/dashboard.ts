import "server-only";
import { CorpStatus, OfficerRole, Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { normalizeLootSplitStatus } from "@/lib/modules/loot-splits";
import { normalizeRecruitmentStatus } from "@/lib/modules/recruitment";
import { normalizeSrpStatus } from "@/lib/modules/srp";
import type { CurrentOfficerSession } from "@/lib/session";

export type DashboardCorpView = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  status: CorpStatus;
};

export type DashboardSummaryCard = {
  label: string;
  value: string;
  detail: string;
};

export type DashboardListItem = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href?: string;
};

export type DashboardPageData =
  | {
      status: "ready";
      corp: DashboardCorpView;
      accessMode: "Officer View" | "Super Admin View";
      summaries: DashboardSummaryCard[];
      operations: DashboardListItem[];
      pendingSrp: DashboardListItem[];
      recruitmentPipeline: DashboardListItem[];
      doctrineReadiness: DashboardListItem[];
      lootPayouts: DashboardListItem[];
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
      corp: DashboardCorpView;
      message: string;
    };

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];
const activeOperationStatuses = ["PLANNED", "ACTIVE"];
const completedOperationStatuses = ["COMPLETED"];
const pendingSrpStatuses = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_INFO",
  "APPROVED"
];
const recruitmentPipelineStatuses = [
  "NEW",
  "CONTACTED",
  "INTERVIEW_SCHEDULED",
  "ON_HOLD"
];
const lootWaitingStatuses = ["READY", "CALCULATED"];

export async function getCorpDashboardPageData(
  corpSlug: string,
  session: CurrentOfficerSession | null
): Promise<DashboardPageData> {
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
      message: "This corp is not available for dashboard access."
    };
  }

  if (!isDashboardEnabled(corp.enabledModules)) {
    return {
      status: "module_disabled",
      corp: publicCorp,
      message: "Corp Dashboard is not enabled for this corp."
    };
  }

  if (!canViewCorpDashboard(session, corp.id)) {
    return {
      status: "access_denied",
      message: "Corp Dashboard access is required for this corp."
    };
  }

  const [
    operations,
    attendanceCount,
    doctrineFits,
    doctrineReadinessCount,
    pendingSrp,
    approvedUnpaidSrpCount,
    recruitmentApplicants,
    lootSplits
  ] = await Promise.all([
    getDb().operation.findMany({
      where: { corpId: corp.id },
      orderBy: [{ operationDate: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        operationName: true,
        operationType: true,
        operationDate: true,
        status: true
      }
    }),
    getDb().operationAttendance.count({
      where: { corpId: corp.id }
    }),
    getDb().doctrineFit.findMany({
      where: { corpId: corp.id },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        doctrineName: true,
        shipHull: true,
        status: true,
        readiness: {
          select: {
            id: true,
            readiness: true
          }
        }
      }
    }),
    getDb().doctrineFitReadiness.count({
      where: { corpId: corp.id }
    }),
    getDb().srpRequest.findMany({
      where: { corpId: corp.id },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        characterName: true,
        shipLost: true,
        status: true,
        requestedPayout: true
      }
    }),
    getDb().srpRequest.count({
      where: {
        corpId: corp.id,
        status: "APPROVED"
      }
    }),
    getDb().recruitmentApplicant.findMany({
      where: { corpId: corp.id },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        mainCharacter: true,
        applicantName: true,
        status: true,
        discordName: true
      }
    }),
    getDb().lootSplit.findMany({
      where: { corpId: corp.id },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        operationName: true,
        status: true,
        payoutPool: true,
        participants: {
          select: {
            id: true
          }
        }
      }
    })
  ]);

  const activeOperations = operations.filter((operation) =>
    activeOperationStatuses.includes(normalizeStatus(operation.status))
  );
  const completedOperations = operations.filter((operation) =>
    completedOperationStatuses.includes(normalizeStatus(operation.status))
  );
  const activeDoctrineFits = doctrineFits.filter(
    (fit) => normalizeStatus(fit.status) === "ACTIVE"
  );
  const filteredPendingSrp = pendingSrp.filter((request) =>
    pendingSrpStatuses.includes(normalizeSrpStatus(request.status))
  );
  const filteredRecruitment = recruitmentApplicants.filter((applicant) =>
    recruitmentPipelineStatuses.includes(normalizeRecruitmentStatus(applicant.status))
  );
  const filteredLootSplits = lootSplits.filter((split) =>
    lootWaitingStatuses.includes(normalizeLootSplitStatus(split.status))
  );
  const unpaidLootPool = filteredLootSplits.reduce(
    (sum, split) => sum.plus(split.payoutPool),
    new Prisma.Decimal(0)
  );

  return {
    status: "ready",
    corp: publicCorp,
    accessMode: session?.officer.role === OfficerRole.SUPER_ADMIN
      ? "Super Admin View"
      : "Officer View",
    summaries: [
      {
        label: "Upcoming / Active Ops",
        value: String(activeOperations.length),
        detail: "Planned or active operations"
      },
      {
        label: "Completed Ops",
        value: String(completedOperations.length),
        detail: "Completed operations on record"
      },
      {
        label: "Attendance Records",
        value: String(attendanceCount),
        detail: "Corp-scoped attendance submissions"
      },
      {
        label: "Active Doctrine Fits",
        value: String(activeDoctrineFits.length),
        detail: "Doctrine fits currently active"
      },
      {
        label: "Readiness Submissions",
        value: String(doctrineReadinessCount),
        detail: "Doctrine readiness records"
      },
      {
        label: "Pending SRP",
        value: String(filteredPendingSrp.length),
        detail: "Submitted, review, needs info, approved"
      },
      {
        label: "Approved Unpaid SRP",
        value: String(approvedUnpaidSrpCount),
        detail: "Approved requests not marked paid"
      },
      {
        label: "Recruitment Pipeline",
        value: String(filteredRecruitment.length),
        detail: "Active applicant pipeline"
      },
      {
        label: "Loot Splits Waiting",
        value: String(filteredLootSplits.length),
        detail: "Calculated or ready splits"
      },
      {
        label: "Unpaid Loot Pool",
        value: formatIsk(unpaidLootPool),
        detail: "Payout pool on waiting splits"
      }
    ],
    operations: activeOperations.slice(0, 8).map((operation) => ({
      id: operation.id,
      title: operation.operationName,
      subtitle: operation.operationDate
        ? operation.operationDate.toISOString()
        : "No scheduled time",
      badge: normalizeStatus(operation.status),
      href: `/corp/${corp.slug}/attendance`
    })),
    pendingSrp: filteredPendingSrp.slice(0, 8).map((request) => ({
      id: request.id,
      title: `${request.characterName} / ${request.shipLost}`,
      subtitle: request.requestedPayout
        ? `Payout ${formatIsk(request.requestedPayout)}`
        : "No payout set",
      badge: normalizeSrpStatus(request.status),
      href: `/corp/${corp.slug}/srp`
    })),
    recruitmentPipeline: filteredRecruitment.slice(0, 8).map((applicant) => ({
      id: applicant.id,
      title: applicant.mainCharacter || applicant.applicantName,
      subtitle: applicant.discordName || "No Discord listed",
      badge: normalizeRecruitmentStatus(applicant.status),
      href: `/corp/${corp.slug}/recruitment`
    })),
    doctrineReadiness: activeDoctrineFits.slice(0, 8).map((fit) => ({
      id: fit.id,
      title: fit.doctrineName,
      subtitle: `${fit.shipHull || "Unknown hull"} / ${fit.readiness.length} submissions`,
      badge: normalizeStatus(fit.status),
      href: `/corp/${corp.slug}/doctrine`
    })),
    lootPayouts: filteredLootSplits.slice(0, 8).map((split) => ({
      id: split.id,
      title: split.operationName,
      subtitle: `${formatIsk(split.payoutPool)} / ${split.participants.length} participants`,
      badge: normalizeLootSplitStatus(split.status),
      href: `/corp/${corp.slug}/loot-splits`
    }))
  };
}

export function canViewCorpDashboard(
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

  return assignedToCorp && hasPermission(session, "corpDashboardView", corpId);
}

export function isDashboardEnabled(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).dashboard === true;
}

function normalizeStatus(value: string) {
  return value.trim().replace(/\s+/g, "_").toUpperCase();
}

function formatIsk(value: Prisma.Decimal) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(Number(value.toString()));
}
