"use server";

import { CorpStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  canManageLootSplits,
  isLootSplitsEnabled,
  lootSplitStatusOptions,
  normalizeLootSplitStatus
} from "@/lib/modules/loot-splits";
import { getCurrentOfficerSession } from "@/lib/session";

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

type ParsedParticipant = {
  pilotName: string;
  shares: Prisma.Decimal;
  notes: string;
  payoutAmount: Prisma.Decimal;
};

export async function createLootSplitAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Loot split saved.";

  try {
    const corp = await getLootSplitCorpForMutation(corpSlug);

    if (!canManageLootSplits(session, corp.id)) {
      throw new Error("Loot Split Calculation permission is required.");
    }

    const parsed = parseLootSplitForm(formData);

    const created = await getDb().$transaction(async (tx) => {
      const lootSplit = await tx.lootSplit.create({
        data: {
          corpId: corp.id,
          operationName: parsed.title,
          operationType: parsed.sourceType,
          totalIskValue: parsed.totalValue,
          corpCutPercent: new Prisma.Decimal(0),
          corpCutAmount: parsed.corpCutAmount,
          srpReservePercent: new Prisma.Decimal(0),
          srpReserveAmount: parsed.srpReserveAmount,
          payoutPool: parsed.payoutPool,
          totalShares: parsed.totalShares,
          createdBy: session?.officer.officerName || "",
          status: parsed.status,
          notes: parsed.notes
        },
        select: lootSplitAuditSelect
      });

      await tx.lootSplitParticipant.createMany({
        data: parsed.participants.map((participant) => ({
          lootSplitId: lootSplit.id,
          pilotName: participant.pilotName,
          characterName: participant.pilotName,
          shares: participant.shares,
          payoutAmount: participant.payoutAmount,
          notes: participant.notes
        }))
      });

      return lootSplit;
    });

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "Loot Split Calculation",
      action: "Loot Split Created",
      targetType: "LootSplit",
      targetId: created.id,
      targetName: created.operationName,
      summary: `Created loot split ${created.operationName}.`,
      details: {
        after: {
          ...formatLootSplitForAudit(created),
          participantCount: parsed.participants.length,
          participants: parsed.participants.map((participant) => ({
            pilotName: participant.pilotName,
            shares: participant.shares.toString(),
            payoutAmount: participant.payoutAmount.toString(),
            notes: participant.notes
          }))
        }
      }
    });

    revalidatePath(`/corp/${corp.slug}/loot-splits`);
    successMessage = `Loot split ${created.operationName} saved.`;
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

export async function updateLootSplitStatusAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Loot split updated.";

  try {
    const corp = await getLootSplitCorpForMutation(corpSlug);

    if (!canManageLootSplits(session, corp.id)) {
      throw new Error("Loot Split Calculation permission is required.");
    }

    const lootSplitId = cleanText(formData.get("lootSplitId"));
    const status = parseLootSplitStatus(formData.get("status"));
    const notes = cleanText(formData.get("notes"));

    if (!lootSplitId) {
      throw new Error("Loot split ID is required.");
    }

    const existing = await getDb().lootSplit.findFirst({
      where: {
        id: lootSplitId,
        corpId: corp.id
      },
      select: lootSplitAuditSelect
    });

    if (!existing) {
      throw new Error("Loot split unavailable.");
    }

    const updated = await getDb().lootSplit.update({
      where: { id: lootSplitId },
      data: {
        status,
        notes
      },
      select: lootSplitAuditSelect
    });

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "Loot Split Calculation",
      action: "Loot Split Updated",
      targetType: "LootSplit",
      targetId: updated.id,
      targetName: updated.operationName,
      summary: `Updated loot split ${updated.operationName}.`,
      details: {
        before: formatLootSplitForAudit(existing),
        after: formatLootSplitForAudit(updated)
      }
    });

    const beforeStatus = normalizeLootSplitStatus(existing.status);
    const afterStatus = normalizeLootSplitStatus(updated.status);
    const action = getLootSplitStatusAuditAction(beforeStatus, afterStatus);

    if (action) {
      await logOfficerAudit({
        officerId: session?.officer.id,
        officerName: session?.officer.officerName,
        officerRole: session?.officer.role,
        corpId: corp.id,
        corpSlug: corp.slug,
        corpName: corp.name,
        module: "Loot Split Calculation",
        action,
        targetType: "LootSplit",
        targetId: updated.id,
        targetName: updated.operationName,
        summary: `${action} for ${updated.operationName}.`,
        details: {
          before: {
            status: beforeStatus
          },
          after: {
            status: afterStatus,
            payoutPool: updated.payoutPool.toString()
          }
        }
      });
    }

    revalidatePath(`/corp/${corp.slug}/loot-splits`);
    successMessage = `Loot split ${updated.operationName} updated.`;
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

async function getLootSplitCorpForMutation(corpSlug: string) {
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
    throw new Error("This corp is not available for loot split access.");
  }

  if (!isLootSplitsEnabled(corp.enabledModules)) {
    throw new Error("Loot Split Calculation is not enabled for this corp.");
  }

  return corp;
}

