import "server-only";
import { CorpStatus, OfficerRole } from "@prisma/client";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import type { CurrentOfficerSession } from "@/lib/session";

export const doctrineFitStatusOptions = [
  "ACTIVE",
  "DRAFT",
  "RETIRED",
  "ARCHIVED"
] as const;

export const doctrineReadinessStatusOptions = [
  "READY",
  "NEEDS_SKILLS",
  "NEEDS_HULL",
  "NEEDS_FIT",
  "NOT_READY"
] as const;

export type DoctrineFitStatus = (typeof doctrineFitStatusOptions)[number];
export type DoctrineReadinessStatus =
  (typeof doctrineReadinessStatusOptions)[number];

export type DoctrineCorpView = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  status: CorpStatus;
};

export type DoctrineReadinessEntryView = {
  id: string;
  pilotName: string;
  characterName: string;
  readiness: string;
  hullReady: string;
  skillsReady: string;
  fitReady: string;
  notes: string;
  updatedAt: string;
};

export type DoctrineFitView = {
  id: string;
  doctrineName: string;
  shipName: string;
  shipTypeId: number | null;
  imageUrl: string;
  fitText: string;
  status: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  readiness: DoctrineReadinessEntryView[];
  readinessSummary: Record<string, number>;
};

export type DoctrinePageData =
  | {
      status: "ready";
      corp: DoctrineCorpView;
      fits: DoctrineFitView[];
      canManageDoctrine: boolean;
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
      corp: DoctrineCorpView;
      message: string;
    };

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function getDoctrinePageData(
  corpSlug: string,
  session: CurrentOfficerSession | null
): Promise<DoctrinePageData> {
  const corp = await getDb().corp.findUnique({
    where: { slug: corpSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      ticker: true,
      status: true,
      enabledModules: true,
      doctrineFits: {
        orderBy: [{ status: "asc" }, { doctrineName: "asc" }],
        select: {
          id: true,
          doctrineName: true,
          shipHull: true,
          shipTypeId: true,
          imageUrl: true,
          manualImageUrl: true,
          fitText: true,
          addedBy: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          readiness: {
            orderBy: [{ updatedAt: "desc" }],
            select: {
              id: true,
              pilotName: true,
              characterName: true,
              readiness: true,
              canFlyHull: true,
              canUseWeapons: true,
              canUseTank: true,
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
      message: "This corp is not available for public doctrine access."
    };
  }

  if (!isDoctrineEnabled(corp.enabledModules)) {
    return {
      status: "module_disabled",
      corp: publicCorp,
      message: "Doctrine Readiness is not enabled for this corp."
    };
  }

  const canManage = canManageDoctrine(session, corp.id);
  const fits = corp.doctrineFits
    .filter((fit) => canManage || normalizeOptionValue(fit.status, "ACTIVE") === "ACTIVE")
    .map((fit) => {
      const readiness = fit.readiness.map((entry) => ({
        id: entry.id,
        pilotName: entry.pilotName,
        characterName: entry.characterName,
        readiness: normalizeOptionValue(entry.readiness, "NOT_READY"),
        hullReady: normalizeReadyFlag(entry.canFlyHull),
        skillsReady: normalizeReadyFlag(entry.canUseWeapons),
        fitReady: normalizeReadyFlag(entry.canUseTank),
        notes: entry.notes,
        updatedAt: entry.updatedAt.toISOString()
      }));

      const imageUrl =
        fit.manualImageUrl ||
        fit.imageUrl ||
        buildEveTypeImageUrl(fit.shipTypeId);

      return {
        id: fit.id,
        doctrineName: fit.doctrineName,
        shipName: fit.shipHull,
        shipTypeId: fit.shipTypeId,
        imageUrl,
        fitText: fit.fitText,
        status: normalizeOptionValue(fit.status, "ACTIVE"),
        notes: fit.notes,
        createdBy: fit.addedBy,
        createdAt: fit.createdAt.toISOString(),
        updatedAt: fit.updatedAt.toISOString(),
        readiness,
        readinessSummary: summarizeReadiness(readiness)
      };
    });

  const accessMode = session?.officer.role === OfficerRole.SUPER_ADMIN
    ? "Super Admin View"
    : canManage
      ? "Officer View"
      : "Member View";

  return {
    status: "ready",
    corp: publicCorp,
    fits,
    canManageDoctrine: canManage,
    accessMode
  };
}

export function canManageDoctrine(
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

  return assignedToCorp && hasPermission(session, "doctrineManage", corpId);
}

export function isDoctrineEnabled(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).doctrine === true;
}

export function normalizeDoctrinePilotName(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}

export function buildEveTypeImageUrl(typeId: number | null | undefined) {
  return typeId
    ? `https://images.evetech.net/types/${typeId}/render?size=128`
    : "";
}

function normalizeOptionValue(value: string, fallback: string) {
  const normalized = value.trim().replace(/\s+/g, "_").toUpperCase();

  return normalized || fallback;
}

function normalizeReadyFlag(value: string) {
  const normalized = normalizeOptionValue(value, "UNKNOWN");

  if (normalized === "TRUE" || normalized === "YES" || normalized === "READY") {
    return "READY";
  }

  if (normalized === "FALSE" || normalized === "NO" || normalized === "NOT_READY") {
    return "NOT_READY";
  }

  return normalized;
}

function summarizeReadiness(readiness: DoctrineReadinessEntryView[]) {
  const summary: Record<string, number> = {};

  for (const entry of readiness) {
    summary[entry.readiness] = (summary[entry.readiness] || 0) + 1;
  }

  return summary;
}
