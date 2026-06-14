import "server-only";
import { CorpStatus, OfficerRole } from "@prisma/client";
import { getDb } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import type { CurrentOfficerSession } from "@/lib/session";

export const recruitmentStatusOptions = [
  "NEW",
  "CONTACTED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEWED",
  "ON_HOLD",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "ARCHIVED"
] as const;

export type RecruitmentStatus = (typeof recruitmentStatusOptions)[number];

export type RecruitmentCorpView = {
  id: string;
  slug: string;
  name: string;
  ticker: string;
  status: CorpStatus;
};

export type RecruitmentApplicantView = {
  id: string;
  characterName: string;
  discordName: string;
  timeZone: string;
  interestedRoles: string;
  skillPoints: string;
  referral: string;
  recruitmentChannel: string;
  reviewerName: string;
  status: string;
  applicantNotes: string;
  reviewerNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type RecruitmentPageData =
  | {
      status: "ready";
      corp: RecruitmentCorpView;
      applicants: RecruitmentApplicantView[];
      accessMode: "Officer View" | "Super Admin View";
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
      corp: RecruitmentCorpView;
      message: string;
    };

const publicCorpStatuses: CorpStatus[] = [CorpStatus.ACTIVE, CorpStatus.TRIAL];

export async function getRecruitmentPageData(
  corpSlug: string,
  session: CurrentOfficerSession | null
): Promise<RecruitmentPageData> {
  const corp = await getDb().corp.findUnique({
    where: { slug: corpSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      ticker: true,
      status: true,
      enabledModules: true,
      recruitmentApplicants: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
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
      message: "This corp is not available for recruitment review."
    };
  }

  if (!isRecruitmentEnabled(corp.enabledModules)) {
    return {
      status: "module_disabled",
      corp: publicCorp,
      message: "Recruitment Review is not enabled for this corp."
    };
  }

  if (!canReviewRecruitment(session, corp.id)) {
    return {
      status: "access_denied",
      message: "Recruitment Review access is required for this corp."
    };
  }

  return {
    status: "ready",
    corp: publicCorp,
    applicants: corp.recruitmentApplicants.map((applicant) => {
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
    }),
    accessMode: session?.officer.role === OfficerRole.SUPER_ADMIN
      ? "Super Admin View"
      : "Officer View"
  };
}

export function canReviewRecruitment(
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

  return assignedToCorp && hasPermission(session, "recruitmentReview", corpId);
}

export function isRecruitmentEnabled(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).recruitment === true;
}

export function normalizeRecruitmentStatus(value: string) {
  const normalized = value.trim().replace(/\s+/g, "_").toUpperCase();

  if (normalized === "NEW" || normalized === "") {
    return "NEW";
  }

  return normalized;
}

export function composeRecruitmentNotes(
  applicantNotes: string,
  reviewerNotes: string
) {
  return [
    "Applicant Notes:",
    applicantNotes.trim() || "None",
    "",
    "Reviewer Notes:",
    reviewerNotes.trim() || "None"
  ].join("\n");
}

export function splitRecruitmentNotes(value: string) {
  const applicantMatch = value.match(
    /Applicant Notes:\s*([\s\S]*?)(?:\n\s*Reviewer Notes:|$)/i
  );
  const reviewerMatch = value.match(/Reviewer Notes:\s*([\s\S]*)$/i);

  if (!applicantMatch && !reviewerMatch) {
    return {
      applicantNotes: value,
      reviewerNotes: ""
    };
  }

  return {
    applicantNotes: applicantMatch?.[1]?.trim() === "None"
      ? ""
      : applicantMatch?.[1]?.trim() || "",
    reviewerNotes: reviewerMatch?.[1]?.trim() === "None"
      ? ""
      : reviewerMatch?.[1]?.trim() || ""
  };
}
