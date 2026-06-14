import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  createRecruitmentApplicantAction,
  updateRecruitmentApplicantAction
} from "@/app/corp/[corpId]/recruitment/actions";
import { CorpAccessDenied } from "@/components/corp-access-denied";
import { getOfficerOnlyDeniedContext } from "@/lib/corp-portal-access";
import {
  getRecruitmentPageData,
  recruitmentStatusOptions,
  type RecruitmentApplicantView,
  type RecruitmentCorpView
} from "@/lib/modules/recruitment";
import { formatStatusLabel } from "@/lib/public-data";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const quickFilters = [
  { label: "All", value: "" },
  { label: "New", value: "NEW" },
  { label: "Contacted", value: "CONTACTED" },
  { label: "Interview Scheduled", value: "INTERVIEW_SCHEDULED" },
  { label: "On Hold", value: "ON_HOLD" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Archived", value: "ARCHIVED" }
] as const;

const attentionStatuses = new Set([
  "NEW",
  "CONTACTED",
  "INTERVIEW_SCHEDULED"
]);

type RecruitmentPageProps = {
  params: Promise<{
    corpId: string;
  }>;
  searchParams?: Promise<{
    success?: string;
    error?: string;
    status?: string;
  }>;
};

export default async function RecruitmentPage({
  params,
  searchParams
}: RecruitmentPageProps) {
  const { corpId } = await params;
  const paramsResult = await searchParams;
  const corpSlug = decodeURIComponent(corpId);
  const session = await getCurrentOfficerSession();

  if (!session) {
    const deniedAccess = await getOfficerOnlyDeniedContext(corpSlug);

    if (!deniedAccess.corp) {
      notFound();
    }

    if (!deniedAccess.loginRequired) {
      return (
        <CorpAccessDenied
          access={deniedAccess}
          moduleName="Recruitment Review"
        />
      );
    }

    redirect("/login");
  }

  const result = await getRecruitmentPageData(corpSlug, session);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "access_denied") {
    return (
      <UnavailableState
        eyebrow="Access"
        message={result.message}
        title="Recruitment Access Denied"
      />
    );
  }

  if (result.status === "module_disabled") {
    return (
      <UnavailableState
        corp={result.corp}
        eyebrow="Module Disabled"
        message={result.message}
        title="Recruitment Review Disabled"
      />
    );
  }

  const selectedStatus = paramsResult?.status || "";
  const applicants = selectedStatus
    ? result.applicants.filter((applicant) => applicant.status === selectedStatus)
    : result.applicants;

  return (
    <div className="page-stack">
      <RecruitmentHeader corp={result.corp} accessMode={result.accessMode} />
      <MessageBanner success={paramsResult?.success} error={paramsResult?.error} />
      <CreateApplicantPanel corp={result.corp} />
      <ApplicantPipeline
        applicants={applicants}
        corp={result.corp}
        selectedStatus={selectedStatus}
        totalApplicants={result.applicants.length}
      />
    </div>
  );
}

function RecruitmentHeader({
  accessMode,
  corp
}: {
  accessMode: string;
  corp: RecruitmentCorpView;
}) {
  return (
    <header className="page-heading">
      <div className="eyebrow">Officer Module</div>
      <h1 className="page-title">Recruitment Review</h1>
      <p className="page-copy">
        Track applicant status, reviewer notes, and recruitment context for
        {` ${corp.name}`}.
      </p>
      <div className="badge-row">
        <Link className="secondary-button" href={`/corp/${corp.slug}`}>
          Back to Corp Portal
        </Link>
        <span className="badge">{corp.name}</span>
        <span className="badge">{corp.ticker}</span>
        <span className="badge">{accessMode}</span>
      </div>
    </header>
  );
}

function UnavailableState({
  corp,
  eyebrow,
  message,
  title
}: {
  corp?: RecruitmentCorpView;
  eyebrow: string;
  message: string;
  title: string;
}) {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        <p className="page-copy">{message}</p>
      </header>
      <div className="badge-row">
        <Link className="secondary-button" href={corp ? `/corp/${corp.slug}` : "/"}>
          {corp ? "Back to Corp Portal" : "Alliance Hub"}
        </Link>
      </div>
    </div>
  );
}

