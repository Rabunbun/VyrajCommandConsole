"use server";

import { CorpStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import {
  asEnabledModules,
  asStringArray,
  corpModuleOptions,
  getDefaultEnabledModules,
  type AdminEnabledModules
} from "@/lib/admin/corps";
import { getDb } from "@/lib/db";
import { getCurrentOfficerSession } from "@/lib/session";

const corpManagementPath = "/admin/corps";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const moduleKeys = corpModuleOptions.map((module) => module.key);
const maxPostgresBigInt = BigInt("9223372036854775807");

export async function createCorpAction(formData: FormData) {
  const admin = await requireSuperAdminForCorpMutation();
  let successMessage = "Corp created.";

  try {
    const data = parseCorpForm(formData, { includeSlug: true });

    if (!data.slug) {
      throw new Error("Corp slug is required.");
    }

    await ensureUniqueSlug(data.slug);

    const created = await getDb().corp.create({
      data: {
        slug: data.slug,
        name: data.name,
        ticker: data.ticker,
        description: data.description,
        status: data.status,
        recruitmentStatus: data.recruitmentStatus,
        activeMembers: data.activeMembers,
        recentOps: data.recentOps,
        pendingSrp: data.pendingSrp,
        doctrineReadinessPercent: data.doctrineReadinessPercent,
        announcements: data.announcements,
        enabledModules: data.enabledModules,
        eveIdentityConfig: {
          create: data.eveIdentityConfig
        }
      },
      select: {
        id: true,
        slug: true,
        name: true,
        ticker: true,
        status: true,
        announcements: true,
        enabledModules: true,
        eveIdentityConfig: {
          select: {
            eveCorporationId: true,
            eveCorporationName: true,
            eveAllianceId: true,
            eveAllianceName: true,
            syncEnabled: true
          }
        }
      }
    });

    await logOfficerAudit({
      officerId: admin.officer.id,
      officerName: admin.officer.officerName,
      officerRole: admin.officer.role,
      corpId: created.id,
      corpSlug: created.slug,
      corpName: created.name,
      module: "Corp Management",
      action: "Corp Created",
      targetType: "Corp",
      targetId: created.id,
      targetName: created.name,
      summary: `Created corp ${created.name} [${created.ticker}].`,
      details: {
        after: {
          slug: created.slug,
          status: created.status,
          announcements: asStringArray(created.announcements),
          enabledModules: asEnabledModules(created.enabledModules)
        }
      }
    });

    if (hasMeaningfulEveConfig(data.eveIdentityConfig)) {
      await logOfficerAudit({
        officerId: admin.officer.id,
        officerName: admin.officer.officerName,
        officerRole: admin.officer.role,
        corpId: created.id,
        corpSlug: created.slug,
        corpName: created.name,
        module: "Corp Management",
        action: "Corp EVE Config Updated",
        targetType: "Corp",
        targetId: created.id,
        targetName: created.name,
        summary: `Configured EVE identity fields for ${created.name}.`,
        details: {
          before: null,
          after: serializeEveConfig(created.eveIdentityConfig)
        }
      });
    }

    revalidateCorpPaths(created.slug);
    successMessage = `Corp ${created.name} created.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

export async function updateCorpAction(formData: FormData) {
  const admin = await requireSuperAdminForCorpMutation();
  let successMessage = "Corp updated.";

  try {
    const corpId = cleanText(formData.get("corpId"));

    if (!corpId) {
      throw new Error("Corp ID is required.");
    }

    const existing = await getDb().corp.findUnique({
      where: { id: corpId },
      select: {
        id: true,
        slug: true,
        name: true,
        ticker: true,
        description: true,
        status: true,
        recruitmentStatus: true,
        activeMembers: true,
        recentOps: true,
        pendingSrp: true,
        doctrineReadinessPercent: true,
        announcements: true,
        enabledModules: true,
        eveIdentityConfig: {
          select: {
            eveCorporationId: true,
            eveCorporationName: true,
            eveAllianceId: true,
            eveAllianceName: true,
            syncEnabled: true,
            lastVerifiedAt: true
          }
        }
      }
    });

    if (!existing) {
      throw new Error("Corp record not found.");
    }

    const data = parseCorpForm(formData, { includeSlug: false });
    const beforeAnnouncements = asStringArray(existing.announcements);
    const beforeEnabledModules = asEnabledModules(existing.enabledModules);

    const updated = await getDb().corp.update({
      where: { id: corpId },
      data: {
        name: data.name,
        ticker: data.ticker,
        description: data.description,
        status: data.status,
        recruitmentStatus: data.recruitmentStatus,
        activeMembers: data.activeMembers,
        recentOps: data.recentOps,
        pendingSrp: data.pendingSrp,
        doctrineReadinessPercent: data.doctrineReadinessPercent,
        announcements: data.announcements,
        enabledModules: data.enabledModules,
        eveIdentityConfig: {
          upsert: {
            create: data.eveIdentityConfig,
            update: data.eveIdentityConfig
          }
        }
      },
      select: {
        id: true,
        slug: true,
        name: true,
        ticker: true,
        description: true,
        status: true,
        recruitmentStatus: true,
        activeMembers: true,
        recentOps: true,
        pendingSrp: true,
        doctrineReadinessPercent: true,
        announcements: true,
        enabledModules: true,
        eveIdentityConfig: {
          select: {
            eveCorporationId: true,
            eveCorporationName: true,
            eveAllianceId: true,
            eveAllianceName: true,
            syncEnabled: true,
            lastVerifiedAt: true
          }
        }
      }
    });

    const afterAnnouncements = asStringArray(updated.announcements);
    const afterEnabledModules = asEnabledModules(updated.enabledModules);
    const beforeEveConfig = serializeEveConfig(existing.eveIdentityConfig);
    const afterEveConfig = serializeEveConfig(updated.eveIdentityConfig);

    await logOfficerAudit({
      officerId: admin.officer.id,
      officerName: admin.officer.officerName,
      officerRole: admin.officer.role,
      corpId: updated.id,
      corpSlug: updated.slug,
      corpName: updated.name,
      module: "Corp Management",
      action: "Corp Updated",
      targetType: "Corp",
      targetId: updated.id,
      targetName: updated.name,
      summary: `Updated corp ${updated.name} [${updated.ticker}].`,
      details: {
        before: {
          name: existing.name,
          ticker: existing.ticker,
          description: existing.description,
          status: existing.status,
          recruitmentStatus: existing.recruitmentStatus,
          activeMembers: existing.activeMembers,
          recentOps: existing.recentOps,
          pendingSrp: existing.pendingSrp,
          doctrineReadinessPercent: existing.doctrineReadinessPercent,
          announcements: beforeAnnouncements,
          enabledModules: beforeEnabledModules
        },
        after: {
          name: updated.name,
          ticker: updated.ticker,
          description: updated.description,
          status: updated.status,
          recruitmentStatus: updated.recruitmentStatus,
          activeMembers: updated.activeMembers,
          recentOps: updated.recentOps,
          pendingSrp: updated.pendingSrp,
          doctrineReadinessPercent: updated.doctrineReadinessPercent,
          announcements: afterAnnouncements,
          enabledModules: afterEnabledModules
        }
      }
    });

    if (existing.status !== updated.status) {
      await logOfficerAudit({
        officerId: admin.officer.id,
        officerName: admin.officer.officerName,
        officerRole: admin.officer.role,
        corpId: updated.id,
        corpSlug: updated.slug,
        corpName: updated.name,
        module: "Corp Management",
        action: "Corp Status Changed",
        targetType: "Corp",
        targetId: updated.id,
        targetName: updated.name,
        summary: `Changed corp status from ${existing.status} to ${updated.status}.`,
        details: {
          before: { status: existing.status },
          after: { status: updated.status }
        }
      });
    }

    if (!arraysMatch(beforeAnnouncements, afterAnnouncements)) {
      await logOfficerAudit({
        officerId: admin.officer.id,
        officerName: admin.officer.officerName,
        officerRole: admin.officer.role,
        corpId: updated.id,
        corpSlug: updated.slug,
        corpName: updated.name,
        module: "Corp Management",
        action: "Corp Announcements Updated",
        targetType: "Corp",
        targetId: updated.id,
        targetName: updated.name,
        summary: `Updated announcements for ${updated.name}.`,
        details: {
          before: beforeAnnouncements,
          after: afterAnnouncements
        }
      });
    }

    if (!modulesMatch(beforeEnabledModules, afterEnabledModules)) {
      await logOfficerAudit({
        officerId: admin.officer.id,
        officerName: admin.officer.officerName,
        officerRole: admin.officer.role,
        corpId: updated.id,
        corpSlug: updated.slug,
        corpName: updated.name,
        module: "Corp Management",
        action: "Corp Enabled Modules Updated",
        targetType: "Corp",
        targetId: updated.id,
        targetName: updated.name,
        summary: `Updated enabled modules for ${updated.name}.`,
        details: {
          before: beforeEnabledModules,
          after: afterEnabledModules
        }
      });
    }

    if (!eveConfigsMatch(beforeEveConfig, afterEveConfig)) {
      await logOfficerAudit({
        officerId: admin.officer.id,
        officerName: admin.officer.officerName,
        officerRole: admin.officer.role,
        corpId: updated.id,
        corpSlug: updated.slug,
        corpName: updated.name,
        module: "Corp Management",
        action: "Corp EVE Config Updated",
        targetType: "Corp",
        targetId: updated.id,
        targetName: updated.name,
        summary: `Updated EVE identity config for ${updated.name}.`,
        details: {
          before: beforeEveConfig,
          after: afterEveConfig
        }
      });
    }

    revalidateCorpPaths(updated.slug);
    successMessage = `Corp ${updated.name} updated.`;
  } catch (error) {
    redirectWithMessage("error", getErrorMessage(error));
  }

  redirectWithMessage("success", successMessage);
}

async function requireSuperAdminForCorpMutation() {
  const session = await getCurrentOfficerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.officer.role !== "SUPER_ADMIN") {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Corp Management",
      action: "Access Denied",
      targetType: "Route",
      targetName: corpManagementPath,
      summary: "Non-super-admin officer attempted a Corp Management mutation."
    });

    redirectWithMessage("error", "Super Admin access is required.");
  }

  return session;
}

function parseCorpForm(
  formData: FormData,
  options: {
    includeSlug: boolean;
  }
) {
  const name = cleanText(formData.get("name"));
  const ticker = cleanText(formData.get("ticker")).toUpperCase();
  const slug = options.includeSlug ? normalizeSlug(formData.get("slug")) : "";
  const description = cleanText(formData.get("description"));
  const status = parseCorpStatus(formData.get("status"));
  const recruitmentStatus = cleanText(formData.get("recruitmentStatus")) || "Unknown";
  const eveIdentityConfig = parseEveIdentityConfig(formData);

  if (!name) {
    throw new Error("Corp name is required.");
  }

  if (!ticker) {
    throw new Error("Corp ticker is required.");
  }

  if (options.includeSlug && !slug) {
    throw new Error("Corp slug is required.");
  }

  return {
    name,
    ticker,
    slug,
    description,
    status,
    recruitmentStatus,
    activeMembers: parseNonNegativeInt(formData.get("activeMembers"), "Active members"),
    recentOps: parseNonNegativeInt(formData.get("recentOps"), "Recent ops"),
    pendingSrp: parseNonNegativeInt(formData.get("pendingSrp"), "Pending SRP"),
    doctrineReadinessPercent: parsePercent(
      formData.get("doctrineReadinessPercent")
    ),
    announcements: parseAnnouncements(formData.get("announcements")),
    enabledModules: parseEnabledModules(formData.getAll("enabledModules")),
    eveIdentityConfig
  };
}

function normalizeSlug(value: FormDataEntryValue | null) {
  const slug = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (slug && !slugPattern.test(slug)) {
    throw new Error("Corp slug must be lowercase, hyphenated, and URL-safe.");
  }

  return slug;
}

async function ensureUniqueSlug(slug: string) {
  const duplicate = await getDb().corp.findUnique({
    where: { slug },
    select: { id: true }
  });

  if (duplicate) {
    throw new Error("A corp with that slug already exists.");
  }
}

function parseCorpStatus(value: FormDataEntryValue | null) {
  if (
    value === CorpStatus.ACTIVE ||
    value === CorpStatus.TRIAL ||
    value === CorpStatus.INACTIVE ||
    value === CorpStatus.ARCHIVED
  ) {
    return value;
  }

  throw new Error("Invalid corp status.");
}

function parseAnnouncements(value: FormDataEntryValue | null) {
  return cleanText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEnabledModules(values: FormDataEntryValue[]): AdminEnabledModules {
  const selected = new Set(values.map((value) => String(value)));
  const modules = getDefaultEnabledModules();

  for (const key of moduleKeys) {
    modules[key] = selected.has(key);
  }

  return modules;
}

function parseNonNegativeInt(value: FormDataEntryValue | null, label: string) {
  const raw = cleanText(value);

  if (!raw) {
    return 0;
  }

  const numberValue = Number(raw);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }

  return numberValue;
}

function parsePercent(value: FormDataEntryValue | null) {
  const percent = parseNonNegativeInt(value, "Doctrine readiness percent");

  if (percent > 100) {
    throw new Error("Doctrine readiness percent must be between 0 and 100.");
  }

  return percent;
}

function parseEveIdentityConfig(formData: FormData) {
  return {
    eveCorporationId: parseOptionalBigIntId(
      formData.get("eveCorporationId"),
      "EVE corporation ID"
    ),
    eveCorporationName: cleanText(formData.get("eveCorporationName")),
    eveAllianceId: parseOptionalBigIntId(
      formData.get("eveAllianceId"),
      "EVE alliance ID"
    ),
    eveAllianceName: cleanText(formData.get("eveAllianceName")),
    syncEnabled: formData.get("eveSyncEnabled") === "on"
  };
}

function parseOptionalBigIntId(value: FormDataEntryValue | null, label: string) {
  const raw = cleanText(value);

  if (!raw) {
    return null;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be numeric.`);
  }

  const id = BigInt(raw);

  if (id > maxPostgresBigInt) {
    throw new Error(`${label} is too large.`);
  }

  return id;
}

