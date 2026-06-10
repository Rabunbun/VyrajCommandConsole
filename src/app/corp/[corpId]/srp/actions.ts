"use server";

import { CorpStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  canReviewSrp,
  isSrpEnabled,
  normalizeSrpStatus,
  srpStatusOptions
} from "@/lib/modules/srp";
import { analyzeSrpAssist } from "@/lib/srp-assist";
import {
  initialSrpAssistActionState,
  type SrpAssistActionState
} from "@/lib/srp-assist-state";
import { getCurrentOfficerSession } from "@/lib/session";

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function analyzeSrpRequestAssistAction(
  _previousState: SrpAssistActionState,
  formData: FormData
): Promise<SrpAssistActionState> {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  const fields = getSrpAssistFields(formData);

  try {
    const corp = await getPublicSrpCorp(corpSlug);
    const assist = await analyzeSrpAssist({
      killmailUrl: cleanText(formData.get("killmailUrl")),
      lossValue: parseIskAmount(formData.get("lossValue"), {
        allowBlank: true,
        label: "Loss value"
      }),
      requestedAmount: parseIskAmount(formData.get("requestedAmount"), {
        allowBlank: true,
        label: "Requested amount"
      }),
      selectedShipName: normalizeDisplayName(formData.get("selectedShipName")) ||
        cleanText(formData.get("shipType")),
      selectedShipTypeId: parseOptionalTypeId(formData.get("selectedShipTypeId"))
    });

    const action = assist.assistStatus === "failed"
      ? "SRP Assist Failed"
      : "SRP Killmail Analyzed";

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "SRP Requests",
      action,
      targetType: "SrpAssist",
      targetName: assist.selectedShipName || assist.detectedShipName || "SRP Assist",
      summary: `SRP assist ${assist.assistStatus} for ${assist.selectedShipName || assist.detectedShipName || "manual request"}.`,
      details: formatSrpAssistForAudit(assist)
    });

    return buildSrpAssistActionState(fields, assist);
  } catch (error) {
    rethrowIfNextRedirectError(error);

    return {
      ...initialSrpAssistActionState,
      fields,
      message: getSafeAssistErrorMessage(error),
      status: "error"
    };
  }
}

