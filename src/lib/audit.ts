import "server-only";
import type { OfficerRole, Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";

type AuditInput = {
  officerId?: string | null;
  officerName?: string;
  officerRole?: OfficerRole | string;
  corpId?: string | null;
  corpSlug?: string;
  corpName?: string;
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  summary?: string;
  details?: Prisma.InputJsonValue;
};

export async function logOfficerAudit(input: AuditInput) {
  try {
    await getDb().officerAuditLog.create({
      data: {
        officerId: input.officerId || null,
        officerName: input.officerName || "",
        officerRole: input.officerRole ? String(input.officerRole) : "",
        corpId: input.corpId || null,
        corpSlug: input.corpSlug || "",
        corpName: input.corpName || "",
        module: input.module,
        action: input.action,
        targetType: input.targetType || "",
        targetId: input.targetId || "",
        targetName: input.targetName || "",
        summary: input.summary || "",
        details: input.details ?? {}
      }
    });
  } catch (error) {
    console.error("Officer audit log write failed.", error);
  }
}
