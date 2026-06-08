"use server";

import { OfficerRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { getCurrentOfficerSession } from "@/lib/session";

const eveIdentitiesPath = "/admin/eve-identities";
const officersPath = "/admin/officers";

export async function linkEveIdentityAction(formData: FormData) {
  const admin = await requireSuperAdminForEveIdentityMutation();
  let successMessage = "EVE identity linked.";

  try {
    const eveIdentityId = cleanText(formData.get("eveIdentityId"));
    const officerId = cleanText(formData.get("officerId"));

    if (!eveIdentityId) {
      throw new Error("EVE identity ID is required.");
    }

    if (!officerId) {
      throw new Error("Officer is required.");
    }

    const result = await getDb().$transaction(async (tx) => {
      const [identity, officer, existingOfficerIdentity] = await Promise.all([
        tx.eveIdentity.findUnique({
          where: { id: eveIdentityId },
          select: {
            id: true,
            characterId: true,
            characterName: true,
            officerId: true,
            officer: {
              select: {
                id: true,
                officerName: true
              }
            }
          }
        }),
        tx.officer.findUnique({
          where: { id: officerId },
          select: {
            id: true,
            officerName: true,
            role: true,
            status: true
          }
        }),
        tx.eveIdentity.findFirst({
          where: {
            officerId,
            id: {
              not: eveIdentityId
            }
          },
          select: {
            id: true,
            characterId: true,
            characterName: true
          }
        })
      ]);

      if (!identity) {
        throw new Error("EVE identity not found.");
      }

      if (!officer) {
        throw new Error("Officer account not found.");
      }

      if (existingOfficerIdentity) {
        throw new Error(
          `Officer ${officer.officerName} is already linked to ${existingOfficerIdentity.characterName}. Unlink that identity first.`
        );
      }

      const updated = await tx.eveIdentity.update({
        where: { id: identity.id },
        data: {
          officerId: officer.id,
          linkedAt: new Date()
        },
        select: {
          id: true,
          characterId: true,
          characterName: true,
          linkedAt: true,
          officer: {
            select: {
              id: true,
              officerName: true,
              role: true,
              status: true
            }
          }
        }
      });

      return {
        before: {
          officerId: identity.officerId,
          officerName: identity.officer?.officerName ?? null
        },
        identity: {
          id: updated.id,
          characterId: updated.characterId.toString(),
          characterName: updated.characterName
        },
        officer: updated.officer,
        linkedAt: updated.linkedAt?.toISOString() ?? null
      };
    });

    await logOfficerAudit({
      officerId: admin.officer.id,
      officerName: admin.officer.officerName,
      officerRole: admin.officer.role,
      module: "EVE SSO",
      action: "EVE Identity Linked",
      targetType: "EveIdentity",
      targetId: result.identity.id,
      targetName: result.identity.characterName,
      summary: `Linked EVE character ${result.identity.characterName} to officer ${result.officer?.officerName}.`,
      details: {
        actor: {
          officerId: admin.officer.id,
          officerName: admin.officer.officerName
        },
        eveIdentity: result.identity,
        before: {
          officerId: result.before.officerId,
          officerName: result.before.officerName
        },
        after: {
          officerId: result.officer?.id ?? null,
          officerName: result.officer?.officerName ?? null,
          officerRole: result.officer?.role ?? null,
          officerStatus: result.officer?.status ?? null,
          linkedAt: result.linkedAt
        }
      }
    });

    revalidatePath(eveIdentitiesPath);
    revalidatePath(officersPath);
    successMessage = `Linked ${result.identity.characterName} to ${result.officer?.officerName}.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

export async function unlinkEveIdentityAction(formData: FormData) {
  const admin = await requireSuperAdminForEveIdentityMutation();
  let successMessage = "EVE identity unlinked.";

  try {
    const eveIdentityId = cleanText(formData.get("eveIdentityId"));

    if (!eveIdentityId) {
      throw new Error("EVE identity ID is required.");
    }

    const result = await getDb().$transaction(async (tx) => {
      const identity = await tx.eveIdentity.findUnique({
        where: { id: eveIdentityId },
        select: {
          id: true,
          characterId: true,
          characterName: true,
          officerId: true,
          linkedAt: true,
          officer: {
            select: {
              id: true,
              officerName: true,
              role: true,
              status: true
            }
          }
        }
      });

      if (!identity) {
        throw new Error("EVE identity not found.");
      }

      const updated = await tx.eveIdentity.update({
        where: { id: identity.id },
        data: {
          officerId: null,
          linkedAt: null
        },
        select: {
          id: true,
          characterId: true,
          characterName: true,
          officerId: true,
          linkedAt: true
        }
      });

      return {
        before: {
          officerId: identity.officerId,
          officerName: identity.officer?.officerName ?? null,
          officerRole: identity.officer?.role ?? null,
          officerStatus: identity.officer?.status ?? null,
          linkedAt: identity.linkedAt?.toISOString() ?? null
        },
        after: {
          officerId: updated.officerId,
          linkedAt: updated.linkedAt
        },
        identity: {
          id: updated.id,
          characterId: updated.characterId.toString(),
          characterName: updated.characterName
        }
      };
    });

    await logOfficerAudit({
      officerId: admin.officer.id,
      officerName: admin.officer.officerName,
      officerRole: admin.officer.role,
      module: "EVE SSO",
      action: "EVE Identity Unlinked",
      targetType: "EveIdentity",
      targetId: result.identity.id,
      targetName: result.identity.characterName,
      summary: `Unlinked EVE character ${result.identity.characterName} from officer ${result.before.officerName || "none"}.`,
      details: {
        actor: {
          officerId: admin.officer.id,
          officerName: admin.officer.officerName
        },
        eveIdentity: result.identity,
        before: result.before,
        after: result.after
      }
    });

    revalidatePath(eveIdentitiesPath);
    revalidatePath(officersPath);
    successMessage = `Unlinked ${result.identity.characterName}.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

async function requireSuperAdminForEveIdentityMutation() {
  const session = await getCurrentOfficerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.officer.role !== OfficerRole.SUPER_ADMIN) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "EVE SSO",
      action: "Access Denied",
      targetType: "Route",
      targetName: eveIdentitiesPath,
      summary: "Non-super-admin officer attempted an EVE identity link mutation."
    });

    redirectWithMessage("error", "Super Admin access is required.");
  }

  return session;
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "EVE identity action failed.";
}

function redirectWithMessage(type: "success" | "error", message: string): never {
  redirect(`${eveIdentitiesPath}?${type}=${encodeURIComponent(message)}`);
}