export async function submitSrpRequestAction(formData: FormData) {
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "SRP request submitted.";
  let redirectTo = buildSrpMessageUrl(corpSlug, "success", successMessage);

  try {
    const corp = await getPublicSrpCorp(corpSlug);
    const session = await getCurrentOfficerSession();
    const characterName = normalizeDisplayName(formData.get("characterName"));
    const manualShipName = normalizeDisplayName(formData.get("selectedShipName")) ||
      cleanText(formData.get("shipType"));
    const killmailUrl = cleanText(formData.get("killmailUrl"));
    const lossDate = cleanText(formData.get("lossDate"));
    const requestedAmount = parseIskAmount(formData.get("requestedAmount"), {
      allowBlank: false,
      label: "Requested amount"
    });
    const lossValue = parseIskAmount(formData.get("lossValue"), {
      allowBlank: true,
      label: "Loss value"
    });
    const doctrineName = cleanText(formData.get("doctrineName"));
    const notes = cleanText(formData.get("notes"));
    const assist = await analyzeSrpAssist({
      killmailUrl,
      lossValue,
      requestedAmount,
      selectedShipName: manualShipName,
      selectedShipTypeId: parseOptionalTypeId(formData.get("selectedShipTypeId"))
    });
    const shipType = assist.selectedShipName || assist.detectedShipName || manualShipName;

    if (!characterName) {
      throw new Error("Character or pilot name is required.");
    }

    if (!shipType) {
      throw new Error("Ship type is required.");
    }

    const created = await getDb().srpRequest.create({
      data: {
        corpId: corp.id,
        pilotName: characterName,
        characterName,
        shipLost: shipType,
        killmailLink: killmailUrl,
        killmailId: assist.killmailId ? BigInt(assist.killmailId) : null,
        killmailHash: assist.killmailHash,
        detectedShipTypeId: assist.detectedShipTypeId,
        detectedShipName: assist.detectedShipName,
        selectedShipTypeId: assist.selectedShipTypeId,
        selectedShipName: assist.selectedShipName,
        shipDetectionSource: assist.shipDetectionSource,
        doctrineFleet: doctrineName,
        lossType: lossDate,
        estimatedValue: requestedAmount,
        killmailTotalValue: assist.killmailTotalValue,
        lossValue: assist.lossValue,
        insuranceLevelUsed: assist.insuranceLevelUsed,
        insurancePayout: assist.insurancePayout,
        calculatedEligibleAmount: assist.calculatedEligibleAmount,
        calculationSource: assist.calculationSource,
        calculationWarnings: assist.warnings.join("\n"),
        srpAssistStatus: assist.assistStatus,
        srpAssistError: assist.error,
        srpAssistCheckedAt: new Date(),
        requestedPayout: null,
        status: "SUBMITTED",
        notes
      },
      select: srpAuditSelect
    });

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "SRP Requests",
      action: "SRP Calculation Updated",
      targetType: "SrpRequest",
      targetId: created.id,
      targetName: `${created.characterName} / ${created.shipLost}`,
      summary: `Stored SRP assist recommendation for ${created.characterName}.`,
      details: {
        request: formatSrpRequestForAudit(created),
        assist: formatSrpAssistForAudit(assist)
      }
    });

    revalidatePath(`/corp/${corp.slug}/srp`);
    successMessage = "SRP request submitted for review.";
    redirectTo = buildSrpMessageUrl(corp.slug, "success", successMessage);
  } catch (error) {
    rethrowIfNextRedirectError(error);
    redirectTo = buildSrpMessageUrl(
      corpSlug,
      "error",
      getSafeMutationErrorMessage(error)
    );
  }

  redirect(redirectTo);
}

export async function updateSrpRequestAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "SRP request updated.";
  let redirectTo = buildSrpMessageUrl(corpSlug, "success", successMessage);

  try {
    const corp = await getPublicSrpCorp(corpSlug);

    if (!canReviewSrp(session, corp.id)) {
      throw new Error("SRP review permission is required.");
    }

    const requestId = cleanText(formData.get("requestId"));

    if (!requestId) {
      throw new Error("SRP request ID is required.");
    }

    const existing = await getDb().srpRequest.findFirst({
      where: {
        id: requestId,
        corpId: corp.id
      },
      select: srpAuditSelect
    });

    if (!existing) {
      throw new Error("SRP request unavailable.");
    }

    const status = parseSrpStatus(formData.get("status"));
    const payoutAmount = parseIskAmount(formData.get("payoutAmount"), {
      allowBlank: true,
      label: "Payout amount"
    });
    const reviewerNotes = cleanText(formData.get("reviewerNotes"));

    const updated = await getDb().srpRequest.update({
      where: { id: requestId },
      data: {
        status,
        requestedPayout: payoutAmount,
        reviewer: session?.officer.officerName || "",
        notes: reviewerNotes
      },
      select: srpAuditSelect
    });

    const normalizedBefore = normalizeSrpStatus(existing.status);
    const normalizedAfter = normalizeSrpStatus(updated.status);
    const action = getSrpAuditAction(normalizedBefore, normalizedAfter);

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "SRP Requests",
      action: "SRP Request Updated",
      targetType: "SrpRequest",
      targetId: updated.id,
      targetName: `${updated.characterName} / ${updated.shipLost}`,
      summary: `Updated SRP request for ${updated.characterName}.`,
      details: {
        before: formatSrpRequestForAudit(existing),
        after: formatSrpRequestForAudit(updated)
      }
    });

    if (action) {
      await logOfficerAudit({
        officerId: session?.officer.id,
        officerName: session?.officer.officerName,
        officerRole: session?.officer.role,
        corpId: corp.id,
        corpSlug: corp.slug,
        corpName: corp.name,
        module: "SRP Requests",
        action,
        targetType: "SrpRequest",
        targetId: updated.id,
        targetName: `${updated.characterName} / ${updated.shipLost}`,
        summary: `${action} for ${updated.characterName} (${updated.shipLost}).`,
        details: {
          before: { status: normalizedBefore },
          after: {
            status: normalizedAfter,
            payoutAmount: updated.requestedPayout
              ? updated.requestedPayout.toString()
              : null
          }
        }
      });
    }

    revalidatePath(`/corp/${corp.slug}/srp`);
    successMessage = `SRP request for ${updated.characterName} updated.`;
    redirectTo = buildSrpMessageUrl(corp.slug, "success", successMessage);
  } catch (error) {
    rethrowIfNextRedirectError(error);
    redirectTo = buildSrpMessageUrl(
      corpSlug,
      "error",
      getSafeMutationErrorMessage(error)
    );
  }

  redirect(redirectTo);
}

