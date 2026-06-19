import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CorpAccessDenied } from "@/components/corp-access-denied";
import { getCorpPortalAccessContext } from "@/lib/corp-portal-access";
import { canViewCorpDashboard } from "@/lib/modules/dashboard";
import { canManageLootSplits } from "@/lib/modules/loot-splits";
import { canReviewRecruitment } from "@/lib/modules/recruitment";
import {
  formatStatusLabel,
  getPublicCorpPortalData,
  type PublicCorpPortal
} from "@/lib/public-data";
import { buildLoginPath } from "@/lib/route-policy";
import { getCurrentOfficerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type CorpPortalPageProps = {
  params: Promise<{
    corpId: string;
  }>;
};

export default async function CorpPortalPage({ params }: CorpPortalPageProps) {
  const { corpId } = await params;
  const corpSlug = decodeURIComponent(corpId);
  const result = await loadCorpPortal(corpSlug);

  if (result.status === "error") {
    return (
      <div className="page-stack">
        <header className="page-heading">
          <div className="eyebrow">Public Corp Portal</div>
          <h1 className="page-title">Corp Portal</h1>
        </header>
        <div className="error-state">{result.message}</div>
      </div>
    );
  }

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "access_denied") {
    return (
      <div className="page-stack">
        <header className="page-heading">
          <div className="eyebrow">Access</div>
          <h1 className="page-title">Corp Portal Unavailable</h1>
          <p className="page-copy">This corp is not available for public viewing.</p>
        </header>
        <Link className="nav-link" href="/">
          Return to Alliance Hub
        </Link>
      </div>
    );
  }

  const session = await getCurrentOfficerSession();
  const access = await getCorpPortalAccessContext(corpSlug, { session });

  if (!access.allowed) {
    if (access.loginRequired) {
      redirect(buildLoginPath(`/corp/${corpSlug}`));
    }

    return <CorpAccessDenied access={access} returnTo={`/corp/${corpSlug}`} />;
  }

  return <CorpPortal corp={result.corp} session={session} />;
}

async function loadCorpPortal(corpSlug: string) {
  try {
    return await getPublicCorpPortalData(corpSlug);
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? `Could not load corp portal data: ${error.message}`
          : "Could not load corp portal data."
    };
  }
}

const memberModules = [
  {
    key: "attendance",
    title: "Op Attendance",
    href: "attendance",
    summary: "View operations and record fleet attendance."
  },
  {
    key: "doctrine",
    title: "Doctrine Readiness",
    href: "doctrine",
    summary: "Review doctrine fits and readiness requirements."
  },
  {
    key: "srp",
    title: "SRP Requests",
    href: "srp",
    summary: "Submit and track ship replacement requests."
  }
] as const;

function CorpPortal({
  corp,
  session
}: {
  corp: PublicCorpPortal;
  session: Awaited<ReturnType<typeof getCurrentOfficerSession>>;
}) {
  const enabledMemberModules = memberModules.filter(
    (module) => corp.enabledModules[module.key]
  );

  return (
    <CorpPortalContent
      corp={corp}
      enabledMemberModules={enabledMemberModules}
      session={session}
    />
  );
}

