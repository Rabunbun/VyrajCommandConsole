import "server-only";
import { CorpStatus, OfficerRole, type Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { getSrpShipTypes } from "@/lib/srp-assist";
import {
  normalizeSrpStatus,
  srpStatusOptions,
  type SrpStatus
} from "@/lib/srp-status";
import type { CurrentOfficerSession } from "@/lib/session";

export { normalizeSrpStatus, srpStatusOptions };
export type { SrpStatus };

export type SrpCorpView = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  status: CorpStatus;
};

export type SrpRequestView = {
  id: string;
  calculatedEligibleAmount: string;
  characterName: string;
  detectedShipName: string;
  detectedShipTypeId: number | null;
  insuranceLevelUsed: string;
  insurancePayout: string;
  shipType: string;
  killmailHash: string;
  killmailId: string;
  killmailUrl: string;
  killmailTotalValue: string;
  doctrineName: string;
  lossDate: string;
  lossValue: string;
  requestedAmount: string;
  payoutAmount: string;
  reviewerName: string;
  selectedShipName: string;
  selectedShipTypeId: number | null;
  shipDetectionSource: string;
  status: string;
  srpAssistError: string;
  srpAssistStatus: string;
  srpAssistCheckedAt: string | null;
  calculationSource: string;
  calculationWarnings: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SrpShipTypeOption = Awaited<ReturnType<typeof getSrpShipTypes>>[number];

export type SrpPageData =
  | {
      status: "ready";
      corp: SrpCorpView;
      requests: SrpRequestView[];
      shipTypes: SrpShipTypeOption[];
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
  const [requests, shipTypes] = await Promise.all([
    canReview
      ? getDb().srpRequest.findMany({
          where: { corpId: corp.id },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          select: {
            calculatedEligibleAmount: true,
            calculationSource: true,
            calculationWarnings: true,
            characterName: true,
            createdAt: true,
            detectedShipName: true,
            detectedShipTypeId: true,
            doctrineFleet: true,
            estimatedValue: true,
            id: true,
            insuranceLevelUsed: true,
            insurancePayout: true,
            killmailHash: true,
            killmailId: true,
            killmailLink: true,
            killmailTotalValue: true,
            lossType: true,
            lossValue: true,
            notes: true,
            requestedPayout: true,
            reviewer: true,
            selectedShipName: true,
            selectedShipTypeId: true,
            shipDetectionSource: true,
            shipLost: true,
            srpAssistCheckedAt: true,
            srpAssistError: true,
            srpAssistStatus: true,
            status: true,
            updatedAt: true
          }
        })
      : [],
    getSrpShipTypes()
  ]);

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
      calculatedEligibleAmount: formatDecimal(request.calculatedEligibleAmount),
      calculationSource: request.calculationSource,
      calculationWarnings: request.calculationWarnings,
      characterName: request.characterName,
      detectedShipName: request.detectedShipName,
      detectedShipTypeId: request.detectedShipTypeId,
      insuranceLevelUsed: request.insuranceLevelUsed,
      insurancePayout: formatDecimal(request.insurancePayout),
      killmailHash: request.killmailHash,
      killmailId: request.killmailId?.toString() || "",
      shipType: request.shipLost,
      killmailUrl: request.killmailLink,
      killmailTotalValue: formatDecimal(request.killmailTotalValue),
      doctrineName: request.doctrineFleet,
      lossDate: request.lossType,
      lossValue: formatDecimal(request.lossValue),
      requestedAmount: formatDecimal(request.estimatedValue),
      payoutAmount: formatDecimal(request.requestedPayout),
      reviewerName: request.reviewer,
      selectedShipName: request.selectedShipName,
      selectedShipTypeId: request.selectedShipTypeId,
      shipDetectionSource: request.shipDetectionSource,
      status: normalizeSrpStatus(request.status),
      srpAssistCheckedAt: request.srpAssistCheckedAt?.toISOString() ?? null,
      srpAssistError: request.srpAssistError,
      srpAssistStatus: request.srpAssistStatus,
      notes: request.notes,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString()
    })),
    shipTypes,
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

export function formatDecimal(value: Prisma.Decimal | null) {
  return value ? value.toString() : "";
}
