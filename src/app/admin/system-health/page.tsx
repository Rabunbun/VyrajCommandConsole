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
  type SystemHealthData,
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
  { key: "publicJoinApplications", label: "Public Join Apps" },
  { key: "lootSplits", label: "Loot Splits" },
  { key: "auditLogEntries", label: "Audit Logs" },
  { key: "eveTypeLookupRows", label: "EVE Type Rows" },
  { key: "publishedShipTypeLookupRows", label: "Ship Type Rows" }
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

      <EveSsoSection config={health.eveSso} />

      <EveIdentityEnrichmentSection counts={health.counts} />

      <MemberLandingReadinessSection counts={health.counts} />

      <HardLockdownSection counts={health.counts} />

      <CorpEveMappingSection counts={health.counts} />

      <CorpPublicEsiProfileSection counts={health.counts} />

      <EveShipTypeLookupSection counts={health.counts} />

      <SrpAssistReadinessSection counts={health.counts} />

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
                <div className="status-value">
                  {formatNumber(Number(health.counts?.[card.key] || 0))}
                </div>
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

function SrpAssistReadinessSection({
  counts
}: {
  counts: SystemHealthCounts | null;
}) {
  const checks: HealthCheck[] = counts
    ? [
        {
          label: "Cached ship types",
          status: counts.publishedShipTypeLookupRows > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.publishedShipTypeLookupRows)
        },
        {
          label: "Insurance payout cache",
          status: counts.srpInsuranceCachedTypes > 0 ? "OK" : "Warning",
          detail: `${formatNumber(counts.srpInsuranceCachedTypes)} ship type(s) with Platinum payout cached.`
        },
        {
          label: "Last insurance fetch",
          status: counts.srpInsuranceLastFetchedAt ? "OK" : "Warning",
          detail: counts.srpInsuranceLastFetchedAt
            ? formatDateTime(counts.srpInsuranceLastFetchedAt)
            : "Never"
        },
        {
          label: "Insurance fetch failures",
          status: counts.srpInsuranceFailedTypes > 0 ? "Warning" : "OK",
          detail: formatNumber(counts.srpInsuranceFailedTypes)
        },
        {
          label: "Assist success / partial / failed",
          status: counts.srpAssistFailedRequests > 0 ? "Warning" : "OK",
          detail: `${formatNumber(counts.srpAssistSuccessfulRequests)} / ${formatNumber(counts.srpAssistPartialRequests)} / ${formatNumber(counts.srpAssistFailedRequests)}`
        },
        {
          label: "Render-time external calls",
          status: "OK",
          detail: "SRP pages read cached DB rows; killmail and insurance calls run only from server actions."
        }
      ]
    : [
        {
          label: "Smart SRP Assist",
          status: "Error",
          detail: "Database counts are unavailable."
        }
      ];

  return (
    <HealthSection
      checks={checks}
      description="SRP recommendation readiness from cached ship lookup rows, insurance cache, and assist outcomes."
      title="Smart SRP Assist"
    />
  );
}

function EveShipTypeLookupSection({
  counts
}: {
  counts: SystemHealthCounts | null;
}) {
  const checks: HealthCheck[] = counts
    ? [
        {
          label: "Cached ship types",
          status: counts.publishedShipTypeLookupRows > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.publishedShipTypeLookupRows)
        },
        {
          label: "Total EVE type rows",
          status: counts.eveTypeLookupRows > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveTypeLookupRows)
        },
        {
          label: "Last ship type refresh",
          status: counts.lastEveTypeLookupRefreshAt ? "OK" : "Warning",
          detail: counts.lastEveTypeLookupRefreshAt
            ? formatDateTime(counts.lastEveTypeLookupRefreshAt)
            : "Never"
        },
        {
          label: "Lookup freshness",
          status:
            counts.lastEveTypeLookupRefreshAt &&
            isDateWithinDays(counts.lastEveTypeLookupRefreshAt, 30)
              ? "OK"
              : "Warning",
          detail:
            counts.lastEveTypeLookupRefreshAt &&
            isDateWithinDays(counts.lastEveTypeLookupRefreshAt, 30)
              ? "Refreshed within the last 30 days."
              : "Empty or older than 30 days. Run npm.cmd run eve:refresh-ship-types."
        },
        {
          label: "Normal page ESI calls",
          status: "OK",
          detail: "Doctrine pages read cached database rows only."
        }
      ]
    : [
        {
          label: "EVE ship type lookup",
          status: "Error",
          detail: "Database counts are unavailable."
        }
      ];

  return (
    <HealthSection
      checks={checks}
      description="Cached public EVE ship type data for doctrine selectors and image URLs."
      title="EVE Ship Type Lookup"
    />
  );
}

