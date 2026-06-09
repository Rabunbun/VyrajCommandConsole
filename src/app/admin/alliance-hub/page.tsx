import {
  AllianceContentPriority,
  AllianceContentType,
  ContentAudience,
  ContentStatus
} from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createAllianceHubContentAction,
  updateAllianceHubContentAction
} from "@/app/admin/alliance-hub/actions";
import { logoutAction } from "@/app/auth-actions";
import { logOfficerAudit } from "@/lib/audit";
import {
  allianceContentAudienceOptions,
  allianceContentPriorityOptions,
  allianceContentStatusOptions,
  allianceContentTypeOptions,
  getAllianceHubEditorData,
  type AdminAllianceHubContentView
} from "@/lib/admin/alliance-hub";
import { formatStatusLabel } from "@/lib/public-data";
import { hasPermission } from "@/lib/permissions";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type AllianceHubEditorPageProps = {
  searchParams?: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function AllianceHubEditorPage({
  searchParams
}: AllianceHubEditorPageProps) {
  const session = await getCurrentOfficerSession();
  const params = await searchParams;

  if (!session) {
    redirect("/login");
  }

  if (
    !hasPermission(session, "allianceHubEdit") &&
    !hasPermission(session, "allianceAnnouncementsEdit")
  ) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Alliance Hub Editor",
      action: "Access Denied",
      targetType: "Route",
      targetName: "/admin/alliance-hub",
      summary: "Officer attempted to view Alliance Hub Editor without permission."
    });

    return <AccessDenied />;
  }

  let data;

  try {
    data = await getAllianceHubEditorData();
  } catch (error) {
    return (
      <div className="page-stack">
        <AdminHeader />
        <div className="error-state">
          {error instanceof Error
            ? `Could not load Alliance Hub content: ${error.message}`
            : "Could not load Alliance Hub content."}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <AdminHeader />
      <MessageBanner success={params?.success} error={params?.error} />

      <CreateContentPanel />

      {data.content.length ? (
        <section className="section-stack" aria-label="Alliance Hub content">
          {data.content.map((content) => (
            <ContentCard content={content} key={content.id} />
          ))}
        </section>
      ) : (
        <div className="empty-state">No Alliance Hub content found.</div>
      )}
    </div>
  );
}

function AdminHeader() {
  return (
    <header className="page-heading">
      <div className="eyebrow">Admin</div>
      <h1 className="page-title">Alliance Hub Editor</h1>
      <p className="page-copy">
        Manage audience-scoped Alliance Hub content, public visibility dates,
        priority, and archive status.
      </p>
      <div className="badge-row">
        <Link className="secondary-button" href="/admin/super">
          Super Admin Console
        </Link>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}

function AccessDenied() {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Access</div>
        <h1 className="page-title">Access Denied</h1>
        <p className="page-copy">
          Alliance Hub Editor permission is required for this page.
        </p>
      </header>
      <div className="badge-row">
        <Link className="command-button" href="/">
          Alliance Hub
        </Link>
        <form action={logoutAction}>
          <button className="secondary-button" type="submit">
            Logout
          </button>
        </form>
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

function CreateContentPanel() {
  return (
    <details className="create-disclosure form-panel form-panel-wide" aria-label="Create content">
      <summary className="create-summary">
        <span className="command-button">Create Announcement</span>
      </summary>
      <div className="card-heading">
        <h2 className="section-title">Create Content</h2>
        <p className="card-copy">
          Public visibility still requires ACTIVE status, ALL_MEMBERS audience,
          and a valid date window.
        </p>
      </div>

      <form action={createAllianceHubContentAction} className="section-stack">
        <ContentFields />
        <div className="badge-row">
          <button className="command-button" type="submit">
            Create Content
          </button>
        </div>
      </form>
    </details>
  );
}

function ContentCard({ content }: { content: AdminAllianceHubContentView }) {
  return (
    <article className="data-card">
      <div className="section-heading">
        <div className="card-heading">
          <h2 className="card-title">{content.title}</h2>
          <div className="card-subtitle">
            {formatStatusLabel(content.contentType)} / {content.createdBy || "Unknown"}
          </div>
        </div>
        <div className="badge-row">
          <span className="badge">{formatStatusLabel(content.status)}</span>
          <span className="badge">{formatStatusLabel(content.audience)}</span>
          <span className="badge">{formatStatusLabel(content.priority)}</span>
        </div>
      </div>

      <p className="card-copy">{content.body}</p>

      <div className="metric-grid">
        <Metric label="Starts" value={formatOptionalDate(content.startDate)} />
        <Metric label="Ends" value={formatOptionalDate(content.endDate)} />
      </div>

      <details className="details-panel">
        <summary className="details-summary">Edit Content</summary>
        <form action={updateAllianceHubContentAction} className="section-stack">
          <input name="contentId" type="hidden" value={content.id} />
          <ContentFields content={content} />
          <div className="badge-row">
            <button className="command-button" type="submit">
              Save Content
            </button>
          </div>
        </form>
      </details>
    </article>
  );
}

function ContentFields({
  content
}: {
  content?: AdminAllianceHubContentView;
}) {
  return (
    <>
      <div className="form-grid">
        <label className="field-stack">
          <span className="field-label">Content Type</span>
          <select
            className="text-input"
            defaultValue={content?.contentType || AllianceContentType.ANNOUNCEMENT}
            name="contentType"
          >
            {allianceContentTypeOptions.map((contentType) => (
              <option key={contentType} value={contentType}>
                {formatStatusLabel(contentType)}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span className="field-label">Audience</span>
          <select
            className="text-input"
            defaultValue={content?.audience || ContentAudience.ALL_MEMBERS}
            name="audience"
          >
            {allianceContentAudienceOptions.map((audience) => (
              <option key={audience} value={audience}>
                {formatStatusLabel(audience)}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span className="field-label">Priority</span>
          <select
            className="text-input"
            defaultValue={content?.priority || AllianceContentPriority.NORMAL}
            name="priority"
          >
            {allianceContentPriorityOptions.map((priority) => (
              <option key={priority} value={priority}>
                {formatStatusLabel(priority)}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span className="field-label">Status</span>
          <select
            className="text-input"
            defaultValue={content?.status || ContentStatus.DRAFT}
            name="status"
          >
            {allianceContentStatusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        <label className="field-stack">
          <span className="field-label">Start Date</span>
          <input
            className="text-input"
            defaultValue={toDateInputValue(content?.startDate)}
            name="startDate"
            type="datetime-local"
          />
        </label>

        <label className="field-stack">
          <span className="field-label">End Date</span>
          <input
            className="text-input"
            defaultValue={toDateInputValue(content?.endDate)}
            name="endDate"
            type="datetime-local"
          />
        </label>
      </div>

      <label className="field-stack">
        <span className="field-label">Title</span>
        <input
          className="text-input"
          defaultValue={content?.title}
          name="title"
          required
        />
      </label>

      <label className="field-stack">
        <span className="field-label">Body</span>
        <textarea
          className="text-input"
          defaultValue={content?.body}
          name="body"
          required
          rows={5}
        />
      </label>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "Open";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function toDateInputValue(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 16);
}
