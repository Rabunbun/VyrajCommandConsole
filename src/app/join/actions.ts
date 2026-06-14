"use server";

import { CorpStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { composeRecruitmentNotes } from "@/lib/modules/recruitment";

const activePublicStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];
const interestOptions = new Set([
  "PvP / Small Gang",
  "Fleet PvP",
  "Pochven",
  "Industry",
  "Mining",
  "Logistics / Hauling",
  "Exploration / Scouting",
  "Wormholes",
  "Faction Warfare",
  "Market / Trade",
  "New Player Training",
  "Other"
]);
const spEstimateOptions = new Set([
  "Under 5M",
  "5M-20M",
  "20M-50M",
  "50M-100M",
  "100M+",
  "Prefer not to say"
]);

export async function submitJoinApplicationAction(formData: FormData) {
  let redirectTo = "/join?success=Application%20received.";

  try {
    const data = parseJoinApplicationForm(formData);
    const corp = await getDb().corp.findFirst({
      where: {
        id: data.desiredCorpId,
        status: {
          in: activePublicStatuses
        }
      },
      select: {
        id: true,
        slug: true,
        name: true,
        ticker: true
      }
    });

    if (!corp) {
      throw new Error("Choose an available corp from the list.");
    }

    const applicantNotes = [
      data.explanation,
      "",
      `Areas of Interest: ${data.areasOfInterest.join(", ")}`,
      `SP Estimate: ${data.spEstimate}`,
      data.discordName ? `Discord: ${data.discordName}` : "Discord: Not provided",
      "Future: send application summary to configured Discord recruitment channel."
    ].join("\n");
    const created = await getDb().recruitmentApplicant.create({
      data: {
        corpId: corp.id,
        applicantName: data.characterName,
        mainCharacter: data.characterName,
        discordName: data.discordName,
        preferredContent: data.areasOfInterest.join(", "),
        skillPoints: data.spEstimate,
        source: "Public Join Form",
        recruitmentChannel: "Public Join Page",
        status: "NEW",
        notes: composeRecruitmentNotes(applicantNotes, "")
      },
      select: {
        id: true,
        mainCharacter: true
      }
    });

    await logOfficerAudit({
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "Recruitment",
      action: "Public Join Application Submitted",
      targetType: "RecruitmentApplicant",
      targetId: created.id,
      targetName: created.mainCharacter,
      summary: `Public join application submitted for ${created.mainCharacter} to ${corp.name}.`,
      details: {
        characterName: data.characterName,
        desiredCorp: {
          id: corp.id,
          name: corp.name,
          slug: corp.slug,
          ticker: corp.ticker
        },
        areasOfInterest: data.areasOfInterest,
        spEstimate: data.spEstimate,
        discordProvided: Boolean(data.discordName),
        source: "Public Join Page"
      }
    });

    revalidatePath(`/corp/${corp.slug}/recruitment`);
    redirectTo =
      "/join?success=" +
      encodeURIComponent("Application received. Leadership will review it.");
  } catch (error) {
    redirectTo =
      "/join?error=" +
      encodeURIComponent(
        error instanceof Error
          ? error.message
          : "Application could not be submitted."
      );
  }

  redirect(redirectTo);
}

function parseJoinApplicationForm(formData: FormData) {
  const characterName = normalizeText(formData.get("characterName"));
  const areasOfInterest = formData
    .getAll("areasOfInterest")
    .map((value) => normalizeText(value))
    .filter((value) => interestOptions.has(value));
  const spEstimate = normalizeText(formData.get("spEstimate"));
  const desiredCorpId = normalizeText(formData.get("desiredCorpId"));
  const explanation = normalizeText(formData.get("explanation"));
  const discordName = normalizeText(formData.get("discordName"));

  if (!characterName) {
    throw new Error("Character name is required.");
  }

  if (!areasOfInterest.length) {
    throw new Error("Choose at least one area of interest.");
  }

  if (!spEstimateOptions.has(spEstimate)) {
    throw new Error("Choose an SP estimate.");
  }

  if (!desiredCorpId) {
    throw new Error("Choose a desired corp.");
  }

  if (explanation.length < 20) {
    throw new Error("Tell us a little more about what you are looking for.");
  }

  return {
    characterName,
    areasOfInterest,
    spEstimate,
    desiredCorpId,
    explanation,
    discordName
  };
}

function normalizeText(value: FormDataEntryValue | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
