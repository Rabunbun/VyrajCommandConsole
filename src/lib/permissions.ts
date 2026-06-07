import { OfficerRole } from "@prisma/client";
import type { CurrentOfficerSession } from "@/lib/session";

export const officerPermissionOptions = [
  {
    key: "allianceDashboardView",
    label: "Alliance Dashboard View"
  },
  {
    key: "allianceHubEdit",
    label: "Alliance Hub Edit"
  },
  {
    key: "allianceAnnouncementsEdit",
    label: "Alliance Announcements Edit"
  },
  {
    key: "corpDetailsEdit",
    label: "Corp Details Edit"
  },
  {
    key: "corpDashboardView",
    label: "Corp Dashboard View"
  },
  {
    key: "recruitmentReview",
    label: "Recruitment Review"
  },
  {
    key: "lootSplitManage",
    label: "Loot Split Manage"
  },
  {
    key: "srpReview",
    label: "SRP Review"
  },
  {
    key: "doctrineManage",
    label: "Doctrine Manage"
  },
  {
    key: "operationsManage",
    label: "Operations Manage"
  },
  {
    key: "officerManage",
    label: "Officer Manage"
  }
] as const;

export type OfficerPermissionOption = (typeof officerPermissionOptions)[number];
export type OfficerPermissionKey = OfficerPermissionOption["key"];

export const officerPermissionKeys = officerPermissionOptions.map((option) => option.key);

export function hasPermission(
  session: CurrentOfficerSession | null,
  permissionKey: string,
  corpId?: string
) {
  if (!session || !permissionKey) {
    return false;
  }

  if (session.officer.role === OfficerRole.SUPER_ADMIN) {
    return true;
  }

  return session.permissions.some((permission) => {
    if (permission.permissionKey !== permissionKey) {
      return false;
    }

    return !permission.corpId || !corpId || permission.corpId === corpId;
  });
}
