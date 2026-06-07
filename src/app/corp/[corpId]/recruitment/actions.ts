"use server";

import { CorpStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logOfficerAudit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import {
  canReviewRecruitment,
  composeRecruitmentNotes,
  isRecruitmentEnabled,
  normalizeRecruitmentStatus,
  recruitmentStatusOptions,
  splitRecruitmentNotes
} from "@/lib/modules/recruitment";
import { getCurrentOfficerSession } from "@/lib/session";

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function createRecruitmentApplicantAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Recruitment applicant created.";

  try {
    const corp = await getRecruitmentCorpForMutation(corpSlug);

    if (!canReviewRecruitment(session, corp.id)) {
      throw new Error("Recruitment Review permission is required.");
    }

    const data = parseApplicantForm(formData);

    const applicant = await getDb().recruitmentApplicant.create({
      data: {
        corpId: corp.id,
        applicantName: data.characterName,
        mainCharacter: data.characterName,
        discordName: data.discordName,
        timeZone: data.timeZone,
        preferredContent: data.interestedRoles,
        skillPoints: data.skillPoints,
        source: data.referral,
        recruitmentChannel: data.recruitmentChannel,
        recruiter: session?.officer.officerName || "",
        status: data.status,
        notes: composeRecruitmentNotes(data.applicantNotes, data.reviewerNotes)
      },
      select: applicantAuditSelect
    });

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "Recruitment Review",
      action: "Recruitment Applicant Created",
      targetType: "RecruitmentApplicant",
      targetId: applicant.id,
      targetName: applicant.mainCharacter || applicant.applicantName,
      summary: `Created recruitment applicant ${applicant.mainCharacter || applicant.applicantName}.`,
      details: {
        after: formatApplicantForAudit(applicant)
      }
    });

    revalidatePath(`/corp/${corp.slug}/recruitment`);
    successMessage = `Applicant ${applicant.mainCharacter || applicant.applicantName} created.`;
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

export async function updateRecruitmentApplicantAction(formData: FormData) {
  const session = await getCurrentOfficerSession();
  const corpSlug = cleanText(formData.get("corpSlug"));
  let successMessage = "Recruitment applicant updated.";

  try {
    const corp = await getRecruitmentCorpForMutation(corpSlug);

    if (!canReviewRecruitment(session, corp.id)) {
      throw new Error("Recruitment Review permission is required.");
    }

    const applicantId = cleanText(formData.get("applicantId"));

    if (!applicantId) {
      throw new Error("Applicant ID is required.");
    }

    const existing = await getDb().recruitmentApplicant.findFirst({
      where: {
        id: applicantId,
        corpId: corp.id
      },
      select: applicantAuditSelect
    });

    if (!existing) {
      throw new Error("Recruitment applicant unavailable.");
    }

    const data = parseApplicantForm(formData);

    const updated = await getDb().recruitmentApplicant.update({
      where: { id: applicantId },
      data: {
        applicantName: data.characterName,
        mainCharacter: data.characterName,
        discordName: data.discordName,
        timeZone: data.timeZone,
        preferredContent: data.interestedRoles,
        skillPoints: data.skillPoints,
        source: data.referral,
        recruitmentChannel: data.recruitmentChannel,
        recruiter: session?.officer.officerName || existing.recruiter,
        status: data.status,
        notes: composeRecruitmentNotes(data.applicantNotes, data.reviewerNotes)
      },
      select: applicantAuditSelect
    });

    await logOfficerAudit({
      officerId: session?.officer.id,
      officerName: session?.officer.officerName,
      officerRole: session?.officer.role,
      corpId: corp.id,
      corpSlug: corp.slug,
      corpName: corp.name,
      module: "Recruitment Review",
      action: "Recruitment Applicant Updated",
      targetType: "RecruitmentApplicant",
      targetId: updated.id,
      targetName: updated.mainCharacter || updated.applicantName,
      summary: `Updated recruitment applicant ${updated.mainCharacter || updated.applicantName}.`,
      details: {
        before: formatApplicantForAudit(existing),
        after: formatApplicantForAudit(updated)
      }
    });

    const beforeStatus = normalizeRecruitmentStatus(existing.status);
    const afterStatus = normalizeRecruitmentStatus(updated.status);

    if (beforeStatus !== afterStatus) {
      await logOfficerAudit({
        officerId: session?.officer.id,
        officerName: session?.officer.officerName,
        officerRole: session?.officer.role,
        corpId: corp.id,
        corpSlug: corp.slug,
        corpName: corp.name,
        module: "Recruitment Review",
        action: "Recruitment Status Changed",
        targetType: "RecruitmentApplicant",
        targetId: updated.id,
        targetName: updated.mainCharacter || updated.applicantName,
        summary: `Changed recruitment status from ${beforeStatus} to ${afterStatus}.`,
        details: {
          before: { status: beforeStatus },
          after: { status: afterStatus }
        }
      });
    }

    revalidatePath(`/corp/${corp.slug}/recruitment`);
    successMessage = `Applicant ${updated.mainCharacter || updated.applicantName} updated.`;
  } catch (error) {
    redirectWithMessage(corpSlug || "", "error", getErrorMessage(error));
  }

  redirectWithMessage(corpSlug, "success", successMessage);
}