function CorpPublicEsiProfileSection({
  counts
}: {
  counts: SystemHealthCounts | null;
}) {
  const checks: HealthCheck[] = counts
    ? [
        {
          label: "Corps with EVE corporation ID",
          status:
            counts.corpEveCorporationIdsConfigured > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.corpEveCorporationIdsConfigured)
        },
        {
          label: "Public profiles synced",
          status: counts.corpPublicEsiProfilesSynced > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.corpPublicEsiProfilesSynced)
        },
        {
          label: "Stale / never synced",
          status:
            counts.corpPublicEsiProfilesNeverSynced > 0 ? "Warning" : "OK",
          detail: formatNumber(counts.corpPublicEsiProfilesNeverSynced)
        },
        {
          label: "Recent failed refreshes",
          status:
            counts.recentFailedCorpPublicEsiProfileRefreshes > 0
              ? "Warning"
              : "OK",
          detail: formatNumber(counts.recentFailedCorpPublicEsiProfileRefreshes)
        },
        {
          label: "Last successful refresh",
          status: counts.lastSuccessfulCorpPublicEsiSyncAt ? "OK" : "Warning",
          detail: counts.lastSuccessfulCorpPublicEsiSyncAt
            ? formatDateTime(counts.lastSuccessfulCorpPublicEsiSyncAt)
            : "Never"
        }
      ]
    : [
        {
          label: "Public corp ESI profiles",
          status: "Error",
          detail: "Database counts are unavailable."
        }
      ];

  return (
    <HealthSection
      checks={checks}
      description="Stored public EVE corporation profile cache. Public pages read these saved values only."
      title="Corp Public ESI Profiles"
    />
  );
}

function EveIdentityEnrichmentSection({
  counts
}: {
  counts: SystemHealthCounts | null;
}) {
  const checks: HealthCheck[] = counts
    ? [
        {
          label: "EVE identities",
          status: counts.eveIdentities > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveIdentities)
        },
        {
          label: "Identities with corporation ID",
          status:
            counts.eveIdentitiesWithCorporationId > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveIdentitiesWithCorporationId)
        },
        {
          label: "Identities with alliance ID",
          status: counts.eveIdentitiesWithAllianceId > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveIdentitiesWithAllianceId)
        },
        {
          label: "Matched to configured corp",
          status:
            counts.eveIdentitiesMatchedToConfiguredCorp > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveIdentitiesMatchedToConfiguredCorp)
        }
      ]
    : [
        {
          label: "EVE identity enrichment",
          status: "Error",
          detail: "Database counts are unavailable."
        }
      ];

  return (
    <HealthSection
      checks={checks}
      description="Best-effort character corp/alliance enrichment from EVE login. No tokens are stored."
      title="EVE Identity Enrichment"
    />
  );
}

