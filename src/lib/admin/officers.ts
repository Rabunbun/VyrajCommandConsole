import "server-only";
import { OfficerRole, type OfficerStatus } from "@prisma/client";
import { getDb } from "@/lib/db";
import { officerPermissionOptions } from "@/lib/permissions";

export type AdminCorpOption = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
};

export type AdminOfficerView = {
  id: string;
  officerName: string;
  role: OfficerRole;
  status: OfficerStatus;
  createdAt: string;
  lastLoginAt: string | null;
  assignedCorps: Array<{
    id: string;
    slug: string;
    name: string;
    ticker: string;
  }>;
  globalPermissions: string[];
  corpPermissions: Array<{
    permissionKey: string;
    corp: {
      id: string;
      slug: string;
      name: string;
      ticker: string;
    } | null;
  }>;
};

export type OfficerManagementData = {
  officers: AdminOfficerView[];
  corps: AdminCorpOption[];
  permissionOptions: typeof officerPermissionOptions;
};

export async function getOfficerManagementData(): Promise<OfficerManagementData> {
  const [officers, corps] = await Promise.all([
    getDb().officer.findMany({
      orderBy: [{ role: "asc" }, { officerName: "asc" }],
      select: {
        id: true,
        officerName: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        corpAssignments: {
          orderBy: {
            corp: {
              name: "asc"
            }
          },
          select: {
            corp: {
              select: {
                id: true,
                slug: true,
                name: true,
                ticker: true
              }
            }
          }
        },
        permissions: {
          orderBy: [{ permissionKey: "asc" }],
          select: {
            permissionKey: true,
            corp: {
              select: {
                id: true,
                slug: true,
                name: true,
                ticker: true
              }
            }
          }
        }
      }
    }),
    getDb().corp.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        ticker: true
      }
    })
  ]);

  return {
    officers: officers.map(formatOfficerForAdminView),
    corps,
    permissionOptions: officerPermissionOptions
  };
}

type OfficerQueryResult = {
  id: string;
  officerName: string;
  role: OfficerRole;
  status: OfficerStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
  corpAssignments: Array<{
    corp: {
      id: string;
      slug: string;
      name: string;
      ticker: string;
    };
  }>;
  permissions: Array<{
    permissionKey: string;
    corp: {
      id: string;
      slug: string;
      name: string;
      ticker: string;
    } | null;
  }>;
};

function formatOfficerForAdminView(officer: OfficerQueryResult): AdminOfficerView {
  const globalPermissions = officer.permissions
    .filter((permission) => !permission.corp)
    .map((permission) => permission.permissionKey);
  const corpPermissions = officer.permissions
    .filter((permission) => permission.corp)
    .map((permission) => ({
      permissionKey: permission.permissionKey,
      corp: permission.corp
    }));

  return {
    id: officer.id,
    officerName: officer.officerName,
    role: officer.role,
    status: officer.status,
    createdAt: officer.createdAt.toISOString(),
    lastLoginAt: officer.lastLoginAt ? officer.lastLoginAt.toISOString() : null,
    assignedCorps: officer.corpAssignments.map((assignment) => assignment.corp),
    globalPermissions: officer.role === OfficerRole.SUPER_ADMIN
      ? []
      : globalPermissions,
    corpPermissions: officer.role === OfficerRole.SUPER_ADMIN
      ? []
      : corpPermissions
  };
}
