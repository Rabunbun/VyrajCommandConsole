import "server-only";
import { CorpStatus, OfficerRole } from "@prisma/client";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import type { CurrentOfficerSession } from "@/lib/session";

export const operationStatusOptions = [
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED"
] as const;

export const operationTypeOptions = [
  "FLEET",
  "MINING",
  "PVE",
  "PVP",
  "LOGISTICS",
  "TRAINING",
  "OTHER"
] as const;

export const attendanceStatusOptions = [
  "ATTENDING",
  "MAYBE",
  "NOT_ATTENDING",
  "ATTENDED",
  "MISSED"
] as const;

export type OperationStatus = (typeof operationStatusOptions)[number];
export type OperationType = (typeof operationTypeOptions)[number];
export type AttendanceStatus = (typeof attendanceStatusOptions)[number];

export type AttendanceCorpView = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  status: CorpStatus;
};

export type AttendanceEntryView = {
  id: string;
  pilotName: string;
  characterName: string;
  roleFlown: string;
  shipFlown: string;
  status: string;
  notes: string;
  updatedAt: string;
};

export type OperationView = {
  id: string;
  title: string;
  operationType: string;
  status: string;
  scheduledFor: string | null;
  location: string;
  doctrine: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  attendance: AttendanceEntryView[];
  attendanceSummary: Record<string, number>;
};

export type AttendancePageData =
  | {
      status: "ready";
      corp: AttendanceCorpView;
      operations: OperationView[];
      canManageOperations: boolean;
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
      corp: AttendanceCorpView;
      message: string;
    };

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function getAttendancePageData(
  corpSlug: string,
  session: CurrentOfficerSession | null
): Promise<AttendancePageData> {
  const corp = await getDb().corp.findUnique({
    where: { slug: corpSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      ticker: true,
      status: true,
      enabledModules: true,
      operations: {
        orderBy: [{ operationDate: "asc" }, { createdAt: "desc" }],
        select: {
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
          updatedAt: true,
          attendance: {
            orderBy: [{ updatedAt: "desc" }],
            select: {
              id: true,
              pilotName: true,
              characterName: true,
              roleFlown: true,
              shipFlown: true,
              rewardEligible: true,
              notes: true,
              updatedAt: true
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
      message: "This corp is not available for public attendance access."
    };
  }

  if (!isAttendanceEnabled(corp.enabledModules)) {
    return {
      status: "module_disabled",
      corp: publicCorp,
      message: "Op Attendance is not enabled for this corp."
    };
  }

  const canManage = canManageOperations(session, corp.id);
  const accessMode = session?.officer.role === OfficerRole.SUPER_ADMIN
    ? "Super Admin View"
    : canManage
      ? "Officer View"
      : "Member View";

  return {
    status: "ready",
    corp: publicCorp,
    operations: corp.operations.map((operation) => {
      const attendance = operation.attendance.map((entry) => ({
        id: entry.id,
        pilotName: entry.pilotName,
        characterName: entry.characterName,
        roleFlown: entry.roleFlown,
        shipFlown: entry.shipFlown,
        status: normalizeOptionValue(entry.rewardEligible, "ATTENDING"),
        notes: entry.notes,
        updatedAt: entry.updatedAt.toISOString()
      }));

      return {
        id: operation.id,
        title: operation.operationName,
        operationType: normalizeOptionValue(operation.operationType, "OTHER"),
        status: normalizeOptionValue(operation.status, "PLANNED"),
        scheduledFor: operation.operationDate
          ? operation.operationDate.toISOString()
          : null,
        location: operation.location,
        doctrine: operation.doctrineUsed,
        description: operation.notes,
        createdBy: operation.fcLead,
        createdAt: operation.createdAt.toISOString(),
        updatedAt: operation.updatedAt.toISOString(),
        attendance,
        attendanceSummary: summarizeAttendance(attendance)
      };
    }),
    canManageOperations: canManage,
    accessMode
  };
}

export function canManageOperations(
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

  return assignedToCorp && hasPermission(session, "operationsManage", corpId);
}

export function isAttendanceEnabled(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).attendance === true;
}

export function normalizeAttendanceName(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

function normalizeOptionValue(value: string, fallback: string) {
  const normalized = value.trim().replace(/\s+/g, "_").toUpperCase();

  return normalized || fallback;
}

function summarizeAttendance(attendance: AttendanceEntryView[]) {
  const summary: Record<string, number> = {};

  for (const entry of attendance) {
    summary[entry.status] = (summary[entry.status] || 0) + 1;
  }

  return summary;
}