function MessageBanner({
  success,
  error
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  return (
    <div className={error ? "error-state" : "success-state"} role="status">
      {error || success}
    </div>
  );
}

function CreateApplicantPanel({ corp }: { corp: RecruitmentCorpView }) {
  return (
    <details className="create-disclosure form-panel form-panel-wide" aria-label="Create applicant">
      <summary className="create-summary">
        <span className="command-button">Create Recruitment Entry</span>
      </summary>
      <div className="card-heading">
        <h2 className="section-title">Create Applicant</h2>
        <p className="card-copy">
          Applicant records are officer-created in this pass. No public
          application form is exposed.
        </p>
      </div>

      <form action={createRecruitmentApplicantAction} className="section-stack">
        <input name="corpSlug" type="hidden" value={corp.slug} />
        <ApplicantFields />
        <div className="badge-row">
          <button className="command-button" type="submit">
            Create Applicant
          </button>
        </div>
      </form>
    </details>
  );
}

function ApplicantPipeline({
  applicants,
  corp,
  selectedStatus,
  totalApplicants
}: {
  applicants: RecruitmentApplicantView[];
  corp: RecruitmentCorpView;
  selectedStatus: string;
  totalApplicants: number;
}) {
  return (
    <section className="section-stack" aria-label="Applicant pipeline">
      <div className="section-heading">
        <h2 className="section-title">Applicant Pipeline</h2>
        <div className="badge-row">
          <span className="badge">{totalApplicants} total</span>
          <span className="badge">{applicants.length} shown</span>
        </div>
      </div>

      <div className="badge-row">
        {quickFilters.map((filter) => (
          <Link
            className={selectedStatus === filter.value ? "command-button" : "secondary-button"}
            href={
              filter.value
                ? `/corp/${corp.slug}/recruitment?status=${filter.value}`
                : `/corp/${corp.slug}/recruitment`
            }
            key={filter.value || "all"}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {applicants.length ? (
        applicants.map((applicant) => (
          <ApplicantCard applicant={applicant} corp={corp} key={applicant.id} />
        ))
      ) : (
        <div className="empty-state">No recruitment applicants found.</div>
      )}
    </section>
  );
}

function ApplicantCard({
  applicant,
  corp
}: {
  applicant: RecruitmentApplicantView;
  corp: RecruitmentCorpView;
}) {
  return (
    <article className="data-card">
      <div className="section-heading">
        <div className="card-heading">
          <h3 className="card-title">{applicant.characterName}</h3>
          <div className="card-subtitle">{applicant.discordName || "No Discord listed"}</div>
        </div>
        <div className="badge-row">
          <span className="badge">{formatStatusLabel(applicant.status)}</span>
          {attentionStatuses.has(applicant.status) ? (
            <span className="badge">Needs Attention</span>
          ) : null}
        </div>
      </div>

      <div className="metric-grid">
        <Metric label="Submitted" value={formatDate(applicant.createdAt)} />
        <Metric label="Timezone" value={applicant.timeZone || "Unknown"} />
        <Metric label="Roles" value={applicant.interestedRoles || "Unknown"} />
        <Metric label="Skill Points" value={applicant.skillPoints || "Unknown"} />
        <Metric label="Source" value={applicant.referral || "None"} />
        <Metric
          label="Channel"
          value={applicant.recruitmentChannel || "Unknown"}
        />
      </div>

      {applicant.applicantNotes ? (
        <p className="card-copy">{applicant.applicantNotes}</p>
      ) : null}

      <details className="details-panel">
        <summary className="details-summary">Edit Applicant</summary>
        <form action={updateRecruitmentApplicantAction} className="section-stack">
          <input name="corpSlug" type="hidden" value={corp.slug} />
          <input name="applicantId" type="hidden" value={applicant.id} />
          <ApplicantFields applicant={applicant} />
          <div className="badge-row">
            <button className="command-button" type="submit">
              Save Applicant
            </button>
          </div>
        </form>
      </details>
    </article>
  );
}

function ApplicantFields({
  applicant
}: {
  applicant?: RecruitmentApplicantView;
}) {
  return (
    <>
      <div className="form-grid">
        <label className="field-stack">
          <span className="field-label">Character Name</span>
          <input
            className="text-input"
            defaultValue={applicant?.characterName}
            name="characterName"
            required
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Discord Name</span>
          <input
            className="text-input"
            defaultValue={applicant?.discordName}
            name="discordName"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Timezone</span>
          <input
            className="text-input"
            defaultValue={applicant?.timeZone}
            name="timeZone"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Interested Roles</span>
          <input
            className="text-input"
            defaultValue={applicant?.interestedRoles}
            name="interestedRoles"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Skill Points</span>
          <input
            className="text-input"
            defaultValue={applicant?.skillPoints}
            name="skillPoints"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Referral</span>
          <input
            className="text-input"
            defaultValue={applicant?.referral}
            name="referral"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Recruitment Channel</span>
          <input
            className="text-input"
            defaultValue={applicant?.recruitmentChannel}
            name="recruitmentChannel"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">Status</span>
          <select
            className="text-input"
            defaultValue={applicant?.status || "NEW"}
            name="status"
          >
            {recruitmentStatusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field-stack">
        <span className="field-label">Applicant Notes</span>
        <textarea
          className="text-input"
          defaultValue={applicant?.applicantNotes}
          name="applicantNotes"
          rows={3}
        />
      </label>

      <label className="field-stack">
        <span className="field-label">Reviewer Notes</span>
        <textarea
          className="text-input"
          defaultValue={applicant?.reviewerNotes}
          name="reviewerNotes"
          rows={3}
        />
      </label>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value audit-meta-value">{value}</div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