function MemberLandingReadinessSection({
  counts
}: {
  counts: SystemHealthCounts | null;
}) {
  const checks: HealthCheck[] = counts
    ? [
        {
          label: "Verified EVE identities",
          status: counts.eveIdentities > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveIdentities)
        },
        {
          label: "Identities with corporation ID",
          status:
            counts.eveIdentitiesWithCorporationId > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveIdentitiesWithCorporationId)
        },
        {
          label: "Configured corp portals",
          status:
            counts.corpEveCorporationIdsConfigured > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.corpEveCorporationIdsConfigured)
        },
        {
          label: "Identities matched to portals",
          status:
            counts.eveIdentitiesMatchedToConfiguredCorp > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveIdentitiesMatchedToConfiguredCorp)
        },
        {
          label: "Member landing seen",
          status:
            counts.eveIdentitiesWithMemberLandingSeen > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveIdentitiesWithMemberLandingSeen)
        },
        {
          label: "Landing enforcement",
          status: "OK",
          detail: "First-login checkpoint remains available. Corp portal access is enforced by Hard Lockdown."
        }
      ]
    : [
        {
          label: "Member landing readiness",
          status: "Error",
          detail: "Database counts are unavailable."
        }
      ];

  return (
    <HealthSection
      checks={checks}
      description="Identity-aware member checkpoint readiness. EVE membership does not grant officer or admin powers."
      title="Member Landing Readiness"
    />
  );
}

function HardLockdownSection({
  counts
}: {
  counts: SystemHealthCounts | null;
}) {
  const checks: HealthCheck[] = counts
    ? [
        {
          label: "Hard Lockdown",
          status: "OK",
          detail: "Hard Lockdown is enabled across protected pages and server actions."
        },
        {
          label: "Public Alliance Hub",
          status: "OK",
          detail: "Public."
        },
        {
          label: "Corp portals require member match",
          status: "OK",
          detail: "Verified member access requires current EVE corporation ID to match the target corp configuration."
        },
        {
          label: "Configured corp portals",
          status:
            counts.corpEveCorporationIdsConfigured > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.corpEveCorporationIdsConfigured)
        },
        {
          label: "Corps missing EVE corporation IDs",
          status:
            counts.corpMissingEveCorporationId > 0 ? "Warning" : "OK",
          detail: formatNumber(counts.corpMissingEveCorporationId)
        },
        {
          label: "Matched verified identities",
          status:
            counts.eveIdentitiesMatchedToConfiguredCorp > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.eveIdentitiesMatchedToConfiguredCorp)
        },
        {
          label: "Member modules",
          status: "OK",
          detail: "Attendance, Doctrine, and SRP require verified corp access."
        },
        {
          label: "Officer modules",
          status: "OK",
          detail: "Recruitment, Loot Splits, and Corp Dashboard require internal officer permissions."
        },
        {
          label: "Public Join intake",
          status: "OK",
          detail: `${formatNumber(counts.publicJoinApplications)} application(s) received. Applications do not grant access.`
        },
        {
          label: "Manual officer fallback",
          status: "OK",
          detail: "Enabled. Manual officers still use internal sessions and permissions."
        }
      ]
    : [
        {
          label: "Hard Lockdown",
          status: "Error",
          detail: "Database counts are unavailable."
        }
      ];

  return (
    <HealthSection
      checks={checks}
      description="Authoritative route and action policy. EVE membership grants member-level portal access only."
      title="Hard Lockdown"
    />
  );
}

function CorpEveMappingSection({
  counts
}: {
  counts: SystemHealthCounts | null;
}) {
  const checks: HealthCheck[] = counts
    ? [
        {
          label: "Total corps",
          status: counts.corps > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.corps)
        },
        {
          label: "Corps with EVE corporation ID",
          status:
            counts.corpEveCorporationIdsConfigured > 0 ? "OK" : "Warning",
          detail: formatNumber(counts.corpEveCorporationIdsConfigured)
        },
        {
          label: "Corps missing EVE corporation ID",
          status:
            counts.corpMissingEveCorporationId > 0 ? "Warning" : "OK",
          detail: formatNumber(counts.corpMissingEveCorporationId)
        },
        {
          label: "Corps with future sync enabled",
          status: counts.corpEveSyncEnabled > 0 ? "Warning" : "OK",
          detail: `${formatNumber(counts.corpEveSyncEnabled)}. No ESI sync runs in Phase 2A.`
        },
        {
          label: "Sync enabled without corporation ID",
          status:
            counts.corpEveSyncEnabledMissingCorporationId > 0
              ? "Warning"
              : "OK",
          detail: formatNumber(counts.corpEveSyncEnabledMissingCorporationId)
        }
      ]
    : [
        {
          label: "Corp EVE mapping",
          status: "Error",
          detail: "Database counts are unavailable."
        }
      ];

  return (
    <HealthSection
      checks={checks}
      description="Manual corp-to-EVE identity mapping readiness. No ESI calls are made."
      title="Corp EVE Mapping"
    />
  );
}

