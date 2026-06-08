import { OfficerRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/auth-actions";
import { logOfficerAudit } from "@/lib/audit";
import {
  getSystemHealthData,
  type HealthCheck,
  type HealthStatus,
  type RecentAuditHeartbeat,
  type SystemHealthCounts,
  type HealthWarning
} from "@/lib/admin/system-health";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const countCards: Array<{
  key: keyof SystemHealthCounts;
  label: string;
}> = [
  { key: "corps", label: "Corps" },
  { key: "activeTrialCorps", label: "Active/Trial Corps" },
  { key: "officers", label: "Officers" },
  { key: "activeOfficers", label: "Active Officers" },
  { key: "superAdmins", label: "Super Admins" },
  { key: "allianceHubContent", label: "Hub Content" },
  { key: "operations", label: "Operations" },
  { key: "srpRequests", label: "SRP Requests" },
  { key: "doctrineFits", label: "Doctrine Fits" },
  { key: "recruitmentApplicants", label: "Recruitment" },
  { key: "lootSplits", label: "Loot Splits" },
  { key: "auditLogEntries", label: "Audit Logs" },
  { key: "eveTypeLookupRows", label: "EVE Type Rows" }
];

export default async function SystemHealthPage() {
  const session = await getCurrentOfficerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.officer.role !== OfficerRole.SUPER_ADMIN) {
    await logOfficerAudit({
      officerId: session.officer.id,
      officerName: session.officer.officerName,
      officerRole: session.officer.role,
      module: "System Health",
      action: "Access Denied",
      targetType: "Route",
      targetName: "/admin/system-health",
      summary: "Non-super-admin officer attempted to view System Health."
    });

    return <AccessDenied />;
  }

  const health = await getSystemHealthData();
  const databaseChecks = health.checks.filter((check) =>
    ["DATABASE_URL configured", "Database connection", "Prisma query check"].includes(check.label)
  );
  const authChecks = health.checks.filter((check) =>
    ["Auth configured", "AUTH_SESSION_SECRET", "AUTH_COOKIE_NAME", "SESSION_DURATION_HOURS"].includes(check.label)
  );
  const environmentChecks = health.checks.filter(
    (check) => !databaseChecks.includes(check) && !authChecks.includes(check)
  );

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Super Admin</div>
        <h1 className="page-title">System Health</h1>
        <p className="page-copy">
          Deployment, auth, and database readiness snapshot for the v2 command
          console. Secrets and raw environment values are intentionally hidden.
        </p>
        <div className="badge-row">
          <Link className="secondary-button" href="/admin/super">
            Back to Super Admin Console
          </Link>
          <form action={logoutAction}>
            <button className="secondary-button" type="submit">
              Logout
            </button>
          </form>
          <span className="badge">Generated {formatDateTime(health.generatedAt)}</span>
        </div>
      </header>

      <HealthSection
        description="Runtime and deployment context."
        title="Environment Status"
        checks={environmentChecks}
      />

      <HealthSection
        description="Database URL presence, connection, and Prisma query check."
        title="Database Status"
        checks={databaseChecks}
      />

      <HealthSection
        description="Session configuration without exposing cookie or secret values."
        title="Auth Status"
        checks={authChecks}
      />

      <section className="section-stack" aria-labelledby="data-counts-title">
        <div className="section-heading">
          <div>
            <h2 className="section-title" id="data-counts-title">
              Data Counts
            </h2>
            <p className="card-copy">
              Basic table counts for registry, module, audit, and lookup data.
            </p>
          </div>
        </div>
        {health.counts ? (
          <div className="status-grid">
            {countCards.map((card) => (
              <div className="status-panel" key={card.key}>
                <div className="status-label">{card.label}</div>
                <div className="status-value">{formatNumber(health.counts?.[card.key] || 0)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="error-state">Database counts are unavailable.</div>
        )}
      </section>

      <WarningsSection warnings={health.warnings} />
      <RecentAuditSection entries={health.recentAudit} />
    </div>
  );
}

function HealthSection({
  title,
  description,
  checks
}: {
  title: string;
  description: string;
  checks: HealthCheck[];
}) {
  return (
    <section className="section-stack" aria-labelledby={`${slugify(title)}-title`}>
      <div className="section-heading">
        <div>
          <h2 className="section-title" id={`${slugify(title)}-title`}>
            {title}
          </h2>
          <p className="card-copy">{description}</p>
        </div>
      </div>
      <div className="data-grid">
        {checks.map((check) => (
          <div className="data-card" key={check.label}>
            <div className="card-heading">
              <h3 className="card-title">{check.label}</h3>
              <StatusBadge status={check.status} />
            </div>
            <p className="card-copy">{check.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WarningsSection({ warnings }: { warnings: HealthWarning[] }) {
  return (
    <section className="section-stack" aria-labelledby="warnings-title">
      <div className="section-heading">
        <div>
          <h2 className="section-title" id="warnings-title">
            Warnings
          </h2>
          <p className="card-copy">
            Items that may need attention before or after production rollout.
          </p>
        </div>
      </div>
      {warnings.length ? (
        <div className="data-grid">
          {warnings.map((warning) => (
            <div className="data-card" key={`${warning.label}-${warning.detail}`}>
              <div className="card-heading">
                <h3 className="card-title">{warning.label}</h3>
                <StatusBadge status="Warning" />
              </div>
              <p className="card-copy">{warning.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="success-state">No warnings detected.</div>
      )}
    </section>
  );
}

function RecentAuditSection({ entries }: { entries: RecentAuditHeartbeat[] }) {
  return (
    <section className="section-stack" aria-labelledby="recent-audit-title">
      <div className="section-heading">
        <div>
          <h2 className="section-title" id="recent-audit-title">
            Recent Audit Heartbeat
          </h2>
          <p className="card-copy">
            Safe recent audit summaries only. Payloads, tokens, cookies, and
            hashes are not rendered.
          </p>
        </div>
      </div>
      {entries.length ? (
        <div className="section-stack">
          {entries.map((entry) => (
            <article className="data-card" key={entry.id}>
              <div className="badge-row">
                <span className="badge">{entry.module || "Unknown Module"}</span>
                <span className="badge">{entry.action || "Unknown Action"}</span>
                <span className="badge">{formatDateTime(entry.createdAt)}</span>
              </div>
              <div className="card-heading">
                <h3 className="card-title">{entry.officerName || "System"}</h3>
              </div>
              <p className="card-copy">{entry.summary || "No summary recorded."}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">No recent audit entries found.</div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: HealthStatus }) {
  return (
    <span className="health-badge" data-status={status}>
      {status}
    </span>
  );
}

function AccessDenied() {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Access</div>
        <h1 className="page-title">Access Denied</h1>
        <p className="page-copy">
          Super Admin access is required to view System Health.
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