async function getRecruitmentCorpForMutation(corpSlug: string) {
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
    throw new Error("This corp is not available for recruitment review.");
  }

  if (!isRecruitmentEnabled(corp.enabledModules)) {
    throw new Error("Recruitment Review is not enabled for this corp.");
  }

  return corp;
}

function parseApplicantForm(formData: FormData) {
  const characterName = normalizeDisplayName(formData.get("characterName"));
  const discordName = cleanText(formData.get("discordName"));
  const timeZone = cleanText(formData.get("timeZone"));
  const interestedRoles = cleanText(formData.get("interestedRoles"));
  const skillPoints = cleanText(formData.get("skillPoints"));
  const referral = cleanText(formData.get("referral"));
  const recruitmentChannel = cleanText(formData.get("recruitmentChannel"));
  const status = parseRecruitmentStatus(formData.get("status"));
  const applicantNotes = cleanText(formData.get("applicantNotes"));
  const reviewerNotes = cleanText(formData.get("reviewerNotes"));

  if (!characterName) {
    throw new Error("Character name is required.");
  }

  return {
    characterName,
    discordName,
    timeZone,
    interestedRoles,
    skillPoints,
    referral,
    recruitmentChannel,
    status,
    applicantNotes,
    reviewerNotes
  };
}

function parseRecruitmentStatus(value: FormDataEntryValue | null) {
  const status = normalizeRecruitmentStatus(String(value || ""));

  if (
    recruitmentStatusOptions.includes(
      status as (typeof recruitmentStatusOptions)[number]
    )
  ) {
    return status;
  }

  throw new Error("Invalid recruitment status.");
}

function normalizeDisplayName(value: FormDataEntryValue | null) {
  return cleanText(value).replace(/\s+/g, " ");
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

const applicantAuditSelect = {
  id: true,
  applicantName: true,
  mainCharacter: true,
  discordName: true,
  timeZone: true,
  preferredContent: true,
  skillPoints: true,
  source: true,
  recruitmentChannel: true,
  recruiter: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true
} as const;

type ApplicantAuditRecord = {
  id: string;
  applicantName: string;
  mainCharacter: string;
  discordName: string;
  timeZone: string;
  preferredContent: string;
  skillPoints: string;
  source: string;
  recruitmentChannel: string;
  recruiter: string;
  status: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

function formatApplicantForAudit(applicant: ApplicantAuditRecord) {
  const notes = splitRecruitmentNotes(applicant.notes);

  return {
    id: applicant.id,
    characterName: applicant.mainCharacter || applicant.applicantName,
    discordName: applicant.discordName,
    timeZone: applicant.timeZone,
    interestedRoles: applicant.preferredContent,
    skillPoints: applicant.skillPoints,
    referral: applicant.source,
    recruitmentChannel: applicant.recruitmentChannel,
    reviewerName: applicant.recruiter,
    status: normalizeRecruitmentStatus(applicant.status),
    applicantNotes: notes.applicantNotes,
    reviewerNotes: notes.reviewerNotes,
    createdAt: applicant.createdAt.toISOString(),
    updatedAt: applicant.updatedAt.toISOString()
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Recruitment action failed.";
}

function redirectWithMessage(
  corpSlug: string,
  type: "success" | "error",
  message: string
): never {
  const slug = corpSlug || "unknown";
  redirect(`/corp/${slug}/recruitment?${type}=${encodeURIComponent(message)}`);
}
