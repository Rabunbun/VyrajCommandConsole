import "server-only";
import { CorpStatus, OfficerRole, Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { canViewCorpDashboard } from "@/lib/modules/dashboard";
import { normalizeLootSplitStatus } from "@/lib/modules/loot-splits";
import { normalizeRecruitmentStatus } from "@/lib/modules/recruitment";
import { normalizeSrpStatus } from "@/lib/modules/srp";
import { hasPermission } from "@/lib/permissions";
import type { CurrentOfficerSession } from "@/lib/session";

export type AllianceSummaryCard = {
  label: string;
  value: string;
  detail: string;
};

export type AllianceQueueItem = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
};

export type AllianceCorpSummary = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  status: CorpStatus;
  activeOperations: number;
  pendingSrp: number;
  recruitmentPipeline: number;
  activeDoctrineFits: number;
  lootSplitsWaiting: number;
  dashboardHref: string | null;
  portalHref: string;
};

export type AllianceAuditPreviewItem = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
};

export type AllianceDashboardData = {
  accessMode: "Alliance Officer View" | "Super Admin View";
  summaries: AllianceSummaryCard[];
  operations: AllianceQueueItem[];
  pendingSrp: AllianceQueueItem[];
  recruitmentPipeline: AllianceQueueItem[];
  doctrineReadiness: AllianceQueueItem[];
  lootPayouts: AllianceQueueItem[];
  corpSummaries: AllianceCorpSummary[];
  auditPreview: AllianceAuditPreviewItem[];
};

const visibleCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];
const activeOperationStatuses = ["PLANNED", "ACTIVE"];
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

export function canViewAllianceDashboard(session: CurrentOfficerSession | null) {
  if (!session) {
    return false;
  }

  return (
    session.officer.role === OfficerRole.SUPER_ADMIN ||
    hasPermission(session, "allianceDashboardView")
  );
}