function parseLootSplitForm(formData: FormData) {
  const title = cleanText(formData.get("title"));
  const sourceType = cleanText(formData.get("sourceType"));
  const totalValue = parseIskDecimal(formData.get("totalValue"), "Total loot value");
  const corpCutAmount = parseIskDecimal(formData.get("corpCutAmount"), "Corp cut");
  const srpReserveAmount = parseIskDecimal(
    formData.get("srpReserveAmount"),
    "SRP reserve"
  );
  const status = parseLootSplitStatus(formData.get("status"));
  const notes = cleanText(formData.get("notes"));

  if (!title) {
    throw new Error("Loot split title is required.");
  }

  const payoutPool = totalValue.minus(corpCutAmount).minus(srpReserveAmount);

  if (payoutPool.lessThan(0)) {
    throw new Error("Payout pool cannot be negative.");
  }

  const participants = parseParticipants(formData);
  const totalShares = participants.reduce(
    (sum, participant) => sum.plus(participant.shares),
    new Prisma.Decimal(0)
  );

  if (totalShares.lessThanOrEqualTo(0)) {
    throw new Error("Total participant shares must be greater than zero.");
  }

  const participantPayouts = calculateParticipantPayouts(
    participants,
    payoutPool,
    totalShares
  );

  return {
    title,
    sourceType,
    totalValue,
    corpCutAmount,
    srpReserveAmount,
    payoutPool,
    totalShares,
    status,
    notes,
    participants: participantPayouts
  };
}

function parseParticipants(formData: FormData): ParsedParticipant[] {
  const names = formData.getAll("participantName");
  const shares = formData.getAll("participantShares");
  const notes = formData.getAll("participantNotes");
  const participants: ParsedParticipant[] = [];

  for (let index = 0; index < names.length; index += 1) {
    const pilotName = cleanText(names[index]);
    const rawShares = cleanText(shares[index]);
    const participantNotes = cleanText(notes[index]);

    if (!pilotName && !rawShares && !participantNotes) {
      continue;
    }

    if (!pilotName) {
      throw new Error("Participant names cannot be blank.");
    }

    const shareValue = parseShareDecimal(rawShares, `Shares for ${pilotName}`);

    participants.push({
      pilotName,
      shares: shareValue,
      notes: participantNotes,
      payoutAmount: new Prisma.Decimal(0)
    });
  }

  if (!participants.length) {
    throw new Error("At least one participant is required.");
  }

  return participants;
}

function calculateParticipantPayouts(
  participants: ParsedParticipant[],
  payoutPool: Prisma.Decimal,
  totalShares: Prisma.Decimal
) {
  let assignedTotal = new Prisma.Decimal(0);

  return participants.map((participant, index) => {
    const isLast = index === participants.length - 1;
    const payoutAmount = isLast
      ? payoutPool.minus(assignedTotal)
      : payoutPool
          .mul(participant.shares)
          .div(totalShares)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

    assignedTotal = assignedTotal.plus(payoutAmount);

    return {
      ...participant,
      payoutAmount
    };
  });
}

function parseLootSplitStatus(value: FormDataEntryValue | null) {
  const status = normalizeLootSplitStatus(String(value || ""));

  if (
    lootSplitStatusOptions.includes(status as (typeof lootSplitStatusOptions)[number])
  ) {
    return status;
  }

  throw new Error("Invalid loot split status.");
}

function parseIskDecimal(value: FormDataEntryValue | null, label: string) {
  const raw = cleanText(value).replace(/,/g, "");

  if (!raw) {
    throw new Error(`${label} is required.`);
  }

  const numberValue = Number(raw);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be numeric and not negative.`);
  }

  return new Prisma.Decimal(raw).toDecimalPlaces(2);
}

function parseShareDecimal(value: string, label: string) {
  const raw = value.replace(/,/g, "");
  const numberValue = Number(raw);

  if (!raw || !Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`${label} must be numeric and greater than zero.`);
  }

  return new Prisma.Decimal(raw).toDecimalPlaces(4);
}

function getLootSplitStatusAuditAction(beforeStatus: string, afterStatus: string) {
  if (beforeStatus === afterStatus) {
    return null;
  }

  if (afterStatus === "PAID") {
    return "Loot Split Marked Paid";
  }

  if (afterStatus === "CANCELLED") {
    return "Loot Split Cancelled";
  }

  return "Loot Split Status Changed";
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

const lootSplitAuditSelect = {
  id: true,
  operationName: true,
  operationType: true,
  totalIskValue: true,
  corpCutAmount: true,
  srpReserveAmount: true,
  payoutPool: true,
  totalShares: true,
  createdBy: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true
} as const;

type LootSplitAuditRecord = {
  id: string;
  operationName: string;
  operationType: string;
  totalIskValue: Prisma.Decimal;
  corpCutAmount: Prisma.Decimal;
  srpReserveAmount: Prisma.Decimal;
  payoutPool: Prisma.Decimal;
  totalShares: Prisma.Decimal;
  createdBy: string;
  status: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

function formatLootSplitForAudit(split: LootSplitAuditRecord) {
  return {
    id: split.id,
    title: split.operationName,
    sourceType: split.operationType,
    totalValue: split.totalIskValue.toString(),
    corpCutAmount: split.corpCutAmount.toString(),
    srpReserveAmount: split.srpReserveAmount.toString(),
    payoutPool: split.payoutPool.toString(),
    totalShares: split.totalShares.toString(),
    createdBy: split.createdBy,
    status: normalizeLootSplitStatus(split.status),
    notes: split.notes,
    createdAt: split.createdAt.toISOString(),
    updatedAt: split.updatedAt.toISOString()
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Loot split action failed.";
}

function redirectWithMessage(
  corpSlug: string,
  type: "success" | "error",
  message: string
): never {
  const slug = corpSlug || "unknown";
  redirect(`/corp/${slug}/loot-splits?${type}=${encodeURIComponent(message)}`);
}