async function getPublicSrpCorp(corpSlug: string) {
  if (!corpSlug) {
    throw new Error("Corp slug is required.");
  }

  const corp = await getDb().corp.findUnique({
    where: { slug: corpSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      enabledModules: true
    }
  });

  if (!corp) {
    throw new Error("Corp not found.");
  }

  if (!publicCorpStatuses.includes(corp.status)) {
    throw new Error("This corp is not available for public SRP access.");
  }

  if (!isSrpEnabled(corp.enabledModules)) {
    throw new Error("SRP Requests are not enabled for this corp.");
  }

  return corp;
}

function parseSrpStatus(value: FormDataEntryValue | null) {
  const status = normalizeSrpStatus(String(value || ""));

  if (srpStatusOptions.includes(status as (typeof srpStatusOptions)[number])) {
    return status;
  }

  throw new Error("Invalid SRP status.");
}

function parseIskAmount(
  value: FormDataEntryValue | null,
  options: {
    allowBlank: boolean;
    label: string;
  }
) {
  const raw = cleanText(value).replace(/,/g, "");

  if (!raw) {
    if (options.allowBlank) {
      return null;
    }

    throw new Error(`${options.label} is required.`);
  }

  const numberValue = Number(raw);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${options.label} must be numeric and not negative.`);
  }

  return new Prisma.Decimal(raw);
}

function parseOptionalTypeId(value: FormDataEntryValue | null) {
  const raw = cleanText(value);

  if (!raw) {
    return null;
  }

  const numberValue = Number(raw);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error("Ship Type ID must be a positive whole number.");
  }

  return numberValue;
}

function getSrpAuditAction(beforeStatus: string, afterStatus: string) {
  if (beforeStatus === afterStatus) {
    return null;
  }

  if (afterStatus === "APPROVED") {
    return "SRP Approved";
  }

  if (afterStatus === "DENIED") {
    return "SRP Denied";
  }

  if (afterStatus === "NEEDS_INFO") {
    return "SRP Marked Needs Info";
  }

  if (afterStatus === "PAID") {
    return "SRP Marked Paid";
  }

  if (afterStatus === "CANCELLED") {
    return "SRP Cancelled";
  }

  return "SRP Status Changed";
}

function normalizeDisplayName(value: FormDataEntryValue | null) {
  return cleanText(value).replace(/\s+/g, " ");
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

const srpAuditSelect = {
  calculatedEligibleAmount: true,
  calculationSource: true,
  calculationWarnings: true,
  id: true,
  characterName: true,
  detectedShipName: true,
  detectedShipTypeId: true,
  insuranceLevelUsed: true,
  insurancePayout: true,
  killmailHash: true,
  killmailId: true,
  shipLost: true,
  killmailLink: true,
  killmailTotalValue: true,
  lossValue: true,
  doctrineFleet: true,
  lossType: true,
  estimatedValue: true,
  requestedPayout: true,
  reviewer: true,
  selectedShipName: true,
  selectedShipTypeId: true,
  shipDetectionSource: true,
  status: true,
  srpAssistCheckedAt: true,
  srpAssistError: true,
  srpAssistStatus: true,
  notes: true,
  createdAt: true,
  updatedAt: true
} as const;

type SrpAuditRecord = {
  calculatedEligibleAmount: Prisma.Decimal | null;
  calculationSource: string;
  calculationWarnings: string;
  id: string;
  characterName: string;
  detectedShipName: string;
  detectedShipTypeId: number | null;
  insuranceLevelUsed: string;
  insurancePayout: Prisma.Decimal | null;
  killmailHash: string;
  killmailId: bigint | null;
  shipLost: string;
  killmailLink: string;
  killmailTotalValue: Prisma.Decimal | null;
  lossValue: Prisma.Decimal | null;
  doctrineFleet: string;
  lossType: string;
  estimatedValue: Prisma.Decimal | null;
  requestedPayout: Prisma.Decimal | null;
  reviewer: string;
  selectedShipName: string;
  selectedShipTypeId: number | null;
  shipDetectionSource: string;
  status: string;
  srpAssistCheckedAt: Date | null;
  srpAssistError: string;
  srpAssistStatus: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

function formatSrpRequestForAudit(request: SrpAuditRecord) {
  return {
    id: request.id,
    calculatedEligibleAmount: request.calculatedEligibleAmount?.toString() ?? null,
    calculationSource: request.calculationSource,
    calculationWarnings: request.calculationWarnings,
    characterName: request.characterName,
    detectedShipName: request.detectedShipName,
    detectedShipTypeId: request.detectedShipTypeId,
    insuranceLevelUsed: request.insuranceLevelUsed,
    insurancePayout: request.insurancePayout?.toString() ?? null,
    killmailHash: request.killmailHash ? "[redacted-safe-hash-present]" : "",
    killmailId: request.killmailId?.toString() ?? "",
    shipType: request.shipLost,
    killmailUrl: request.killmailLink,
    killmailTotalValue: request.killmailTotalValue?.toString() ?? null,
    lossValue: request.lossValue?.toString() ?? null,
    doctrineName: request.doctrineFleet,
    lossDate: request.lossType,
    requestedAmount: request.estimatedValue
      ? request.estimatedValue.toString()
      : null,
    payoutAmount: request.requestedPayout
      ? request.requestedPayout.toString()
      : null,
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
  };
}

function formatSrpAssistForAudit(assist: Awaited<ReturnType<typeof analyzeSrpAssist>>) {
  return {
    assistStatus: assist.assistStatus,
    calculationSource: assist.calculationSource,
    calculatedEligibleAmount: assist.calculatedEligibleAmount?.toString() ?? null,
    detectedShipName: assist.detectedShipName,
    detectedShipTypeId: assist.detectedShipTypeId,
    error: assist.error,
    insuranceLevelUsed: assist.insuranceLevelUsed,
    insurancePayout: assist.insurancePayout?.toString() ?? null,
    killmailHashPresent: Boolean(assist.killmailHash),
    killmailId: assist.killmailId,
    killmailTotalValue: assist.killmailTotalValue?.toString() ?? null,
    lossValue: assist.lossValue?.toString() ?? null,
    selectedShipName: assist.selectedShipName,
    selectedShipTypeId: assist.selectedShipTypeId,
    shipDetectionSource: assist.shipDetectionSource,
    warnings: assist.warnings
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "SRP action failed.";
}

function getSafeAssistErrorMessage(error: unknown) {
  const message = getErrorMessage(error);

  if (message.includes("NEXT_REDIRECT")) {
    return "Unable to analyze killmail. Select the ship manually or paste an ESI killmail URL.";
  }

  if (message.includes("Killmail") || message.includes("killmail")) {
    return message;
  }

  if (message.includes("Ship Type ID") || message.includes("Loss value") || message.includes("Requested amount")) {
    return message;
  }

  return "Unable to analyze killmail. Select the ship manually or paste an ESI killmail URL.";
}

function getSafeMutationErrorMessage(error: unknown) {
  const message = getErrorMessage(error);

  if (isTechnicalFrameworkMessage(message)) {
    return "Action could not be completed. Please try again.";
  }

  return message;
}

function isNextRedirectError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if (!("digest" in error) || typeof error.digest !== "string") {
    return false;
  }

  return error.digest.startsWith("NEXT_REDIRECT;");
}

function rethrowIfNextRedirectError(error: unknown): asserts error is never {
  if (isNextRedirectError(error)) {
    throw error;
  }
}

function isTechnicalFrameworkMessage(message: string) {
  return /NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/i.test(message) ||
    /digest:/i.test(message);
}

function buildSrpMessageUrl(
  corpSlug: string,
  type: "success" | "error",
  message: string
): string {
  const slug = corpSlug || "unknown";
  return `/corp/${slug}/srp?${type}=${encodeURIComponent(message)}`;
}

function getSrpAssistFields(formData: FormData): SrpAssistActionState["fields"] {
  return {
    characterName: normalizeDisplayName(formData.get("characterName")),
    doctrineName: cleanText(formData.get("doctrineName")),
    killmailUrl: cleanText(formData.get("killmailUrl")),
    lossDate: cleanText(formData.get("lossDate")),
    lossValue: cleanText(formData.get("lossValue")),
    notes: cleanText(formData.get("notes")),
    requestedAmount: cleanText(formData.get("requestedAmount")),
    selectedShipName: normalizeDisplayName(formData.get("selectedShipName")) ||
      cleanText(formData.get("shipType")),
    selectedShipTypeId: cleanText(formData.get("selectedShipTypeId"))
  };
}

function buildSrpAssistActionState(
  fields: SrpAssistActionState["fields"],
  assist: Awaited<ReturnType<typeof analyzeSrpAssist>>
): SrpAssistActionState {
  const hasWarnings = assist.warnings.length > 0 || Boolean(assist.error);
  const status = assist.assistStatus === "failed"
    ? "error"
    : hasWarnings
      ? "warning"
      : "success";

  return {
    assist: {
      assistStatus: assist.assistStatus,
      calculatedEligibleAmount: assist.calculatedEligibleAmount?.toString() || "",
      calculationSource: assist.calculationSource,
      detectedShipName: assist.detectedShipName,
      detectedShipTypeId: assist.detectedShipTypeId ? String(assist.detectedShipTypeId) : "",
      insurancePayout: assist.insurancePayout?.toString() || "",
      killmailId: assist.killmailId,
      killmailTotalValue: assist.killmailTotalValue?.toString() || "",
      selectedShipName: assist.selectedShipName,
      selectedShipTypeId: assist.selectedShipTypeId ? String(assist.selectedShipTypeId) : "",
      shipDetectionSource: assist.shipDetectionSource,
      srpAssistError: assist.error,
      warnings: assist.warnings.join("\n")
    },
    fields: {
      ...fields,
      requestedAmount: assist.calculatedEligibleAmount?.toString() ||
        fields.requestedAmount,
      selectedShipName: assist.selectedShipName ||
        assist.detectedShipName ||
        fields.selectedShipName,
      selectedShipTypeId: assist.selectedShipTypeId
        ? String(assist.selectedShipTypeId)
        : assist.detectedShipTypeId
          ? String(assist.detectedShipTypeId)
          : fields.selectedShipTypeId
    },
    message: status === "success"
      ? "Killmail analyzed successfully."
      : status === "warning"
        ? "SRP assist completed with warnings. Review before submitting."
        : "Unable to analyze killmail. Select the ship manually or paste an ESI killmail URL.",
    status
  };
}
