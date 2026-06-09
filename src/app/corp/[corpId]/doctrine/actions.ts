"use server";

import { CorpStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  buildEveTypeImageUrl,
  canManageDoctrine,
  doctrineFitStatusOptions,
  doctrineReadinessStatusOptions,
  isDoctrineEnabled,
  normalizeDoctrinePilotName
} from "@/lib/modules/doctrine";
import { getCurrentOfficerSession } from "@/lib/session";

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function submitDoctrineReadinessAction(formData: FormData) {
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Doctrine readiness submitted.";

  try {
    const corp = await getPublicDoctrineCorp(corpSlug);
    const doctrineFitId = cleanText(formData.get("doctrineFitId"));
    const characterName = normalizeDisplayName(formData.get("characterName"));
    const readiness = parseReadinessStatus(formData.get("readiness"));
    const hullReady = parseReadyFlag(formData.get("hullReady"));
    const skillsReady = parseReadyFlag(formData.get("skillsReady"));
    const fitReady = parseReadyFlag(formData.get("fitReady"));
    const notes = cleanText(formData.get("notes"));

    if (!doctrineFitId) {
      throw new Error("Doctrine fit is required.");
    }

    if (!characterName) {
      throw new Error("Pilot or character name is required.");
    }

    const doctrineFit = await getDb().doctrineFit.findFirst({
      where: {
        id: doctrineFitId,
        corpId: corp.id
      },
      select: {
        id: true,
        status: true
      }
    });

    if (!doctrineFit) {
      throw new Error("Doctrine fit unavailable.");
    }

    if (normalizeStatus(doctrineFit.status) !== "ACTIVE") {
      throw new Error("Readiness can only be submitted for active doctrine fits.");
    }

    const normalizedName = normalizeDoctrinePilotName(characterName);
    const existingEntries = await getDb().doctrineFitReadiness.findMany({
      where: {
        doctrineFitId
      },
      select: {
        id: true,
        characterName: true
      }
    });
    const existing = existingEntries.find(
      (entry) => normalizeDoctrinePilotName(entry.characterName) === normalizedName
    );

    if (existing) {
      await getDb().doctrineFitReadiness.update({
        where: { id: existing.id },
        data: {
          pilotName: characterName,
          characterName,
          readiness,
          canFlyHull: hullReady,
          canUseWeapons: skillsReady,
          canUseTank: fitReady,
          canUsePropUtility: fitReady,
          notes
        }
      });
      successMessage = `Doctrine readiness updated for ${characterName}.`;
    } else {
      await getDb().doctrineFitReadiness.create({
        data: {
          corpId: corp.id,
          doctrineFitId,
          pilotName: characterName,
          characterName,
          readiness,
          canFlyHull: hullReady,
          canUseWeapons: skillsReady,
          canUseTank: fitReady,
          canUsePropUtility: fitReady,
          notes
        }
      });
      successMessage = `Doctrine readiness submitted for ${characterName}.`;
    }

    revalidatePath(`/corp/${corp.slug}/doctrine`);
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

export async function createDoctrineFitAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Doctrine fit created.";

  try {
    const corp = await getPublicDoctrineCorp(corpSlug);

    if (!canManageDoctrine(session, corp.id)) {
      throw new Error("Doctrine management permission is required.");
    }

    const data = await parseDoctrineFitForm(formData);

    const doctrineFit = await getDb().doctrineFit.create({
      data: {
        corpId: corp.id,
        doctrineName: data.doctrineName,
        shipHull: data.shipName,
        shipTypeId: data.shipTypeId,
        imageUrl: data.imageUrl,
        fitText: data.fitText,
        status: data.status,
        notes: data.notes,
        addedBy: session?.officer.officerName || ""
      },
      select: doctrineFitAuditSelect
    });

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "Doctrine Readiness",
      action: "Doctrine Fit Created",
      targetType: "DoctrineFit",
      targetId: doctrineFit.id,
      targetName: doctrineFit.doctrineName,
      summary: `Created doctrine fit ${doctrineFit.doctrineName}.`,
      details: {
        after: formatDoctrineFitForAudit(doctrineFit)
      }
    });

    revalidatePath(`/corp/${corp.slug}/doctrine`);
    successMessage = `Doctrine fit ${doctrineFit.doctrineName} created.`;
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

export async function updateDoctrineFitAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Doctrine fit updated.";

  try {
    const corp = await getPublicDoctrineCorp(corpSlug);

    if (!canManageDoctrine(session, corp.id)) {
      throw new Error("Doctrine management permission is required.");
    }

    const doctrineFitId = cleanText(formData.get("doctrineFitId"));

    if (!doctrineFitId) {
      throw new Error("Doctrine fit ID is required.");
    }

    const existing = await getDb().doctrineFit.findFirst({
      where: {
        id: doctrineFitId,
        corpId: corp.id
      },
      select: doctrineFitAuditSelect
    });

    if (!existing) {
      throw new Error("Doctrine fit unavailable.");
    }

    const data = await parseDoctrineFitForm(formData);

    const updated = await getDb().doctrineFit.update({
      where: { id: doctrineFitId },
      data: {
        doctrineName: data.doctrineName,
        shipHull: data.shipName,
        shipTypeId: data.shipTypeId,
        imageUrl: data.imageUrl,
        fitText: data.fitText,
        status: data.status,
        notes: data.notes
      },
      select: doctrineFitAuditSelect
    });

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "Doctrine Readiness",
      action: "Doctrine Fit Updated",
      targetType: "DoctrineFit",
      targetId: updated.id,
      targetName: updated.doctrineName,
      summary: `Updated doctrine fit ${updated.doctrineName}.`,
      details: {
        before: formatDoctrineFitForAudit(existing),
        after: formatDoctrineFitForAudit(updated)
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
        module: "Doctrine Readiness",
        action: "Doctrine Fit Status Changed",
        targetType: "DoctrineFit",
        targetId: updated.id,
        targetName: updated.doctrineName,
        summary: `Changed doctrine fit status from ${existing.status} to ${updated.status}.`,
        details: {
          before: { status: existing.status },
          after: { status: updated.status }
        }
      });
    }

    revalidatePath(`/corp/${corp.slug}/doctrine`);
    successMessage = `Doctrine fit ${updated.doctrineName} updated.`;
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

