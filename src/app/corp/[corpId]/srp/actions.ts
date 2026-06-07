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
import { getCurrentOfficerSession } from "@/lib/session";

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function submitSrpRequestAction(formData: FormData) {
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "SRP request submitted.";

  try {
    const corp = await getPublicSrpCorp(corpSlug);
    const characterName = normalizeDisplayName(formData.get("characterName"));
    const shipType = cleanText(formData.get("shipType"));
    const killmailUrl = cleanText(formData.get("killmailUrl"));
    const lossDate = cleanText(formData.get("lossDate"));
    const requestedAmount = parseIskAmount(formData.get("requestedAmount"), {
      allowBlank: false,
      label: "Requested amount"
    });
    const doctrineName = cleanText(formData.get("doctrineName"));
    const notes = cleanText(formData.get("notes"));

    if (!characterName) {
      throw new Error("Character or pilot name is required.");
    }

    if (!shipType) {
      throw new Error("Ship type is required.");
    }

    await getDb().srpRequest.create({
      data: {
        corpId: corp.id,
        pilotName: characterName,
        characterName,
        shipLost: shipType,
        killmailLink: killmailUrl,
        doctrineFleet: doctrineName,
        lossType: lossDate,
        estimatedValue: requestedAmount,
        requestedPayout: null,
        status: "SUBMITTED",
        notes
      }
    });

    revalidatePath(`/corp/${corp.slug}/srp`);
    successMessage = "SRP request submitted for review.";
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

export async function updateSrpRequestAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "SRP request updated.";

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
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
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

  if (afterStatus === "PAID") {
    return "SRP Marked Paid";
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
} as const;

type SrpAuditRecord = {
  id: string;
  characterName: string;
  shipLost: string;
  killmailLink: string;
  doctrineFleet: string;
  lossType: string;
  estimatedValue: Prisma.Decimal | null;
  requestedPayout: Prisma.Decimal | null;
  reviewer: string;
  status: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

function formatSrpRequestForAudit(request: SrpAuditRecord) {
  return {
    id: request.id,
    characterName: request.characterName,
    shipType: request.shipLost,
    killmailUrl: request.killmailLink,
    doctrineName: request.doctrineFleet,
    lossDate: request.lossType,
    requestedAmount: request.estimatedValue
      ? request.estimatedValue.toString()
      : null,
    payoutAmount: request.requestedPayout
      ? request.requestedPayout.toString()
      : null,
    reviewerName: request.reviewer,
    status: normalizeSrpStatus(request.status),
    notes: request.notes,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString()
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "SRP action failed.";
}

function redirectWithMessage(
  corpSlug: string,
  type: "success" | "error",
  message: string
): never {
  const slug = corpSlug || "unknown";
  redirect(`/corp/${slug}/srp?${type}=${encodeURIComponent(message)}`);
}