function EveSsoSection({ config }: { config: SystemHealthData["eveSso"] }) {
  const scopes = config.scopes.length
    ? config.scopes.join(", ")
    : "No scopes configured. Scopes are optional until OAuth routes are implemented.";

  const checks: HealthCheck[] = [
    ...config.variables.map((variable) => ({
      label: variable.name,
      status: variable.present
        ? "OK" as const
        : variable.required
          ? "Not configured" as const
          : "Warning" as const,
      detail: variable.present
        ? "Present. Value is hidden."
        : variable.required
          ? "Missing. Required before EVE OAuth can be enabled."
          : "Missing. Optional for Phase 1B readiness."
    })),
    {
      label: "EVE SSO config readiness",
      status: config.configured ? "OK" : "Not configured",
      detail: config.configured
        ? "Required EVE SSO environment variables are present. Identity-only EVE login is available."
        : "Required EVE SSO environment variables are missing. Login remains disabled."
    },
    {
      label: "Callback URL",
      status: config.callbackConfigured ? "OK" : "Not configured",
      detail: config.callbackConfigured
        ? "Configured. The EVE developer app callback must match the hidden EVE_SSO_CALLBACK_URL value exactly."
        : "Missing EVE_SSO_CALLBACK_URL. The EVE developer app callback must match this future value exactly."
    },
    {
      label: "Scopes",
      status: config.scopesConfigured ? "OK" : "Warning",
      detail: scopes
    },
    {
      label: "SSO base URL",
      status: config.ssoBaseUrlConfigured ? "OK" : "Warning",
      detail: config.ssoBaseUrlStatus === "configured" ? "Configured." : "Using default EVE SSO base URL."
    },
    {
      label: "ESI base URL",
      status: config.esiBaseUrlConfigured ? "OK" : "Warning",
      detail: config.esiBaseUrlStatus === "configured" ? "Configured." : "Using default ESI base URL."
    },
    {
      label: "Compatibility date",
      status: config.compatibilityDateConfigured ? "OK" : "Warning",
      detail: config.compatibilityDateConfigured ? "Configured." : "Not configured yet."
    },
    {
      label: "Token storage",
      status: "Not configured",
      detail: "Not enabled. No EVE access or refresh tokens are stored."
    },
    {
      label: "OAuth routes",
      status: config.oauthRoutesImplemented ? "OK" : "Not configured",
      detail: config.oauthRoutesImplemented
        ? "Implemented for identity-only EVE SSO."
        : "Not implemented."
    },
    {
      label: "ESI sync",
      status: "Not configured",
      detail: config.esiSyncEnabled
        ? "Enabled."
        : "Not enabled. No background ESI sync or corp stats sync exists."
    },
    {
      label: "EVE login enabled",
      status: config.eveLoginEnabled ? "OK" : "Not configured",
      detail: config.eveLoginEnabled
        ? "Yes. Login with EVE is available for identity verification only."
        : "No. Complete required EVE SSO configuration before enabling Login with EVE."
    }
  ];

  return (
    <section className="section-stack" aria-labelledby="eve-sso-status-title">
      <div className="section-heading">
        <div>
          <h2 className="section-title" id="eve-sso-status-title">
            EVE SSO Status
          </h2>
          <p className="card-copy">
            Future EVE SSO readiness without exposing client secrets, callback
            values, tokens, or auth codes.
          </p>
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
      <div className="empty-state">
        The callback URL configured in the EVE developer app must match
        EVE_SSO_CALLBACK_URL exactly. In production, use the Vercel domain. In
        local development, use localhost only if the EVE app allows it, or use a
        separate development EVE app.
      </div>
    </section>
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

function isDateWithinDays(value: string, days: number) {
  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return false;
  }

  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