async function getPublicDoctrineCorp(corpSlug: string) {
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
    throw new Error("This corp is not available for public doctrine access.");
  }

  if (!isDoctrineEnabled(corp.enabledModules)) {
    throw new Error("Doctrine Readiness is not enabled for this corp.");
  }

  return corp;
}

async function parseDoctrineFitForm(formData: FormData) {
  const doctrineName = cleanText(formData.get("doctrineName"));
  const submittedShipName = normalizeDisplayName(formData.get("shipName"));
  const fitText = cleanText(formData.get("fitText"));
  const status = parseFitStatus(formData.get("status"));
  const notes = cleanText(formData.get("notes"));
  const submittedTypeId = parseOptionalTypeId(formData.get("shipTypeId"));

  if (!doctrineName) {
    throw new Error("Doctrine name is required.");
  }

  if (!submittedShipName && !submittedTypeId) {
    throw new Error("Ship name or Ship Type ID is required.");
  }

  const lookup = submittedTypeId
    ? await getDb().eveTypeLookup.findUnique({
        where: {
          typeId: submittedTypeId
        },
        select: doctrineTypeLookupSelect
      })
    : await getDb().eveTypeLookup.findFirst({
        where: {
          typeName: {
            equals: submittedShipName,
            mode: "insensitive"
          }
        },
        select: doctrineTypeLookupSelect
      });

  const shipTypeId = submittedTypeId || lookup?.typeId || null;
  const shipName = lookup?.typeName || submittedShipName;

  if (!shipName) {
    throw new Error("Ship name is required.");
  }

  return {
    doctrineName,
    shipName,
    shipTypeId,
    imageUrl: lookup?.renderUrl || buildEveTypeImageUrl(shipTypeId),
    fitText,
    status,
    notes
  };
}

const doctrineTypeLookupSelect = {
  renderUrl: true,
  typeId: true,
  typeName: true
} as const;

function parseFitStatus(value: FormDataEntryValue | null) {
  const status = normalizeStatus(String(value || ""));

  if (doctrineFitStatusOptions.includes(status as (typeof doctrineFitStatusOptions)[number])) {
    return status;
  }

  throw new Error("Invalid doctrine fit status.");
}

function parseReadinessStatus(value: FormDataEntryValue | null) {
  const status = normalizeStatus(String(value || ""));

  if (
    doctrineReadinessStatusOptions.includes(
      status as (typeof doctrineReadinessStatusOptions)[number]
    )
  ) {
    return status;
  }

  throw new Error("Invalid readiness status.");
}

function parseReadyFlag(value: FormDataEntryValue | null) {
  return value === "READY" ? "READY" : "NOT_READY";
}

function parseOptionalTypeId(value: FormDataEntryValue | null) {
  const raw = cleanText(value);

  if (!raw) {
    return null;
  }

  const numberValue = Number(raw);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error("Ship Type ID must be a positive whole number.");
  }

  return numberValue;
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

const doctrineFitAuditSelect = {
  id: true,
  doctrineName: true,
  shipHull: true,
  shipTypeId: true,
  imageUrl: true,
  fitText: true,
  addedBy: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true
} as const;

type DoctrineFitAuditRecord = {
  id: string;
  doctrineName: string;
  shipHull: string;
  shipTypeId: number | null;
  imageUrl: string;
  fitText: string;
  addedBy: string;
  status: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

function formatDoctrineFitForAudit(fit: DoctrineFitAuditRecord) {
  return {
    id: fit.id,
    doctrineName: fit.doctrineName,
    shipName: fit.shipHull,
    shipTypeId: fit.shipTypeId,
    imageUrl: fit.imageUrl,
    fitText: fit.fitText,
    createdBy: fit.addedBy,
    status: fit.status,
    notes: fit.notes,
    createdAt: fit.createdAt.toISOString(),
    updatedAt: fit.updatedAt.toISOString()
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Doctrine action failed.";
}

function redirectWithMessage(
  corpSlug: string,
  type: "success" | "error",
  message: string
): never {
  const slug = corpSlug || "unknown";
  redirect(`/corp/${slug}/doctrine?${type}=${encodeURIComponent(message)}`);
}
