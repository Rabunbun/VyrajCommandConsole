import Link from "next/link";
import {
  getAuthenticatedAllianceHubSummary,
  type AllianceAuditPreviewItem,
  type AllianceCorpSummary,
  type AllianceDashboardData,
  type AllianceQueueItem,
  type AllianceSummaryCard
} from "@/lib/modules/alliance-dashboard";
import {
  formatStatusLabel,
  getPublicAllianceHubData,
  type PublicCorpCard
} from "@/lib/public-data";
import { isSuperAdminSession, getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AllianceHubPage() {
  try {
    const [data, session] = await Promise.all([
      getPublicAllianceHubData(),
      getCurrentOfficerSession()
    ]);
    const allianceSummary = await getAuthenticatedAllianceHubSummary(session);

    return (
      <div className="page-stack">
        <header className="page-heading">
          <div className="eyebrow">Alliance Operations</div>
          <h1 className="page-title">Vyraj Alliance Hub</h1>
          <p className="page-copy">
            Alliance-wide command view for corp portals, operational queues,
            readiness, SRP, recruitment, and payouts.
          </p>
        </header>

        {allianceSummary ? (
          <AllianceDashboardSection
            data={allianceSummary}
            showAdminLinks={isSuperAdminSession(session)}
          />
        ) : null}

        <section className="section-stack" aria-labelledby="hub-content-title">
          <div className="section-heading">
            <h2 className="section-title" id="hub-content-title">
              Alliance Announcements
            </h2>
          </div>
          {data.content.length ? (
            <div className="announcement-list">
              {data.content.map((item) => (
                <article className="data-card" key={item.id}>
                  <div className="badge-row">
                    <span className="badge">{formatStatusLabel(item.contentType)}</span>
                    <span className="badge">{formatStatusLabel(item.priority)}</span>
                  </div>
                  <div className="card-heading">
                    <h3 className="card-title">{item.title}</h3>
                    <div className="card-subtitle">
                      {new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium"
                      }).format(new Date(item.createdAt))}
                    </div>
                  </div>
                  <p className="card-copy">{item.body}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No public announcements available.</div>
          )}
        </section>

        <section
          className="section-stack"
          id="corp-directory"
          aria-labelledby="corps-title"
        >
          <div className="section-heading">
            <h2 className="section-title" id="corps-title">
              Corp Directory
            </h2>
            <span className="badge">Public Registry</span>
          </div>
          {data.corps.length ? (
            <div className="data-grid">
              {data.corps.map((corp) => (
                <CorpCard corp={corp} key={corp.slug} />
              ))}
            </div>
          ) : (
            <div className="empty-state">No active corps available.</div>
          )}
        </section>
      </div>
    );
  } catch (error) {
    return (
      <div className="page-stack">
        <header className="page-heading">
          <div className="eyebrow">Alliance Operations</div>
          <h1 className="page-title">Alliance Hub</h1>
        </header>
        <div className="error-state">
          {error instanceof Error
            ? `Could not load Alliance Hub data: ${error.message}`
            : "Could not load Alliance Hub data."}
        </div>
      </div>
    );
  }
}

function AllianceDashboardSection({
  data,
  showAdminLinks
}: {
  data: AllianceDashboardData;
  showAdminLinks: boolean;
}) {
  return (
    <section className="section-stack" aria-labelledby="alliance-dashboard-title">
      <header className="section-heading">
        <div>
          <h2 className="section-title" id="alliance-dashboard-title">
            Alliance Operations
          </h2>
          <p className="card-copy">
            Live alliance-wide summaries and queues for authorized officers.
          </p>
        </div>
        <span className="badge">{data.accessMode}</span>
      </header>

      {showAdminLinks ? (
        <div className="badge-row" aria-label="Super Admin quick links">
          <Link className="secondary-button" href="/admin/super">
            Super Admin Console
          </Link>
          <Link className="secondary-button" href="/admin/audit-log">
            Audit Log
          </Link>
          <Link className="secondary-button" href="/admin/corps">
            Corp Management
          </Link>
        </div>
      ) : null}

      <div className="status-grid" aria-label="Alliance totals">
        {data.summaries.map((summary) => (
          <AllianceSummaryPanel key={summary.label} summary={summary} />
        ))}
      </div>

      <div className="section-stack" aria-label="Alliance queues">
        <AllianceQueue
          emptyText="No upcoming operations."
          items={data.operations}
          title="Upcoming / Active Operations"
        />
        <AllianceQueue
          emptyText="No pending SRP."
          items={data.pendingSrp}
          title="Pending SRP"
        />
        <AllianceQueue
          emptyText="No recruitment pipeline items."
          items={data.recruitmentPipeline}
          title="Recruitment Pipeline"
        />
        <AllianceQueue
          emptyText="No doctrine readiness data."
          items={data.doctrineReadiness}
          title="Doctrine Readiness Watchlist"
        />
        <AllianceQueue
          emptyText="No loot payouts waiting."
          items={data.lootPayouts}
          title="Loot Payouts Waiting"
        />
        {showAdminLinks ? <AuditPreview items={data.auditPreview} /> : null}
      </div>

      <section className="section-stack" aria-labelledby="corp-summaries-title">
        <div className="section-heading">
          <h3 className="section-title" id="corp-summaries-title">
            Corp Summaries
          </h3>
          <span className="badge">{data.corpSummaries.length}</span>
        </div>
        {data.corpSummaries.length ? (
          <div className="data-grid">
            {data.corpSummaries.map((corp) => (
              <AllianceCorpSummaryCard corp={corp} key={corp.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state">No active corps available.</div>
        )}
      </section>
    </section>
  );
}

function AllianceSummaryPanel({ summary }: { summary: AllianceSummaryCard }) {
  return (
    <div className="status-panel">
      <div className="status-label">{summary.label}</div>
      <div className="status-value">{summary.value}</div>
      <p className="card-copy">{summary.detail}</p>
    </div>
  );
}

function AllianceQueue({
  emptyText,
  items,
  title
}: {
  emptyText: string;
  items: AllianceQueueItem[];
  title: string;
}) {
  const titleId = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <section className="section-stack" aria-labelledby={titleId}>
      <div className="section-heading">
        <h3 className="section-title" id={titleId}>
          {title}
        </h3>
        <span className="badge">{items.length}</span>
      </div>
      {items.length ? (
        <div className="module-list">
          {items.map((item) => (
            <Link className="data-card" href={item.href} key={item.id}>
              <div className="card-heading">
                <h4 className="card-title">{item.title}</h4>
                <div className="card-subtitle">{formatSubtitle(item.subtitle)}</div>
              </div>
              <div className="badge-row">
                <span className="badge">{formatStatusLabel(item.badge)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">{emptyText}</div>
      )}
    </section>
  );
}

function AllianceCorpSummaryCard({ corp }: { corp: AllianceCorpSummary }) {
  return (
    <article className="data-card">
      <div className="card-heading">
        <h3 className="card-title">{corp.name}</h3>
        <div className="card-subtitle">{corp.ticker}</div>
      </div>
      <div className="badge-row">
        <span className="badge">{formatStatusLabel(corp.status)}</span>
      </div>
      <div className="metric-grid">
        <Metric label="Ops" value={corp.activeOperations} />
        <Metric label="SRP" value={corp.pendingSrp} />
        <Metric label="Recruiting" value={corp.recruitmentPipeline} />
        <Metric label="Doctrine" value={corp.activeDoctrineFits} />
        <Metric label="Loot" value={corp.lootSplitsWaiting} />
      </div>
      <div className="badge-row">
        <Link className="secondary-button" href={corp.portalHref}>
          Corp Portal
        </Link>
        {corp.dashboardHref ? (
          <Link className="secondary-button" href={corp.dashboardHref}>
            Dashboard
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function AuditPreview({ items }: { items: AllianceAuditPreviewItem[] }) {
  return (
    <section className="section-stack" aria-labelledby="audit-preview-title">
      <div className="section-heading">
        <h3 className="section-title" id="audit-preview-title">
          Recent Admin Activity
        </h3>
        <span className="badge">{items.length}</span>
      </div>
      {items.length ? (
        <div className="module-list">
          {items.map((item) => (
            <article className="data-card" key={item.id}>
              <div className="card-heading">
                <h4 className="card-title">{item.title}</h4>
                <div className="card-subtitle">{formatSubtitle(item.subtitle)}</div>
              </div>
              <div className="badge-row">
                <span className="badge">{formatStatusLabel(item.badge)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">No recent admin activity.</div>
      )}
    </section>
  );
}

function CorpCard({ corp }: { corp: PublicCorpCard }) {
  const profile = corp.eveIdentity;
  const displayName = profile?.eveCorporationName || corp.name;
  const displayTicker = profile?.eveTicker || corp.ticker;

  return (
    <Link className="data-card" href={`/corp/${corp.slug}`}>
      <div className="card-heading">
        <h3 className="card-title">{displayName}</h3>
        <div className="card-subtitle">{displayTicker}</div>
      </div>
      <p className="card-copy">{corp.description}</p>
      <div className="badge-row">
        {corp.eveIdentity?.eveCorporationId ? (
          <span className="eve-linked-badge">
            EVE-linked
          </span>
        ) : null}
        <span className="badge">{formatStatusLabel(corp.status)}</span>
        <span className="badge">{corp.recruitmentStatus}</span>
      </div>
      <div className="metric-grid">
        <Metric label="CEO" value={profile?.ceoName || "Unknown"} />
        <Metric
          label="Members"
          value={
            profile?.memberCount !== null && profile?.memberCount !== undefined
              ? formatNumber(profile.memberCount)
              : "Not synced"
          }
        />
        <Metric label="Tax Rate" value={formatTaxRate(profile?.taxRate ?? null)} />
        <Metric
          label="Founded"
          value={profile?.creationDate ? formatDate(profile.creationDate) : "Unknown"}
        />
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function formatSubtitle(value: string) {
  const parts = value.split(" / ");
  const maybeDate = parts[parts.length - 1];
  const date = new Date(maybeDate);

  if (!Number.isNaN(date.getTime())) {
    return [
      ...parts.slice(0, -1),
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date)
    ].join(" / ");
  }

  return value;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTaxRate(value: number | null) {
  if (value === null) {
    return "Unknown";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    style: "percent"
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(value));
}
