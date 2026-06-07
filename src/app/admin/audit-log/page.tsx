import { OfficerRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/auth-actions";
import { logOfficerAudit } from "@/lib/audit";
import {
  getAllowedAuditLimits,
  getAuditLogData,
  parseLimit,
  type AuditLogEntryView,
  type AuditLogFilterOptions,
  type AuditLogFilters
} from "@/lib/admin/audit-log";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type AuditLogPageProps = {
  searchParams?: Promise<AuditLogFilters>;
};

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const session = await getCurrentOfficerSession();
  const filters = await searchParams || {};

  if (!session) {
    redirect("/login");
  }

  if (session.officer.role !== OfficerRole.SUPER_ADMIN) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "Audit Log",
      action: "Access Denied",
      targetType: "Route",
      targetName: "/admin/audit-log",
      summary: "Non-super-admin officer attempted to view the audit log."
    });

    return <AccessDenied />;
  }

  let data;

  try {
    data = await getAuditLogData(filters);
  } catch (error) {
    return (
      <div className="page-stack">
        <AdminHeader />
        <div className="error-state">
          {error instanceof Error
            ? `Could not load audit log entries: ${error.message}`
            : "Could not load audit log entries."}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <AdminHeader />
      <AuditFilterPanel
        filterOptions={data.filterOptions}
        filters={filters}
        limit={data.appliedLimit}
      />

      {data.entries.length ? (
        <section className="section-stack" aria-label="Audit log entries">
          {data.entries.map((entry) => (
            <AuditEntryCard entry={entry} key={entry.id} />
          ))}
        </section>
      ) : (
        <div className="empty-state">No audit log entries found.</div>
      )}
    </div>
  );
}

function AdminHeader() {
  return (
    <header className="page-heading">
      <div className="eyebrow">Super Admin</div>
      <h1 className="page-title">Alliance Audit Log</h1>
      <p className="page-copy">
        Review officer and admin actions recorded by the v2 command console.
        Sensitive payload fields are redacted before rendering.
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
          Super Admin access is required to view the audit log.
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

function AuditFilterPanel({
  filterOptions,
  filters,
  limit
}: {
  filterOptions: AuditLogFilterOptions;
  filters: AuditLogFilters;
  limit: number;
}) {
  return (
    <section className="form-panel form-panel-wide" aria-label="Audit filters">
      <div className="card-heading">
        <h2 className="section-title">Filters</h2>
        <p className="card-copy">
          Search covers actor, corp, module, action, target, and summary fields.
        </p>
      </div>

      <form className="section-stack" action="/admin/audit-log">
        <div className="form-grid">
          <label className="field-stack">
            <span className="field-label">Search</span>
            <input
              className="text-input"
              defaultValue={filters.search || ""}
              name="search"
              placeholder="actor, corp, target, summary"
            />
          </label>

          <SelectField
            label="Module"
            name="module"
            options={filterOptions.modules}
            value={filters.module}
          />

          <SelectField
            label="Action"
            name="action"
            options={filterOptions.actions}
            value={filters.action}
          />

          <SelectField
            label="Officer"
            name="officer"
            options={filterOptions.officers}
            value={filters.officer}
          />

          <SelectField
            label="Corp"
            name="corp"
            options={filterOptions.corps}
            value={filters.corp}
          />

          <label className="field-stack">
            <span className="field-label">Date From</span>
            <input
              className="text-input"
              defaultValue={filters.dateFrom || ""}
              name="dateFrom"
              type="date"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Date To</span>
            <input
              className="text-input"
              defaultValue={filters.dateTo || ""}
              name="dateTo"
              type="date"
            />
          </label>

          <label className="field-stack">
            <span className="field-label">Limit</span>
            <select className="text-input" defaultValue={String(limit)} name="limit">
              {getAllowedAuditLimits().map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="badge-row">
          <button className="command-button" type="submit">
            Apply Filters
          </button>
          <Link className="secondary-button" href="/admin/audit-log">
            Clear Filters
          </Link>
          <span className="badge">Limit {parseLimit(filters.limit)}</span>
        </div>
      </form>
    </section>
  );
}

function SelectField({
  label,
  name,
  options,
  value
}: {
  label: string;
  name: string;
  options: string[];
  value?: string;
}) {
  return (
    <label className="field-stack">
      <span className="field-label">{label}</span>
      <select className="text-input" defaultValue={value || ""} name={name}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function AuditEntryCard({ entry }: { entry: AuditLogEntryView }) {
  return (
    <article className="data-card">
      <div className="section-heading">
        <div className="card-heading">
          <h2 className="card-title">{entry.action}</h2>
          <div className="card-subtitle">{formatDateTime(entry.createdAt)}</div>
        </div>
        <div className="badge-row">
          <span className="badge">{entry.module || "Unknown Module"}</span>
          {entry.officerRole ? <span className="badge">{entry.officerRole}</span> : null}
          {entry.corpName || entry.corpSlug ? (
            <span className="badge">{entry.corpName || entry.corpSlug}</span>
          ) : null}
        </div>
      </div>

      <div className="audit-meta-grid">
        <AuditMeta label="Actor" value={entry.officerName || "Unknown"} />
        <AuditMeta label="Target Type" value={entry.targetType || "None"} />
        <AuditMeta label="Target ID" value={entry.targetId || "None"} />
        <AuditMeta label="Target Name" value={entry.targetName || "None"} />
      </div>

      {entry.summary ? <p className="card-copy">{entry.summary}</p> : null}

      <details className="details-panel">
        <summary className="details-summary">Details</summary>
        <div className="audit-json-grid">
          <JsonBlock label="Before" value={entry.before} />
          <JsonBlock label="After" value={entry.after} />
          <JsonBlock label="Details" value={entry.details} />
        </div>
      </details>
    </article>
  );
}

function AuditMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value audit-meta-value">{value}</div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="section-stack">
      <div className="status-label">{label}</div>
      <pre className="json-block">{formatJson(value)}</pre>
    </div>
  );
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  return JSON.stringify(value, null, 2);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
