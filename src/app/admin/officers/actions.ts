"use server";

import { OfficerRole, OfficerStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { officerPermissionKeys } from "@/lib/permissions";
import { getCurrentOfficerSession } from "@/lib/session";

const officerManagementPath = "/admin/officers";
const minPasswordLength = 12;

export async function createOfficerAction(formData: FormData) {
  const admin = await requireSuperAdminForMutation();
  let successMessage = "Officer created.";

  try {
    const officerName = normalizeOfficerName(formData.get("officerName"));
    const normalizedOfficerName = normalizeOfficerNameForComparison(officerName);
    const role = parseOfficerRole(formData.get("role"));
    const status = parseOfficerStatus(formData.get("status"));
    const temporaryPassword = String(formData.get("temporaryPassword") || "");
    const assignedCorpIds = uniqueStrings(formData.getAll("assignedCorpIds"));
    const permissionKeys = uniqueStrings(formData.getAll("permissionKeys"));

    if (!officerName) {
      throw new Error("Officer name is required.");
    }

    if (temporaryPassword.trim().length < minPasswordLength) {
      throw new Error(`Temporary password must be at least ${minPasswordLength} characters.`);
    }

    validatePermissionKeys(permissionKeys);
    await validateCorpIds(assignedCorpIds);

    if (await officerNameExists(normalizedOfficerName)) {
      throw new Error("An officer with that name already exists.");
    }

    const passwordHash = await hashPassword(temporaryPassword);

    const created = await getDb().$transaction(async (tx) => {
      const officer = await tx.officer.create({
        data: {
          officerName,
          role,
          status,
          passwordHash,
          disabledAt: status === OfficerStatus.DISABLED ? new Date() : null
        },
        select: {
          id: true,
          officerName: true,
          role: true,
          status: true
        }
      });

      if (role !== OfficerRole.SUPER_ADMIN && assignedCorpIds.length) {
        await tx.officerCorpAssignment.createMany({
          data: assignedCorpIds.map((corpId) => ({
            officerId: officer.id,
            corpId
          })),
          skipDuplicates: true
        });
      }

      if (role !== OfficerRole.SUPER_ADMIN && permissionKeys.length) {
        await tx.officerPermission.createMany({
          data: permissionKeys.map((permissionKey) => ({
            officerId: officer.id,
            permissionKey,
            corpId: null
          })),
          skipDuplicates: true
        });
      }

      return officer;
    });

    await logOfficerAudit({
      officerId: admin.officer.id,
      officerName: admin.officer.officerName,
      officerRole: admin.officer.role,
      module: "Officer Management",
      action: "Officer Created",
      targetType: "Officer",
      targetId: created.id,
      targetName: created.officerName,
      summary: `Created officer account ${created.officerName}.`,
      details: {
        role: created.role,
        status: created.status,
        assignedCorpCount: role === OfficerRole.SUPER_ADMIN ? 0 : assignedCorpIds.length,
        permissionKeys: role === OfficerRole.SUPER_ADMIN ? [] : permissionKeys
      }
    });

    revalidatePath(officerManagementPath);
    successMessage = `Officer ${created.officerName} created.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

export async function updateOfficerAction(formData: FormData) {
  const admin = await requireSuperAdminForMutation();
  let successMessage = "Officer updated.";

  try {
    const officerId = cleanText(formData.get("officerId"));
    const role = parseOfficerRole(formData.get("role"));
    const status = parseOfficerStatus(formData.get("status"));
    const assignedCorpIds = uniqueStrings(formData.getAll("assignedCorpIds"));
    const permissionKeys = uniqueStrings(formData.getAll("permissionKeys"));

    if (!officerId) {
      throw new Error("Officer ID is required.");
    }

    validatePermissionKeys(permissionKeys);
    await validateCorpIds(assignedCorpIds);

    const existing = await getDb().officer.findUnique({
      where: { id: officerId },
      select: {
        id: true,
        officerName: true,
        role: true,
        status: true,
        corpAssignments: {
          select: {
            corpId: true
          }
        },
        permissions: {
          where: {
            corpId: null
          },
          select: {
            permissionKey: true
          }
        }
      }
    });

    if (!existing) {
      throw new Error("Officer account not found.");
    }

    await ensureActiveSuperAdminRemains(existing, role, status);

    const updated = await getDb().$transaction(async (tx) => {
      const officer = await tx.officer.update({
        where: { id: officerId },
        data: {
          role,
          status,
          disabledAt: status === OfficerStatus.DISABLED ? new Date() : null
        },
        select: {
          id: true,
          officerName: true,
          role: true,
          status: true
        }
      });

      let revokedSessionCount = 0;

      if (status === OfficerStatus.DISABLED) {
        const revokedSessions = await tx.officerSession.updateMany({
          where: {
            officerId,
            revokedAt: null,
            expiresAt: {
              gt: new Date()
            }
          },
          data: {
            revokedAt: new Date()
          }
        });

        revokedSessionCount = revokedSessions.count;
      }

      if (role !== OfficerRole.SUPER_ADMIN) {
        await tx.officerCorpAssignment.deleteMany({
          where: { officerId }
        });

        if (assignedCorpIds.length) {
          await tx.officerCorpAssignment.createMany({
            data: assignedCorpIds.map((corpId) => ({
              officerId,
              corpId
            })),
            skipDuplicates: true
          });
        }

        await tx.officerPermission.deleteMany({
          where: {
            officerId,
            corpId: null
          }
        });

        if (permissionKeys.length) {
          await tx.officerPermission.createMany({
            data: permissionKeys.map((permissionKey) => ({
              officerId,
              permissionKey,
              corpId: null
            })),
            skipDuplicates: true
          });
        }
      }

      return {
        officer,
        revokedSessionCount
      };
    });

    await logOfficerAudit({
      officerId: admin.officer.id,
      officerName: admin.officer.officerName,
      officerRole: admin.officer.role,
      module: "Officer Management",
      action: "Officer Updated",
      targetType: "Officer",
      targetId: updated.officer.id,
      targetName: updated.officer.officerName,
      summary: `Updated officer account ${updated.officer.officerName}.`,
      details: {
        before: {
          role: existing.role,
          status: existing.status,
          assignedCorpIds: existing.corpAssignments.map((assignment) => assignment.corpId),
          permissionKeys: existing.permissions.map((permission) => permission.permissionKey)
        },
        after: {
          role: updated.officer.role,
          status: updated.officer.status,
          assignedCorpIds: updated.officer.role === OfficerRole.SUPER_ADMIN
            ? "unchanged"
            : assignedCorpIds,
          permissionKeys: updated.officer.role === OfficerRole.SUPER_ADMIN
            ? "unchanged"
            : permissionKeys,
          revokedSessionCount: updated.revokedSessionCount
        }
      }
    });

    if (updated.revokedSessionCount) {
      await logOfficerAudit({
        officerId: admin.officer.id,
        officerName: admin.officer.officerName,
        officerRole: admin.officer.role,
        module: "Officer Management",
        action: "Officer Sessions Revoked",
        targetType: "Officer",
        targetId: updated.officer.id,
        targetName: updated.officer.officerName,
        summary: `Revoked ${updated.revokedSessionCount} active officer session(s).`,
        details: {
          reason: "Officer disabled through edit form.",
          revokedSessionCount: updated.revokedSessionCount
        }
      });
    }

    revalidatePath(officerManagementPath);
    successMessage = `Officer ${updated.officer.officerName} updated.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

export async function setOfficerStatusAction(formData: FormData) {
  const admin = await requireSuperAdminForMutation();
  let successMessage = "Officer status updated.";

  try {
    const officerId = cleanText(formData.get("officerId"));
    const nextStatus = parseOfficerStatus(formData.get("status"));

    if (!officerId) {
      throw new Error("Officer ID is required.");
    }

    const existing = await getDb().officer.findUnique({
      where: { id: officerId },
      select: {
        id: true,
        officerName: true,
        role: true,
        status: true
      }
    });

    if (!existing) {
      throw new Error("Officer account not found.");
    }

    await ensureActiveSuperAdminRemains(existing, existing.role, nextStatus);

    const result = await getDb().$transaction(async (tx) => {
      const officer = await tx.officer.update({
        where: { id: officerId },
        data: {
          status: nextStatus,
          disabledAt: nextStatus === OfficerStatus.DISABLED ? new Date() : null
        },
        select: {
          id: true,
          officerName: true,
          role: true,
          status: true
        }
      });

      let revokedSessionCount = 0;

      if (nextStatus === OfficerStatus.DISABLED) {
        const revokedSessions = await tx.officerSession.updateMany({
          where: {
            officerId,
            revokedAt: null,
            expiresAt: {
              gt: new Date()
            }
          },
          data: {
            revokedAt: new Date()
          }
        });

        revokedSessionCount = revokedSessions.count;
      }

      return {
        officer,
        revokedSessionCount
      };
    });

    const action =
      nextStatus === OfficerStatus.DISABLED ? "Officer Disabled" : "Officer Enabled";

    await logOfficerAudit({
      officerId: admin.officer.id,
      officerName: admin.officer.officerName,
      officerRole: admin.officer.role,
      module: "Officer Management",
      action,
      targetType: "Officer",
      targetId: result.officer.id,
      targetName: result.officer.officerName,
      summary: `${result.officer.officerName} was ${nextStatus.toLowerCase()}.`,
      details: {
        before: {
          status: existing.status
        },
        after: {
          status: result.officer.status,
          revokedSessionCount: result.revokedSessionCount
        }
      }
    });

    if (result.revokedSessionCount) {
      await logOfficerAudit({
        officerId: admin.officer.id,
        officerName: admin.officer.officerName,
        officerRole: admin.officer.role,
        module: "Officer Management",
        action: "Officer Sessions Revoked",
        targetType: "Officer",
        targetId: result.officer.id,
        targetName: result.officer.officerName,
        summary: `Revoked ${result.revokedSessionCount} active officer session(s).`,
        details: {
          reason: "Officer disabled.",
          revokedSessionCount: result.revokedSessionCount
        }
      });
    }

    revalidatePath(officerManagementPath);
    successMessage =
      nextStatus === OfficerStatus.DISABLED
        ? `Officer ${result.officer.officerName} disabled.`
        : `Officer ${result.officer.officerName} enabled.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

export async function resetOfficerPasswordAction(formData: FormData) {
  const admin = await requireSuperAdminForMutation();
  let successMessage = "Officer password reset.";

  try {
    const officerId = cleanText(formData.get("officerId"));
    const temporaryPassword = String(formData.get("temporaryPassword") || "");

    if (!officerId) {
      throw new Error("Officer ID is required.");
    }

    if (temporaryPassword.trim().length < minPasswordLength) {
      throw new Error(`Temporary password must be at least ${minPasswordLength} characters.`);
    }

    const existing = await getDb().officer.findUnique({
      where: { id: officerId },
      select: {
        id: true,
        officerName: true,
        role: true,
        status: true
      }
    });

    if (!existing) {
      throw new Error("Officer account not found.");
    }

    const passwordHash = await hashPassword(temporaryPassword);

    const result = await getDb().$transaction(async (tx) => {
      const officer = await tx.officer.update({
        where: { id: officerId },
        data: {
          passwordHash
        },
        select: {
          id: true,
          officerName: true,
          role: true,
          status: true
        }
      });

      const revokedSessions = await tx.officerSession.updateMany({
        where: {
          officerId,
          revokedAt: null,
          expiresAt: {
            gt: new Date()
          }
        },
        data: {
          revokedAt: new Date()
        }
      });

      return {
        officer,
        revokedSessionCount: revokedSessions.count
      };
    });

    await logOfficerAudit({
      officerId: admin.officer.id,
      officerName: admin.officer.officerName,
      officerRole: admin.officer.role,
      module: "Officer Management",
      action: "Officer Password Reset",
      targetType: "Officer",
      targetId: result.officer.id,
      targetName: result.officer.officerName,
      summary: `Reset password for officer ${result.officer.officerName}.`,
      details: {
        targetRole: existing.role,
        targetStatus: existing.status,
        revokedSessionCount: result.revokedSessionCount
      }
    });

    if (result.revokedSessionCount) {
      await logOfficerAudit({
        officerId: admin.officer.id,
        officerName: admin.officer.officerName,
        officerRole: admin.officer.role,
        module: "Officer Management",
        action: "Officer Sessions Revoked",
        targetType: "Officer",
        targetId: result.officer.id,
        targetName: result.officer.officerName,
        summary: `Revoked ${result.revokedSessionCount} active officer session(s).`,
        details: {
          reason: "Officer password reset.",
          revokedSessionCount: result.revokedSessionCount
        }
      });
    }

    revalidatePath(officerManagementPath);
    successMessage = `Password reset for ${result.officer.officerName}.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

async function requireSuperAdminForMutation() {
  const session = await getCurrentOfficerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.officer.role !== OfficerRole.SUPER_ADMIN) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Officer Management",
      action: "Access Denied",
      targetType: "Route",
      targetName: officerManagementPath,
      summary: "Non-super-admin officer attempted an Officer Management mutation."
    });

    redirectWithMessage("error", "Super Admin access is required.");
  }

  return session;
}

async function officerNameExists(normalizedOfficerName: string) {
  // TODO: Add a DB-level normalized unique index after existing duplicate data is cleaned.
  const officers = await getDb().officer.findMany({
    select: {
      officerName: true
    }
  });

  return officers.some(
    (officer) =>
      normalizeOfficerNameForComparison(officer.officerName) === normalizedOfficerName
  );
}

async function ensureActiveSuperAdminRemains(
  existing: {
    id: string;
    role: OfficerRole;
    status: OfficerStatus;
  },
  nextRole: OfficerRole,
  nextStatus: OfficerStatus
) {
  const removesActiveSuperAdmin =
    existing.role === OfficerRole.SUPER_ADMIN &&
    existing.status === OfficerStatus.ACTIVE &&
    (nextRole !== OfficerRole.SUPER_ADMIN || nextStatus !== OfficerStatus.ACTIVE);

  if (!removesActiveSuperAdmin) {
    return;
  }

  const remainingActiveSuperAdmins = await getDb().officer.count({
    where: {
      id: { not: existing.id },
      role: OfficerRole.SUPER_ADMIN,
      status: OfficerStatus.ACTIVE
    }
  });

  if (remainingActiveSuperAdmins < 1) {
    throw new Error("At least one active Super Admin must remain.");
  }
}

function parseOfficerRole(value: FormDataEntryValue | null) {
  if (value === OfficerRole.SUPER_ADMIN || value === OfficerRole.ALLIANCE_OFFICER) {
    return value;
  }

  throw new Error("Invalid officer role.");
}

function parseOfficerStatus(value: FormDataEntryValue | null) {
  if (value === OfficerStatus.ACTIVE || value === OfficerStatus.DISABLED) {
    return value;
  }

  throw new Error("Invalid officer status.");
}

function validatePermissionKeys(permissionKeys: string[]) {
  const validKeys = new Set<string>(officerPermissionKeys);
  const invalidKey = permissionKeys.find((key) => !validKeys.has(key));

  if (invalidKey) {
    throw new Error(`Invalid permission key: ${invalidKey}.`);
  }
}

async function validateCorpIds(corpIds: string[]) {
  if (!corpIds.length) {
    return;
  }

  const count = await getDb().corp.count({
    where: {
      id: {
        in: corpIds
      }
    }
  });

  if (count !== corpIds.length) {
    throw new Error("One or more assigned corps are invalid.");
  }
}

function uniqueStrings(values: FormDataEntryValue[]) {
  return Array.from(
    new Set(values.map((value) => String(value).trim()).filter(Boolean))
  );
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function normalizeOfficerName(value: FormDataEntryValue | null) {
  return cleanText(value).replace(/\s+/g, " ");
}

function normalizeOfficerNameForComparison(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

function getErrorMessage(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return "An officer with that name already exists.";
  }

  return error instanceof Error ? error.message : "Officer Management action failed.";
}

function redirectWithMessage(type: "success" | "error", message: string): never {
  redirect(`${officerManagementPath}?${type}=${encodeURIComponent(message)}`);
}