export async function getAuthenticatedAllianceHubSummary(
  session: CurrentOfficerSession | null
): Promise<AllianceDashboardData | null> {
  if (!canViewAllianceDashboard(session)) {
    return null;
  }

  const corps = await getDb().corp.findMany({
    where: {
      status: {
        in: visibleCorpStatuses
      }
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      ticker: true,
      status: true
    }
  });

  const corpIds = corps.map((corp) => corp.id);

  if (!corpIds.length) {
    return {
      accessMode:
        session?.officer.role === OfficerRole.SUPER_ADMIN
          ? "Super Admin View"
          : "Alliance Officer View",
      summaries: emptySummaries(),
      operations: [],
      pendingSrp: [],
      recruitmentPipeline: [],
      doctrineReadiness: [],
      lootPayouts: [],
      corpSummaries: [],
      auditPreview: []
    };
  }

  const [
    operations,
    attendanceCount,
    doctrineFits,
    doctrineReadinessCount,
    srpRequests,
    recruitmentApplicants,
    lootSplits,
    auditPreview
  ] = await Promise.all([
    getDb().operation.findMany({
      where: {
        corpId: {
          in: corpIds
        }
      },
      orderBy: [{ operationDate: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        corpId: true,
        operationName: true,
        operationDate: true,
        status: true
      }
    }),
    getDb().operationAttendance.count({
      where: {
        corpId: {
          in: corpIds
        },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    }),
    getDb().doctrineFit.findMany({
      where: {
        corpId: {
          in: corpIds
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        corpId: true,
        doctrineName: true,
        shipHull: true,
        status: true,
        readiness: {
          select: {
            id: true
          }
        }
      }
    }),
    getDb().doctrineFitReadiness.count({
      where: {
        corpId: {
          in: corpIds
        }
      }
    }),
    getDb().srpRequest.findMany({
      where: {
        corpId: {
          in: corpIds
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        corpId: true,
        characterName: true,
        shipLost: true,
        status: true,
        requestedPayout: true
      }
    }),
    getDb().recruitmentApplicant.findMany({
      where: {
        corpId: {
          in: corpIds
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        corpId: true,
        applicantName: true,
        mainCharacter: true,
        discordName: true,
        status: true
      }
    }),
    getDb().lootSplit.findMany({
      where: {
        corpId: {
          in: corpIds
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        corpId: true,
        operationName: true,
        status: true,
        payoutPool: true,
        participants: {
          select: {
            id: true
          }
        }
      }
    }),
    session?.officer.role === OfficerRole.SUPER_ADMIN
      ? getDb().officerAuditLog.findMany({
          orderBy: [{ createdAt: "desc" }],
          take: 5,
          select: {
            id: true,
            officerName: true,
            officerRole: true,
            module: true,
            action: true,
            targetName: true,
            summary: true,
            corpName: true,
            createdAt: true
          }
        })
      : Promise.resolve([])
  ]);

  const corpById = new Map(corps.map((corp) => [corp.id, corp]));
  const activeOperations = operations.filter((operation) =>
    activeOperationStatuses.includes(normalizeStatus(operation.status))
  );
  const activeDoctrineFits = doctrineFits.filter(
    (fit) => normalizeStatus(fit.status) === "ACTIVE"
  );
  const filteredPendingSrp = srpRequests.filter((request) =>
    pendingSrpStatuses.includes(normalizeSrpStatus(request.status))
  );
  const approvedUnpaidSrp = srpRequests.filter(
    (request) => normalizeSrpStatus(request.status) === "APPROVED"
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
    accessMode:
      session?.officer.role === OfficerRole.SUPER_ADMIN
        ? "Super Admin View"
        : "Alliance Officer View",
    summaries: [
      {
        label: "Active / Trial Corps",
        value: String(corps.length),
        detail: "Corps visible to alliance operations"
      },
      {
        label: "Upcoming / Active Ops",
        value: String(activeOperations.length),
        detail: "Planned or active operations"
      },
      {
        label: "Recent Attendance",
        value: String(attendanceCount),
        detail: "Attendance submissions from the last 30 days"
      },
      {
        label: "Active Doctrine Fits",
        value: String(activeDoctrineFits.length),
        detail: "Active doctrines across visible corps"
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
        value: String(approvedUnpaidSrp.length),
        detail: "Approved requests not marked paid"
      },
      {
        label: "Recruitment Pipeline",
        value: String(filteredRecruitment.length),
        detail: "Applicants needing officer attention"
      },
      {
        label: "Loot Splits Waiting",
        value: String(filteredLootSplits.length),
        detail: "Calculated or ready loot splits"
      },
      {
        label: "Unpaid Loot Pool",
        value: formatIsk(unpaidLootPool),
        detail: "Payout pool on waiting loot splits"
      }
    ],
    operations: activeOperations.slice(0, 8).map((operation) => {
      const corp = corpById.get(operation.corpId);

      return {
        id: operation.id,
        title: operation.operationName,
        subtitle: `${corp?.ticker || "Corp"} / ${
          operation.operationDate
            ? operation.operationDate.toISOString()
            : "No scheduled time"
        }`,
        badge: normalizeStatus(operation.status),
        href: `/corp/${corp?.slug || ""}/attendance`
      };
    }),
    pendingSrp: filteredPendingSrp.slice(0, 8).map((request) => {
      const corp = corpById.get(request.corpId);

      return {
        id: request.id,
        title: `${request.characterName} / ${request.shipLost}`,
        subtitle: `${corp?.ticker || "Corp"} / ${
          request.requestedPayout
            ? `Payout ${formatIsk(request.requestedPayout)}`
            : "No payout set"
        }`,
        badge: normalizeSrpStatus(request.status),
        href: `/corp/${corp?.slug || ""}/srp`
      };
    }),
    recruitmentPipeline: filteredRecruitment.slice(0, 8).map((applicant) => {
      const corp = corpById.get(applicant.corpId);

      return {
        id: applicant.id,
        title: applicant.mainCharacter || applicant.applicantName,
        subtitle: `${corp?.ticker || "Corp"} / ${
          applicant.discordName || "No Discord listed"
        }`,
        badge: normalizeRecruitmentStatus(applicant.status),
        href: `/corp/${corp?.slug || ""}/recruitment`
      };
    }),
    doctrineReadiness: activeDoctrineFits
      .slice()
      .sort((a, b) => a.readiness.length - b.readiness.length)
      .slice(0, 8)
      .map((fit) => {
        const corp = corpById.get(fit.corpId);

        return {
          id: fit.id,
          title: fit.doctrineName,
          subtitle: `${corp?.ticker || "Corp"} / ${
            fit.shipHull || "Unknown hull"
          } / ${fit.readiness.length} readiness`,
          badge: normalizeStatus(fit.status),
          href: `/corp/${corp?.slug || ""}/doctrine`
        };
      }),
    lootPayouts: filteredLootSplits.slice(0, 8).map((split) => {
      const corp = corpById.get(split.corpId);

      return {
        id: split.id,
        title: split.operationName,
        subtitle: `${corp?.ticker || "Corp"} / ${formatIsk(
          split.payoutPool
        )} / ${split.participants.length} pilots`,
        badge: normalizeLootSplitStatus(split.status),
        href: `/corp/${corp?.slug || ""}/loot-splits`
      };
    }),
    corpSummaries: corps.map((corp) => ({
      id: corp.id,
      slug: corp.slug,
      name: corp.name,
      ticker: corp.ticker,
      status: corp.status,
      activeOperations: activeOperations.filter(
        (operation) => operation.corpId === corp.id
      ).length,
      pendingSrp: filteredPendingSrp.filter((request) => request.corpId === corp.id)
        .length,
      recruitmentPipeline: filteredRecruitment.filter(
        (applicant) => applicant.corpId === corp.id
      ).length,
      activeDoctrineFits: activeDoctrineFits.filter((fit) => fit.corpId === corp.id)
        .length,
      lootSplitsWaiting: filteredLootSplits.filter((split) => split.corpId === corp.id)
        .length,
      dashboardHref: canViewCorpDashboard(session, corp.id)
        ? `/corp/${corp.slug}/dashboard`
        : null,
      portalHref: `/corp/${corp.slug}`
    })),
    auditPreview: auditPreview.map((entry) => ({
      id: entry.id,
      title: entry.summary || `${entry.module}: ${entry.action}`,
      subtitle: `${entry.officerName || "Unknown officer"} / ${
        entry.corpName || entry.targetName || "Alliance"
      } / ${entry.createdAt.toISOString()}`,
      badge: entry.action
    }))
  };
}

function emptySummaries(): AllianceSummaryCard[] {
  return [
    "Active / Trial Corps",
    "Upcoming / Active Ops",
    "Recent Attendance",
    "Active Doctrine Fits",
    "Readiness Submissions",
    "Pending SRP",
    "Approved Unpaid SRP",
    "Recruitment Pipeline",
    "Loot Splits Waiting",
    "Unpaid Loot Pool"
  ].map((label) => ({
    label,
    value: label === "Unpaid Loot Pool" ? "0" : "0",
    detail: "No visible corp data"
  }));
}

function normalizeStatus(value: string) {
  return value.trim().replace(/\s+/g, "_").toUpperCase();
}

function formatIsk(value: Prisma.Decimal) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(Number(value.toString()));
}