function arraysMatch(first: string[], second: string[]) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function modulesMatch(first: AdminEnabledModules, second: AdminEnabledModules) {
  return moduleKeys.every((key) => first[key] === second[key]);
}

function serializeEveConfig(
  config: {
    eveCorporationId: bigint | null;
    eveCorporationName: string;
    eveAllianceId: bigint | null;
    eveAllianceName: string;
    syncEnabled: boolean;
    lastVerifiedAt?: Date | null;
  } | null
) {
  if (!config) {
    return {
      eveCorporationId: null,
      eveCorporationName: "",
      eveAllianceId: null,
      eveAllianceName: "",
      syncEnabled: false,
      lastVerifiedAt: null
    };
  }

  return {
    eveCorporationId: config.eveCorporationId?.toString() ?? null,
    eveCorporationName: config.eveCorporationName,
    eveAllianceId: config.eveAllianceId?.toString() ?? null,
    eveAllianceName: config.eveAllianceName,
    syncEnabled: config.syncEnabled,
    lastVerifiedAt: config.lastVerifiedAt?.toISOString() ?? null
  };
}

function hasMeaningfulEveConfig(config: {
  eveCorporationId: bigint | null;
  eveCorporationName: string;
  eveAllianceId: bigint | null;
  eveAllianceName: string;
  syncEnabled: boolean;
}) {
  return Boolean(
    config.eveCorporationId ||
      config.eveCorporationName ||
      config.eveAllianceId ||
      config.eveAllianceName ||
      config.syncEnabled
  );
}

function eveConfigsMatch(
  first: ReturnType<typeof serializeEveConfig>,
  second: ReturnType<typeof serializeEveConfig>
) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function revalidateCorpPaths(slug: string) {
  revalidatePath(corpManagementPath);
  revalidatePath("/");
  revalidatePath(`/corp/${slug}`);
  revalidatePath("/admin/system-health");
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function getErrorMessage(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(", ")
      : String(error.meta?.target || "");

    if (target.includes("eveCorporationId")) {
      return "That EVE corporation ID is already assigned to another corp.";
    }

    return "A corp with that slug already exists.";
  }

  return error instanceof Error ? error.message : "Corp Management action failed.";
}

function redirectWithMessage(type: "success" | "error", message: string): never {
  redirect(`${corpManagementPath}?${type}=${encodeURIComponent(message)}`);
}