function CorpPortalContent({
  corp,
  enabledMemberModules,
  session
}: {
  corp: PublicCorpPortal;
  enabledMemberModules: typeof memberModules[number][];
  session: Awaited<ReturnType<typeof getCurrentOfficerSession>>;
}) {
  const showDashboard =
    corp.enabledModules.dashboard && canViewCorpDashboard(session, corp.id);
  const showRecruitment =
    corp.enabledModules.recruitment && canReviewRecruitment(session, corp.id);
  const showLootSplits =
    corp.enabledModules.lootSplits && canManageLootSplits(session, corp.id);
  const officerModules = [
    showDashboard
      ? {
          title: "Corp Dashboard",
          href: "dashboard",
          summary: "Review corp-scoped module summaries and watchlists."
        }
      : null,
    showRecruitment
      ? {
          title: "Recruitment Review",
          href: "recruitment",
          summary: "Review applicants and track recruitment pipeline status."
        }
      : null,
    showLootSplits
      ? {
          title: "Loot Split Calculation",
          href: "loot-splits",
          summary: "Calculate loot split payouts and track payout status."
        }
      : null
  ].filter((module): module is { title: string; href: string; summary: string } =>
    Boolean(module)
  );

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div className="eyebrow">Vyraj Alliance</div>
        <h1 className="page-title">{corp.name} Portal</h1>
        <p className="page-copy">{corp.description}</p>
        <div className="badge-row">
          <Link className="secondary-button" href="/">
            Alliance Hub
          </Link>
          <span className="badge">{corp.ticker}</span>
          <span className="badge">{formatStatusLabel(corp.status)}</span>
          <span className="badge">Recruitment {corp.recruitmentStatus}</span>
        </div>
      </header>

      <section className="section-stack" aria-labelledby="eve-identity-title">
        <div className="section-heading">
          <div>
            <h2 className="section-title" id="eve-identity-title">
              EVE Identity
            </h2>
            <p className="card-copy">
              Manual registry mapping for future ESI phases. No live ESI sync
              runs from this panel.
            </p>
          </div>
          <span className="badge">{getEveIdentityStatus(corp)}</span>
        </div>
        {corp.eveIdentity?.eveCorporationId ? (
          <div className="status-grid">
            <Metric
              label="EVE Corp"
              value={formatNamedId(
                corp.eveIdentity.eveCorporationName,
                corp.eveIdentity.eveCorporationId
              )}
            />
            <Metric
              label="EVE Alliance"
              value={formatNamedId(
                corp.eveIdentity.eveAllianceName,
                corp.eveIdentity.eveAllianceId
              )}
            />
            <Metric
              label="Sync Status"
              value={corp.eveIdentity.syncEnabled ? "Stored for future sync" : "Sync disabled"}
            />
          </div>
        ) : (
          <div className="empty-state">No EVE corporation identity configured.</div>
        )}
      </section>

      <section className="section-stack" aria-labelledby="announcements-title">
        <h2 className="section-title" id="announcements-title">
          Corp Announcements
        </h2>
        {corp.announcements.length ? (
          <div className="announcement-list">
            {corp.announcements.map((announcement) => (
              <article className="data-card" key={announcement}>
                <p className="card-copy">{announcement}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">No corp announcements posted.</div>
        )}
      </section>

      <section className="section-stack" aria-labelledby="member-modules-title">
        <h2 className="section-title" id="member-modules-title">
          Member Command Modules
        </h2>
        {enabledMemberModules.length ? (
          <div className="module-list">
            {enabledMemberModules.map((module) => (
              <Link
                className="data-card"
                href={`/corp/${corp.slug}/${module.href}`}
                key={module.key}
              >
                <div className="card-heading">
                  <h3 className="card-title">{module.title}</h3>
                  <div className="card-subtitle">{corp.ticker}</div>
                </div>
                <p className="card-copy">{module.summary}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">No member modules enabled.</div>
        )}
      </section>

      {officerModules.length ? (
        <section className="section-stack" aria-labelledby="officer-modules-title">
          <h2 className="section-title" id="officer-modules-title">
            Officer Command Modules
          </h2>
          <div className="module-list">
            {officerModules.map((module) => (
              <Link
                className="data-card"
                href={`/corp/${corp.slug}/${module.href}`}
                key={module.href}
              >
                <div className="card-heading">
                  <h3 className="card-title">{module.title}</h3>
                  <div className="card-subtitle">{corp.ticker}</div>
                </div>
                <p className="card-copy">{module.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="status-panel">
      <div className="status-label">{label}</div>
      <div className="status-value">{value}</div>
    </div>
  );
}

function getEveIdentityStatus(corp: PublicCorpPortal) {
  if (!corp.eveIdentity?.eveCorporationId) {
    return "Not configured";
  }

  return corp.eveIdentity.syncEnabled ? "Configured / sync flag on" : "Configured / sync disabled";
}

function formatNamedId(name: string, id: string | null) {
  if (name && id) {
    return `${name} (${id})`;
  }

  return name || id || "Unknown";
}
