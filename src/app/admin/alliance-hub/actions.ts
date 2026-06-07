"use server";

import {
  AllianceContentPriority,
  AllianceContentType,
  ContentAudience,
  ContentStatus
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { getCurrentOfficerSession } from "@/lib/session";

const allianceHubEditorPath = "/admin/alliance-hub";

export async function createAllianceHubContentAction(formData: FormData) {
  const actor = await requireAllianceHubEditorAccess();
  let successMessage = "Alliance Hub content created.";

  try {
    const data = parseContentForm(formData);

    const created = await getDb().allianceHubContent.create({
      data: {
        ...data,
        createdBy: actor.officer.officerName
      },
      select: contentAuditSelect
    });

    await logOfficerAudit({
      officerId: actor.officer.id,
      officerName: actor.officer.officerName,
      officerRole: actor.officer.role,
      module: "Alliance Hub Editor",
      action: "Alliance Hub Content Created",
      targetType: "AllianceHubContent",
      targetId: created.id,
      targetName: created.title,
      summary: `Created Alliance Hub content: ${created.title}.`,
      details: {
        after: formatContentForAudit(created)
      }
    });

    revalidateAllianceHubPaths();
    successMessage = `Content "${created.title}" created.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

export async function updateAllianceHubContentAction(formData: FormData) {
  const actor = await requireAllianceHubEditorAccess();
  let successMessage = "Alliance Hub content updated.";

  try {
    const contentId = cleanText(formData.get("contentId"));

    if (!contentId) {
      throw new Error("Content ID is required.");
    }

    const existing = await getDb().allianceHubContent.findUnique({
      where: { id: contentId },
      select: contentAuditSelect
    });

    if (!existing) {
      throw new Error("Alliance Hub content not found.");
    }

    const data = parseContentForm(formData);

    const updated = await getDb().allianceHubContent.update({
      where: { id: contentId },
      data,
      select: contentAuditSelect
    });

    await logOfficerAudit({
      officerId: actor.officer.id,
      officerName: actor.officer.officerName,
      officerRole: actor.officer.role,
      module: "Alliance Hub Editor",
      action: "Alliance Hub Content Updated",
      targetType: "AllianceHubContent",
      targetId: updated.id,
      targetName: updated.title,
      summary: `Updated Alliance Hub content: ${updated.title}.`,
      details: {
        before: formatContentForAudit(existing),
        after: formatContentForAudit(updated)
      }
    });

    if (existing.status !== updated.status) {
      await logOfficerAudit({
        officerId: actor.officer.id,
        officerName: actor.officer.officerName,
        officerRole: actor.officer.role,
        module: "Alliance Hub Editor",
        action: "Alliance Hub Content Status Changed",
        targetType: "AllianceHubContent",
        targetId: updated.id,
        targetName: updated.title,
        summary: `Changed Alliance Hub content status from ${existing.status} to ${updated.status}.`,
        details: {
          before: {
            status: existing.status
          },
          after: {
            status: updated.status
          }
        }
      });
    }

    revalidateAllianceHubPaths();
    successMessage = `Content "${updated.title}" updated.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

async function requireAllianceHubEditorAccess() {
  const session = await getCurrentOfficerSession();

  if (!session) {
    redirect("/login");
  }

  if (
    !hasPermission(session, "allianceHubEdit") &&
    !hasPermission(session, "allianceAnnouncementsEdit")
  ) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Alliance Hub Editor",
      action: "Access Denied",
      targetType: "Route",
      targetName: allianceHubEditorPath,
      summary: "Officer attempted an Alliance Hub Editor mutation without permission."
    });

    redirectWithMessage("error", "Alliance Hub Editor access is required.");
  }

  return session;
}

function parseContentForm(formData: FormData) {
  const contentType = parseContentType(formData.get("contentType"));
  const title = cleanText(formData.get("title"));
  const body = cleanText(formData.get("body"));
  const audience = parseAudience(formData.get("audience"));
  const priority = parsePriority(formData.get("priority"));
  const status = parseStatus(formData.get("status"));
  const startDate = parseOptionalDate(formData.get("startDate"), "Start date");
  const endDate = parseOptionalDate(formData.get("endDate"), "End date");

  if (!title) {
    throw new Error("Content title is required.");
  }

  if (!body) {
    throw new Error("Content body is required.");
  }

  if (startDate && endDate && endDate < startDate) {
    throw new Error("End date cannot be before start date.");
  }

  return {
    contentType,
    title,
    body,
    audience,
    priority,
    status,
    startDate,
    endDate
  };
}

function parseContentType(value: FormDataEntryValue | null) {
  if (
    value === AllianceContentType.ANNOUNCEMENT ||
    value === AllianceContentType.ALERT ||
    value === AllianceContentType.PRIORITY ||
    value === AllianceContentType.STANDING_ORDER ||
    value === AllianceContentType.FEATURED_OP ||
    value === AllianceContentType.NOTE
  ) {
    return value;
  }

  throw new Error("Invalid content type.");
}

function parseAudience(value: FormDataEntryValue | null) {
  if (
    value === ContentAudience.ALL_MEMBERS ||
    value === ContentAudience.OFFICERS ||
    value === ContentAudience.SUPER_ADMINS
  ) {
    return value;
  }

  throw new Error("Invalid content audience.");
}

function parsePriority(value: FormDataEntryValue | null) {
  if (
    value === AllianceContentPriority.LOW ||
    value === AllianceContentPriority.NORMAL ||
    value === AllianceContentPriority.HIGH ||
    value === AllianceContentPriority.CRITICAL
  ) {
    return value;
  }

  throw new Error("Invalid content priority.");
}

function parseStatus(value: FormDataEntryValue | null) {
  if (
    value === ContentStatus.ACTIVE ||
    value === ContentStatus.DRAFT ||
    value === ContentStatus.EXPIRED ||
    value === ContentStatus.ARCHIVED
  ) {
    return value;
  }

  throw new Error("Invalid content status.");
}

function parseOptionalDate(value: FormDataEntryValue | null, label: string) {
  const raw = cleanText(value);

  if (!raw) {
    return null;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is invalid.`);
  }

  return date;
}

const contentAuditSelect = {
  id: true,
  contentType: true,
  title: true,
  body: true,
  audience: true,
  priority: true,
  status: true,
  startDate: true,
  endDate: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
} as const;

type ContentAuditRecord = {
  id: string;
  contentType: AllianceContentType;
  title: string;
  body: string;
  audience: ContentAudience;
  priority: AllianceContentPriority;
  status: ContentStatus;
  startDate: Date | null;
  endDate: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function formatContentForAudit(content: ContentAuditRecord) {
  return {
    id: content.id,
    contentType: content.contentType,
    title: content.title,
    body: content.body,
    audience: content.audience,
    priority: content.priority,
    status: content.status,
    startDate: content.startDate ? content.startDate.toISOString() : null,
    endDate: content.endDate ? content.endDate.toISOString() : null,
    createdBy: content.createdBy,
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString()
  };
}

function revalidateAllianceHubPaths() {
  revalidatePath(allianceHubEditorPath);
  revalidatePath("/");
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Alliance Hub Editor action failed.";
}

function redirectWithMessage(type: "success" | "error", message: string): never {
  redirect(`${allianceHubEditorPath}?${type}=${encodeURIComponent(message)}`);
}
