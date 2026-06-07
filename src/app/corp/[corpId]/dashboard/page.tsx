import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getCorpDashboardPageData,
  type DashboardCorpView,
  type DashboardListItem,
  type DashboardSummaryCard
} from "@/lib/modules/dashboard";
import { formatStatusLabel } from "@/lib/public-data";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  params: Promise<{
    corpId: string;
  }>;
};

export default async function CorpDashboardPage({ params }: DashboardPageProps) {
  const { corpId } = await params;
  const corpSlug = decodeURIComponent(corpId);
  const session = await getCurrentOfficerSession();

  if (!session) {
    redirect("/login");
  }

  const result = await getCorpDashboardPageData(corpSlug, session);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "access_denied") {
    return (
      <UnavailableState
        eyebrow="Access"
        message={result.message}
        title="Dashboard Access Denied"
      />
    );
  }

  if (result.status === "module_disabled") {
    return (
      <UnavailableState
        corp={result.corp}
        eyebrow="Module Disabled"
        message={result.message}
        title="Corp Dashboard Disabled"
      />
    );
  }

  return (
    <div className="page-stack">
      <DashboardHeader corp={result.corp} accessMode={result.accessMode} />

      <section className="status-grid" aria-label="Corp dashboard summaries">
        {result.summaries.map((summary) => (
          <SummaryPanel key={summary.label} summary={summary} />
        ))}
      </section>

      <QuickLinks corp={result.corp} />

      <section className="section-stack" aria-label="Corp dashboard watchlists">
        <Watchlist
          emptyText="No operations found."
          items={result.operations}
          title="Upcoming / Active Operations"
        />
        <Watchlist
          emptyText="No pending SRP."
          items={result.pendingSrp}
          title="Pending SRP"
        />
        <Watchlist
          emptyText="No recruitment applicants in pipeline."
          items={result.recruitmentPipeline}
          title="Recruitment Pipeline"
        />
        <Watchlist
          emptyText="No doctrine readiness data."
          items={result.doctrineReadiness}
          title="Doctrine Readiness"
        />
        <Watchlist
          emptyText="No loot payouts waiting."
          items={result.lootPayouts}
          title="Loot Payouts Waiting"
        />
      </section>
    </div>
  );
}

function DashboardHeader({
  accessMode,
  corp
}: {
  accessMode: string;
  corp: DashboardCorpView;
}) {
  return (
    <header className="page-heading">
      <div className="eyebrow">Officer Module</div>
      <h1 className="page-title">Corp Dashboard</h1>
      <p className="page-copy">
        Corp-scoped operational summary for {corp.name}. All counts and queues
        are limited to this corp.
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
  corp?: DashboardCorpView;
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

function SummaryPanel({ summary }: { summary: DashboardSummaryCard }) {
  return (
    <div className="status-panel">
      <div className="status-label">{summary.label}</div>
      <div className="status-value">{summary.value}</div>
      <p className="card-copy">{summary.detail}</p>
    </div>
  );
}

function QuickLinks({ corp }: { corp: DashboardCorpView }) {
  const links = [
    { title: "Attendance", href: "attendance" },
    { title: "Doctrine", href: "doctrine" },
    { title: "SRP", href: "srp" },
    { title: "Recruitment", href: "recruitment" },
    { title: "Loot Splits", href: "loot-splits" }
  ];

  return (
    <section className="section-stack" aria-label="Quick links">
      <h2 className="section-title">Quick Links</h2>
      <div className="badge-row">
        {links.map((link) => (
          <Link
            className="secondary-button"
            href={`/corp/${corp.slug}/${link.href}`}
            key={link.href}
          >
            {link.title}
          </Link>
        ))}
      </div>
    </section>
  );
}

function Watchlist({
  emptyText,
  items,
  title
}: {
  emptyText: string;
  items: DashboardListItem[];
  title: string;
}) {
  return (
    <section className="section-stack" aria-labelledby={`${title}-title`}>
      <div className="section-heading">
        <h2 className="section-title" id={`${title}-title`}>
          {title}
        </h2>
        <span className="badge">{items.length}</span>
      </div>
      {items.length ? (
        <div className="module-list">
          {items.map((item) => (
            <Link
              className="data-card"
              href={item.href || "#"}
              key={item.id}
            >
              <div className="card-heading">
                <h3 className="card-title">{item.title}</h3>
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

function formatSubtitle(value: string) {
  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  return value;
}
