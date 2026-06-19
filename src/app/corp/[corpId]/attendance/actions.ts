"use server";

import { CorpStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import { getCorpPortalAccessContext } from "@/lib/corp-portal-access";
import { getDb } from "@/lib/db";
import {
  attendanceStatusOptions,
  canManageOperations,
  isAttendanceEnabled,
  normalizeAttendanceName,
  operationStatusOptions,
  operationTypeOptions
} from "@/lib/modules/attendance";
import { getCurrentOfficerSession } from "@/lib/session";

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function submitAttendanceAction(formData: FormData) {
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Attendance submitted.";

  try {
    const corp = await getPublicAttendanceCorp(corpSlug);
    await requireHardLockdownMemberAccess(corpSlug);
    const operationId = cleanText(formData.get("operationId"));
    const characterName = normalizeDisplayName(formData.get("characterName"));
    const attendanceStatus = parseAttendanceStatus(formData.get("attendanceStatus"));
    const roleFlown = cleanText(formData.get("roleFlown"));
    const shipFlown = cleanText(formData.get("shipFlown"));
    const notes = cleanText(formData.get("notes"));

    if (!operationId) {
      throw new Error("Operation is required.");
    }

    if (!characterName) {
      throw new Error("Pilot or character name is required.");
    }

    const operation = await getDb().operation.findFirst({
      where: {
        id: operationId,
        corpId: corp.id
      },
      select: {
        id: true,
        status: true
      }
    });

    if (!operation) {
      throw new Error("Operation unavailable.");
    }

    if (normalizeStatus(operation.status) === "CANCELLED") {
      throw new Error("Attendance cannot be submitted for a cancelled operation.");
    }

    const normalizedName = normalizeAttendanceName(characterName);
    const existingEntries = await getDb().operationAttendance.findMany({
      where: {
        operationId
      },
      select: {
        id: true,
        characterName: true
      }
    });
    const existing = existingEntries.find(
      (entry) => normalizeAttendanceName(entry.characterName) === normalizedName
    );

    if (existing) {
      await getDb().operationAttendance.update({
        where: { id: existing.id },
        data: {
          pilotName: characterName,
          characterName,
          roleFlown,
          shipFlown,
          rewardEligible: attendanceStatus,
          notes
        }
      });
      successMessage = `Attendance updated for ${characterName}.`;
    } else {
      await getDb().operationAttendance.create({
        data: {
          corpId: corp.id,
          operationId,
          pilotName: characterName,
          characterName,
          roleFlown,
          shipFlown,
          rewardEligible: attendanceStatus,
          notes
        }
      });
      successMessage = `Attendance submitted for ${characterName}.`;
    }

    revalidatePath(`/corp/${corp.slug}/attendance`);
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

async function requireHardLockdownMemberAccess(corpSlug: string) {
  const access = await getCorpPortalAccessContext(corpSlug);

  if (!access.allowed) {
    throw new Error(
      access.loginRequired
        ? "Login with EVE or an officer account is required for this module."
        : access.reason
    );
  }
}

export async function createOperationAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Operation created.";

  try {
    const corp = await getPublicAttendanceCorp(corpSlug);

    if (!canManageOperations(session, corp.id)) {
      throw new Error("Operation management permission is required.");
    }

    const data = parseOperationForm(formData);

    const operation = await getDb().operation.create({
      data: {
        corpId: corp.id,
        operationName: data.title,
        operationType: data.operationType,
        operationDate: data.scheduledFor,
        fcLead: session?.officer.officerName || "",
        location: data.location,
        doctrineUsed: data.doctrine,
        status: data.status,
        notes: data.description
      },
      select: operationAuditSelect
    });

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "Op Attendance",
      action: "Operation Created",
      targetType: "Operation",
      targetId: operation.id,
      targetName: operation.operationName,
      summary: `Created operation ${operation.operationName}.`,
      details: {
        after: formatOperationForAudit(operation)
      }
    });

    revalidatePath(`/corp/${corp.slug}/attendance`);
    successMessage = `Operation ${operation.operationName} created.`;
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

export async function updateOperationAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Operation updated.";

  try {
    const corp = await getPublicAttendanceCorp(corpSlug);

    if (!canManageOperations(session, corp.id)) {
      throw new Error("Operation management permission is required.");
    }

    const operationId = cleanText(formData.get("operationId"));

    if (!operationId) {
      throw new Error("Operation ID is required.");
    }

    const existing = await getDb().operation.findFirst({
      where: {
        id: operationId,
        corpId: corp.id
      },
      select: operationAuditSelect
    });

    if (!existing) {
      throw new Error("Operation unavailable.");
    }

    const data = parseOperationForm(formData);

    const updated = await getDb().operation.update({
      where: { id: operationId },
      data: {
        operationName: data.title,
        operationType: data.operationType,
        operationDate: data.scheduledFor,
        location: data.location,
        doctrineUsed: data.doctrine,
        status: data.status,
        notes: data.description
      },
      select: operationAuditSelect
    });

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "Op Attendance",
      action: "Operation Updated",
      targetType: "Operation",
      targetId: updated.id,
      targetName: updated.operationName,
      summary: `Updated operation ${updated.operationName}.`,
      details: {
        before: formatOperationForAudit(existing),
        after: formatOperationForAudit(updated)
      }
    });

    if (normalizeStatus(existing.status) !== normalizeStatus(updated.status)) {
      await logOfficerAudit({
        officerId: session?.officer.id,
        officerName: session?.officer.officerName,
        officerRole: session?.officer.role,
        corpId: corp.id,
        corpSlug: corp.slug,
        corpName: corp.name,
        module: "Op Attendance",
        action: "Operation Status Changed",
        targetType: "Operation",
        targetId: updated.id,
        targetName: updated.operationName,
        summary: `Changed operation status from ${existing.status} to ${updated.status}.`,
        details: {
          before: { status: existing.status },
          after: { status: updated.status }
        }
      });
    }

    revalidatePath(`/corp/${corp.slug}/attendance`);
    successMessage = `Operation ${updated.operationName} updated.`;
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

async function getPublicAttendanceCorp(corpSlug: string) {
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
    throw new Error("This corp is not available for public attendance access.");
  }

  if (!isAttendanceEnabled(corp.enabledModules)) {
    throw new Error("Op Attendance is not enabled for this corp.");
  }

  return corp;
}

function parseOperationForm(formData: FormData) {
  const title = cleanText(formData.get("title"));
  const operationType = parseOperationType(formData.get("operationType"));
  const status = parseOperationStatus(formData.get("status"));
  const scheduledFor = parseOptionalDate(formData.get("scheduledFor"));
  const location = cleanText(formData.get("location"));
  const doctrine = cleanText(formData.get("doctrine"));
  const description = cleanText(formData.get("description"));

  if (!title) {
    throw new Error("Operation title is required.");
  }

  return {
    title,
    operationType,
    status,
    scheduledFor,
    location,
    doctrine,
    description
  };
}

function parseOperationStatus(value: FormDataEntryValue | null) {
  const status = normalizeStatus(String(value || ""));

  if (operationStatusOptions.includes(status as (typeof operationStatusOptions)[number])) {
    return status;
  }

  throw new Error("Invalid operation status.");
}

function parseOperationType(value: FormDataEntryValue | null) {
  const type = normalizeStatus(String(value || ""));

  if (operationTypeOptions.includes(type as (typeof operationTypeOptions)[number])) {
    return type;
  }

  throw new Error("Invalid operation type.");
}

function parseAttendanceStatus(value: FormDataEntryValue | null) {
  const status = normalizeStatus(String(value || ""));

  if (attendanceStatusOptions.includes(status as (typeof attendanceStatusOptions)[number])) {
    return status;
  }

  throw new Error("Invalid attendance status.");
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  const raw = cleanText(value);

  if (!raw) {
    return null;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Scheduled time is invalid.");
  }

  return date;
}

function normalizeStatus(value: string) {
  return value.trim().replace(/\s+/g, "_").toUpperCase();
}

function normalizeDisplayName(value: FormDataEntryValue | null) {
  return cleanText(value).replace(/\s+/g, " ");
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

const operationAuditSelect = {
  id: true,
  operationName: true,
  operationType: true,
  operationDate: true,
  fcLead: true,
  location: true,
  doctrineUsed: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true
} as const;

type OperationAuditRecord = {
  id: string;
  operationName: string;
  operationType: string;
  operationDate: Date | null;
  fcLead: string;
  location: string;
  doctrineUsed: string;
  status: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

function formatOperationForAudit(operation: OperationAuditRecord) {
  return {
    id: operation.id,
    title: operation.operationName,
    operationType: operation.operationType,
    scheduledFor: operation.operationDate
      ? operation.operationDate.toISOString()
      : null,
    createdBy: operation.fcLead,
    location: operation.location,
    doctrine: operation.doctrineUsed,
    status: operation.status,
    description: operation.notes,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString()
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Attendance action failed.";
}

function redirectWithMessage(
  corpSlug: string,
  type: "success" | "error",
  message: string
): never {
  const slug = corpSlug || "unknown";
  redirect(`/corp/${slug}/attendance?${type}=${encodeURIComponent(message)}`);
}
